-- Public Paylink ID is business-specific; API key remains private in Supabase Vault.
alter table public.twiga_business_settings
  add column if not exists palpluss_paylink_id text;

alter table public.twiga_orders
  add column if not exists palpluss_transaction_id text;

create unique index if not exists twiga_orders_business_palpluss_transaction_uidx
  on public.twiga_orders (business_id, palpluss_transaction_id)
  where palpluss_transaction_id is not null;
