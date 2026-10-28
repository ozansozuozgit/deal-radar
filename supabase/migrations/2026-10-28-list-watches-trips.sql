-- Smarter list (quantities, pinned/rejected matches, in-store check-off), synced watches
-- with target prices, alert history, and a purchase log for the savings tracker.
-- Idempotent: safe to run more than once.

alter table list_items
  add column if not exists qty numeric not null default 1,
  add column if not exists unit text,                       -- null = count; lb/oz/kg/g/l/ml/gal
  add column if not exists pinned_deal_id bigint,
  add column if not exists rejected_deal_ids bigint[] not null default '{}',
  add column if not exists checked boolean not null default false;

-- watches owned by a list code ("list:ABC123") alert every device synced to that code
alter table push_subscriptions add column if not exists list_code text;
create index if not exists push_subscriptions_list_code_idx on push_subscriptions (list_code);

-- 'item' = max_price is the sticker price; 'lb' = max_price is per pound
alter table watches add column if not exists price_basis text not null default 'item';

-- what each alert said, so the app can show recent alerts
alter table notified
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists url text;

create table if not exists purchases (
  id bigint generated always as identity primary key,
  list_code text not null,
  text text not null,
  deal_id bigint,
  name text,
  merchant_slug text,
  merchant_name text,
  category text,
  qty numeric not null default 1,
  unit text,
  cost numeric,            -- what the trip plan said it would cost
  regular_cost numeric,    -- the same amount at the regular price, when known
  bought_at timestamptz not null default now()
);
create index if not exists purchases_code_idx on purchases (list_code, bought_at desc);
alter table purchases enable row level security;
