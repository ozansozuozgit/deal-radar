-- "Lowest price here" fired for prices that never changed (379 of 592 badges on
-- 2026-11-01), and "in N weeks" counted sales, not weeks. Keep the highest price and
-- the first sale date too, so the badge only shows after a higher price and can say
-- "since <date>".

alter table deals
  add column if not exists hist_max_price numeric,
  add column if not exists hist_since timestamptz;

create or replace function refresh_history_flags() returns void
language sql security definer as $$
  with live as (
    select distinct normalized_name, merchant_slug
    from deals
    where price is not null and valid_to >= now() - interval '1 day'
  ), h as (
    select d.normalized_name, d.merchant_slug,
           min(d.price) as minp,
           max(d.price) as maxp,
           min(d.valid_from) as since,
           count(distinct d.valid_from) as weeks
    from deals d
    join live l using (normalized_name, merchant_slug)
    where d.price is not null
    group by d.normalized_name, d.merchant_slug
  )
  update deals d set
    hist_min_price = h.minp,
    hist_max_price = h.maxp,
    hist_since = h.since,
    hist_weeks = h.weeks
  from h
  where d.normalized_name = h.normalized_name
    and d.merchant_slug = h.merchant_slug
    and d.price is not null
    and d.valid_to >= now() - interval '1 day'
    and (d.hist_min_price is distinct from h.minp or d.hist_max_price is distinct from h.maxp
      or d.hist_since is distinct from h.since or d.hist_weeks is distinct from h.weeks);
$$;
