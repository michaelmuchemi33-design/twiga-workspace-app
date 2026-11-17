-- Per-business KIMISMS SMS connection, opt-in consent and delivery records.
alter table public.twiga_orders
  add column if not exists customer_sms_consent boolean not null default false,
  add column if not exists sms_consent_at timestamptz;

alter table public.twiga_provider_secret_refs
  drop constraint if exists twiga_provider_secret_refs_provider_check;
alter table public.twiga_provider_secret_refs
  add constraint twiga_provider_secret_refs_provider_check
  check (provider = any (array['retell'::text, 'palpluss'::text, 'kimisms'::text]));

create table if not exists public.twiga_sms_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  sender_name text not null default '',
  order_confirmation_enabled boolean not null default false,
  payment_confirmation_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.twiga_sms_settings enable row level security;
drop policy if exists twiga_sms_settings_member_read on public.twiga_sms_settings;
create policy twiga_sms_settings_member_read on public.twiga_sms_settings
  for select to authenticated using (public.is_member(business_id));

create table if not exists public.twiga_sms_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid references public.twiga_orders(id) on delete set null,
  event_type text not null,
  recipient text not null,
  message text not null,
  provider text not null default 'kimisms',
  provider_message_id text,
  idempotency_key text not null,
  status text not null default 'queued',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint twiga_sms_messages_status_check check (status in ('queued','pending','sent','delivered','failed','skipped'))
);
create unique index if not exists twiga_sms_messages_business_idempotency_idx
  on public.twiga_sms_messages (business_id, idempotency_key);
create index if not exists twiga_sms_messages_business_created_idx
  on public.twiga_sms_messages (business_id, created_at desc);
alter table public.twiga_sms_messages enable row level security;
drop policy if exists twiga_sms_messages_member_read on public.twiga_sms_messages;
create policy twiga_sms_messages_member_read on public.twiga_sms_messages
  for select to authenticated using (public.is_member(business_id));

create or replace function public.twiga_set_kimisms_secret(
  p_business_id uuid,
  p_client_id text,
  p_client_secret text,
  p_updated_by uuid
) returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_secret_id uuid;
  v_payload text;
  v_name text;
begin
  if length(coalesce(p_client_id,'')) < 4 or length(coalesce(p_client_id,'')) > 200
     or length(coalesce(p_client_secret,'')) < 8 or length(p_client_secret) > 1000 then
    raise exception 'Invalid KIMISMS client credentials';
  end if;
  if not exists (
    select 1 from public.business_members
    where business_id = p_business_id and user_id = p_updated_by and role in ('owner','admin')
  ) then
    raise exception 'Only the business owner or administrator can save SMS credentials';
  end if;
  v_payload := jsonb_build_object('client_id', p_client_id, 'client_secret', p_client_secret)::text;
  v_name := 'twiga-kimisms-' || p_business_id::text;
  select vault_secret_id into v_secret_id
  from public.twiga_provider_secret_refs
  where business_id = p_business_id and provider = 'kimisms';
  if v_secret_id is null then
    v_secret_id := vault.create_secret(v_payload, v_name, 'Encrypted KIMISMS client credentials for TWIGA business SMS');
    insert into public.twiga_provider_secret_refs(business_id, provider, vault_secret_id, secret_last4, updated_by)
    values (p_business_id, 'kimisms', v_secret_id, right(p_client_secret, 4), p_updated_by)
    on conflict (business_id, provider) do update
      set vault_secret_id=excluded.vault_secret_id,
          secret_last4=excluded.secret_last4,
          updated_by=excluded.updated_by,
          updated_at=now();
  else
    perform vault.update_secret(v_secret_id, v_payload, v_name, 'Encrypted KIMISMS client credentials for TWIGA business SMS');
    update public.twiga_provider_secret_refs
       set secret_last4=right(p_client_secret,4), updated_by=p_updated_by, updated_at=now()
     where business_id=p_business_id and provider='kimisms';
  end if;
  return right(p_client_secret,4);
end;
$function$;

revoke all on function public.twiga_set_kimisms_secret(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.twiga_set_kimisms_secret(uuid,text,text,uuid) to service_role;
