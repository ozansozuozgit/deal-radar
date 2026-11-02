-- refresh_price_stats filled cmp_price for every deal that lacked one in a single
-- statement. The first run after the 2026-10-28 migration has ~89k rows to fill and
-- hits the statement timeout, which rolls back the whole function. Fill at most 20k
-- rows per run, newest first so running deals get verdicts right away; the backlog
-- clears over a few runs and after that each run only sees the day's new deals.

create index if not exists deals_cmp_todo_idx on deals (id) where cmp_price is null and price > 0;

create or replace function refresh_price_stats() returns void
language sql security definer as $$
  -- comparable price for deals that lack one, a batch at a time
  update deals set
    cmp_basis = case
      when unit = 'lb' then 'lb'
      when size_unit in ('lb', 'oz') and size_qty > 0 then 'lb'
      when size_unit = 'ct' and size_qty > 0 then 'ct'
      else 'ea' end,
    cmp_price = round(case
      when unit = 'lb' then price
      when size_unit = 'lb' and size_qty > 0 then price / size_qty
      when size_unit = 'oz' and size_qty > 0 then price / size_qty * 16
      when size_unit = 'ct' and size_qty > 0 then price / size_qty
      else price end, 2)
  where id in (
    select id from deals
    where cmp_price is null and price > 0
    order by id desc
    limit 20000
  );

  -- one sample per product, store and week, on the product's most common basis,
  -- over the last six months
  with samples as (
    select canonical, merchant_slug, cmp_basis as basis, cmp_price as cmp,
           date_trunc('week', coalesce(valid_from, first_seen)) as wk
    from deals
    where canonical is not null and cmp_price is not null
      and coalesce(valid_from, first_seen) > now() - interval '182 days'
  ),
  basis_pick as (
    select distinct on (canonical) canonical, basis
    from samples group by canonical, basis order by canonical, count(*) desc
  ),
  weekly as (
    select s.canonical, s.basis, s.merchant_slug, s.wk, min(s.cmp) as cmp
    from samples s join basis_pick b on b.canonical = s.canonical and b.basis = s.basis
    group by 1, 2, 3, 4
  ),
  stats as (
    select canonical, min(basis) as basis,
           percentile_cont(0.5) within group (order by cmp) as median,
           percentile_cont(0.25) within group (order by cmp) as p25,
           min(cmp) as low, count(*) as samples, count(distinct merchant_slug) as stores,
           max(wk) as last_sale
    from weekly group by canonical
  ),
  gaps as (
    select canonical, extract(epoch from wk - lag(wk) over (partition by canonical, merchant_slug order by wk)) / 86400 as gap
    from weekly
  ),
  cycles as (
    select canonical, percentile_cont(0.5) within group (order by gap) as cycle_days
    from gaps where gap is not null and gap > 0 group by canonical
  )
  insert into price_stats (canonical, basis, median, p25, low, samples, stores, cycle_days, last_sale, updated_at)
  select s.canonical, s.basis, round(s.median::numeric, 2), round(s.p25::numeric, 2), s.low, s.samples, s.stores,
         round(c.cycle_days::numeric), s.last_sale, now()
  from stats s left join cycles c using (canonical)
  on conflict (canonical) do update set
    basis = excluded.basis, median = excluded.median, p25 = excluded.p25, low = excluded.low,
    samples = excluded.samples, stores = excluded.stores, cycle_days = excluded.cycle_days,
    last_sale = excluded.last_sale, updated_at = excluded.updated_at;

  -- verdicts for running and upcoming deals; needs a month of history to judge
  update deals d set
    typical_price = ps.median,
    price_verdict = case
      when ps.samples < 4 or d.cmp_basis <> ps.basis then null
      when d.cmp_price <= ps.p25 then 'great'
      when d.cmp_price > ps.median * 1.1 then 'weak'
      else 'typical' end
  from price_stats ps
  where d.canonical = ps.canonical and d.cmp_price is not null
    and coalesce(d.valid_to, now()) >= now();
$$;
