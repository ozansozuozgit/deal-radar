-- refresh_history_flags rewrote every priced deal (~90k rows by Nov 2026) on each
-- ingest and started hitting the statement timeout. Only running and upcoming deals
-- are ever shown, so only those need flags; history is still read from every row.

create index if not exists deals_name_store_idx
  on deals (normalized_name, merchant_slug) where price is not null;

create or replace function refresh_history_flags() returns void
language sql security definer as $$
  with live as (
    select distinct normalized_name, merchant_slug
    from deals
    where price is not null and valid_to >= now() - interval '1 day'
  ), h as (
    select d.normalized_name, d.merchant_slug,
           min(d.price) as minp,
           count(distinct d.valid_from) as weeks
    from deals d
    join live l using (normalized_name, merchant_slug)
    where d.price is not null
    group by d.normalized_name, d.merchant_slug
  )
  update deals d set
    hist_min_price = h.minp,
    hist_weeks = h.weeks
  from h
  where d.normalized_name = h.normalized_name
    and d.merchant_slug = h.merchant_slug
    and d.price is not null
    and d.valid_to >= now() - interval '1 day'
    and (d.hist_min_price is distinct from h.minp or d.hist_weeks is distinct from h.weeks);
$$;
