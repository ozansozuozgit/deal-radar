-- Typical prices per product AND basis. The single row per product used the product's
-- most common basis, which for 134 of 176 products was 'ea' (flyers with no size), so
-- per-gallon milk or per-lb chicken never matched it. Liquids are compared per gallon.

alter table price_stats drop constraint if exists price_stats_pkey;
alter table price_stats add primary key (canonical, basis);

create or replace function refresh_price_stats() returns void
language sql security definer as $$
  -- comparable price for deals that lack one, a batch at a time (ingest fills new deals)
  update deals set
    cmp_basis = case
      when unit = 'lb' then 'lb'
      when size_unit in ('lb', 'oz') and size_qty > 0 then 'lb'
      when size_unit in ('floz', 'l') and size_qty > 0 then 'gal'
      when size_unit = 'ct' and size_qty > 0 then 'ct'
      else 'ea' end,
    cmp_price = round(case
      when unit = 'lb' then price
      when size_unit = 'lb' and size_qty > 0 then price / size_qty
      when size_unit = 'oz' and size_qty > 0 then price / size_qty * 16
      when size_unit = 'floz' and size_qty > 0 then price / size_qty * 128
      when size_unit = 'l' and size_qty > 0 then price / size_qty * 3.785
      when size_unit = 'ct' and size_qty > 0 then price / size_qty
      else price end, 2)
  where id in (
    select id from deals
    where cmp_price is null and price > 0
    order by id desc
    limit 20000
  );

  -- one sample per product, basis, store and week over the last six months
  with weekly as (
    select canonical, cmp_basis as basis, merchant_slug,
           date_trunc('week', coalesce(valid_from, first_seen)) as wk, min(cmp_price) as cmp
    from deals
    where canonical is not null and cmp_price is not null
      and coalesce(valid_from, first_seen) > now() - interval '182 days'
    group by 1, 2, 3, 4
  ),
  stats as (
    select canonical, basis,
           percentile_cont(0.5) within group (order by cmp) as median,
           percentile_cont(0.25) within group (order by cmp) as p25,
           min(cmp) as low, count(*) as samples, count(distinct merchant_slug) as stores,
           max(wk) as last_sale
    from weekly group by canonical, basis
  ),
  gaps as (
    select canonical, basis, extract(epoch from wk - lag(wk) over (partition by canonical, basis, merchant_slug order by wk)) / 86400 as gap
    from weekly
  ),
  cycles as (
    select canonical, basis, percentile_cont(0.5) within group (order by gap) as cycle_days
    from gaps where gap is not null and gap > 0 group by canonical, basis
  )
  insert into price_stats (canonical, basis, median, p25, low, samples, stores, cycle_days, last_sale, updated_at)
  select s.canonical, s.basis, round(s.median::numeric, 2), round(s.p25::numeric, 2), s.low, s.samples, s.stores,
         round(c.cycle_days::numeric), s.last_sale, now()
  from stats s left join cycles c using (canonical, basis)
  on conflict (canonical, basis) do update set
    median = excluded.median, p25 = excluded.p25, low = excluded.low,
    samples = excluded.samples, stores = excluded.stores, cycle_days = excluded.cycle_days,
    last_sale = excluded.last_sale, updated_at = excluded.updated_at;

  -- verdicts for running and upcoming deals against their own basis; needs a month of history
  update deals d set
    typical_price = ps.median,
    price_verdict = case
      when ps.samples < 4 then null
      when d.cmp_price <= ps.p25 then 'great'
      when d.cmp_price > ps.median * 1.1 then 'weak'
      else 'typical' end
  from price_stats ps
  where d.canonical = ps.canonical and d.cmp_basis = ps.basis and d.cmp_price is not null
    and coalesce(d.valid_to, now()) >= now();

  -- running deals whose product has no history on their basis keep no stale verdict
  update deals d set typical_price = null, price_verdict = null
  where coalesce(d.valid_to, now()) >= now()
    and (d.typical_price is not null or d.price_verdict is not null)
    and not exists (select 1 from price_stats ps where ps.canonical = d.canonical and ps.basis = d.cmp_basis);
$$;

select refresh_price_stats();
