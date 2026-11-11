-- Everyday shelf prices for a store's whole catalog (NetCost's bookmark sends them).
-- Kept apart from deals so the feed, history and typical prices stay sales only;
-- best price reads them so a store shows up even when the item isn't on sale there.
create table if not exists catalog_prices (
  id bigint generated always as identity primary key,
  source text not null,
  external_id text not null,
  merchant_slug text not null,
  merchant_name text not null,
  name text not null,
  normalized_name text not null,
  canonical text,
  price numeric not null,
  unit text,
  size_qty numeric,
  size_unit text,
  unit_price numeric,
  cmp_price numeric,
  cmp_basis text,
  category text not null default 'other',
  image_url text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists catalog_prices_merchant_seen_idx on catalog_prices (merchant_slug, last_seen);

alter table catalog_prices enable row level security;
create policy "public read catalog_prices" on catalog_prices for select using (true);
