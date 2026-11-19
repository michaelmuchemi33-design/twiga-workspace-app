-- TWIGA subscription checkout: private M-Pesa requests and verified entitlement records.
create table if not exists public.twiga_subscription_payment_intents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  initiated_by uuid references auth.users(id) on delete set null,
  plan_code text not null check (plan_code in ('starter','professional','business_pro')),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'KES' check (currency = 'KES'),
  phone text not null,
  account_reference text not null unique,
  provider_transaction_id text unique,
  merchant_request_id text,
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled','expired','review_required')),
  callback_token_hash text not null unique,
  provider_response jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists twiga_subscription_intents_business_created_idx
  on public.twiga_subscription_payment_intents(business_id, created_at desc);
create index if not exists twiga_subscription_intents_pending_idx
  on public.twiga_subscription_payment_intents(status, expires_at)
  where status = 'pending';
alter table public.twiga_subscription_payment_intents enable row level security;
revoke all on public.twiga_subscription_payment_intents from anon, authenticated;
grant all on public.twiga_subscription_payment_intents to service_role;
