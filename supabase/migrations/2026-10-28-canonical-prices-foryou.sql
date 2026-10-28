-- Canonical products, cross-store price intelligence, "For you" hiding, weekly digest.
-- Idempotent: safe to run more than once.

alter table deals
  add column if not exists canonical text,         -- "chicken breast", shared across brands/stores
  add column if not exists cmp_price numeric,      -- comparable price: per lb, per count, or each
  add column if not exists cmp_basis text,         -- 'lb' | 'ct' | 'ea'
  add column if not exists typical_price numeric,  -- median weekly sale price around here (cmp basis)
  add column if not exists price_verdict text;     -- 'great' | 'typical' | 'weak'
create index if not exists deals_canonical_idx on deals (canonical);

-- names Gemini (or a person) has mapped to a canonical product; reused every run
create table if not exists product_canon (
  normalized_name text primary key,
  canonical text,             -- null = checked, not a recognizable product
  source text not null default 'gemini',
  created_at timestamptz not null default now()
);
alter table product_canon enable row level security;

create table if not exists price_stats (
  canonical text primary key,
  basis text not null,
  median numeric not null,
  p25 numeric not null,
  low numeric not null,
  samples integer not null,
  stores integer not null,
  cycle_days numeric,          -- median days between sales at the same store
  last_sale timestamptz,
  updated_at timestamptz not null default now()
);
alter table price_stats enable row level security;
drop policy if exists "public read price_stats" on price_stats;
create policy "public read price_stats" on price_stats for select using (true);

create table if not exists hidden_terms (
  list_code text not null,
  term text not null,
  created_at timestamptz not null default now(),
  primary key (list_code, term)
);
alter table hidden_terms enable row level security;

-- fill canonical from the Gemini cache for deals the dictionary didn't recognize
create or replace function apply_product_canon() returns void
language sql security definer as $$
  update deals d set canonical = p.canonical
  from product_canon p
  where d.canonical is null and p.canonical is not null
    and d.normalized_name = p.normalized_name;
$$;

create or replace function refresh_price_stats() returns void
language sql security definer as $$
  -- comparable price for every deal
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
  where price is not null and price > 0 and cmp_price is null;

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

-- Saved places: the daily scan covers every one of them, not just the env location.
create table if not exists places (
  id bigint generated always as identity primary key,
  list_code text not null,
  label text not null,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  zip text,
  radius_miles numeric not null default 1.5,
  created_at timestamptz not null default now(),
  unique (list_code, label)
);
alter table places enable row level security;

-- every branch of a chain the scans have found, so distances work from any place
create table if not exists store_branches (
  source text not null,
  slug text not null,
  lat double precision not null,
  lng double precision not null,
  branch_address text,
  last_seen timestamptz not null default now(),
  primary key (source, slug, lat, lng)
);
alter table store_branches enable row level security;
drop policy if exists "public read store_branches" on store_branches;
create policy "public read store_branches" on store_branches for select using (true);

-- Weekly meal plan per list code
create table if not exists meal_plans (
  list_code text primary key,
  prefs jsonb not null default '{}',
  dinners jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table meal_plans enable row level security;
