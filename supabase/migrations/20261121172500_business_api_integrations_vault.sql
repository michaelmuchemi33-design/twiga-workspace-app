create table if not exists public.twiga_business_integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider_slug text not null,
  display_name text not null,
  integration_type text not null check (integration_type in ('ai_model','email','custom_api')),
  config jsonb not null default '{}'::jsonb,
  credentials_last4 jsonb not null default '{}'::jsonb,
  vault_secret_id uuid not null,
  is_primary_ai boolean not null default false,
  status text not null default 'saved' check (status in ('saved','verified','failed')),
  last_test_at timestamptz,
  last_test_message text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint twiga_business_integrations_provider_format check (provider_slug ~ '^[a-z][a-z0-9_-]{1,47}$'),
  constraint twiga_business_integrations_primary_ai_kind check (not is_primary_ai or integration_type = 'ai_model'),
  unique (business_id, provider_slug)
);

create index if not exists idx_twiga_business_integrations_business
  on public.twiga_business_integrations(business_id, integration_type, updated_at desc);

alter table public.twiga_business_integrations enable row level security;
revoke all on public.twiga_business_integrations from anon, authenticated;
grant select, insert, update, delete on public.twiga_business_integrations to service_role;

create or replace function public.twiga_save_business_integration(
  p_business_id uuid,
  p_provider_slug text,
  p_display_name text,
  p_integration_type text,
  p_config jsonb,
  p_credentials jsonb,
  p_is_primary_ai boolean,
  p_updated_by uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','vault'
as $function$
declare
  v_secret_id uuid;
  v_name text;
  v_description text;
  v_last4 jsonb;
  v_credential_count integer;
  v_key text;
  v_value text;
  v_id uuid;
begin
  if p_business_id is null or p_updated_by is null then raise exception 'Business and authenticated user are required'; end if;
  if p_provider_slug is null or p_provider_slug !~ '^[a-z][a-z0-9_-]{1,47}$' then raise exception 'Invalid integration provider identifier'; end if;
  if p_integration_type not in ('ai_model','email','custom_api') then raise exception 'Unsupported integration type'; end if;
  if coalesce(length(trim(p_display_name)),0) < 2 or length(p_display_name) > 100 then raise exception 'Integration name must be between 2 and 100 characters'; end if;
  if jsonb_typeof(coalesce(p_config,'{}'::jsonb)) <> 'object' or octet_length(coalesce(p_config,'{}'::jsonb)::text) > 12000 then raise exception 'Invalid integration configuration'; end if;
  if jsonb_typeof(p_credentials) <> 'object' then raise exception 'Credentials must be an object'; end if;
  select count(*) into v_credential_count from jsonb_object_keys(p_credentials);
  if v_credential_count < 1 or v_credential_count > 5 then raise exception 'An integration must contain between 1 and 5 credential fields'; end if;
  for v_key, v_value in select key, value from jsonb_each_text(p_credentials) loop
    if v_key !~ '^[a-z][a-z0-9_-]{0,47}$' or v_value is null or length(trim(v_value)) < 3 or length(v_value) > 4000 then raise exception 'Invalid credential field or value'; end if;
  end loop;
  if not exists (
    select 1 from public.business_members
    where business_id = p_business_id and user_id = p_updated_by and role in ('owner','admin')
  ) and not exists (
    select 1 from public.twiga_platform_admins where user_id = p_updated_by
  ) then raise exception 'Not authorised to manage integrations for this business'; end if;
  if not exists (select 1 from public.businesses where id = p_business_id) then raise exception 'Business workspace not found'; end if;

  v_name := 'twiga-business-integration-' || p_business_id::text || '-' || p_provider_slug;
  v_description := 'Encrypted TWIGA business integration credentials for ' || p_provider_slug;
  select vault_secret_id into v_secret_id from public.twiga_business_integrations where business_id = p_business_id and provider_slug = p_provider_slug;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_credentials::text, v_name, v_description);
  else
    perform vault.update_secret(v_secret_id, p_credentials::text, v_name, v_description);
  end if;
  select coalesce(jsonb_object_agg(key, right(value,4)), '{}'::jsonb) into v_last4 from jsonb_each_text(p_credentials);

  if coalesce(p_is_primary_ai,false) then
    update public.twiga_business_integrations set is_primary_ai = false, updated_at = now()
    where business_id = p_business_id and is_primary_ai = true and provider_slug <> p_provider_slug;
  end if;

  insert into public.twiga_business_integrations (
    business_id, provider_slug, display_name, integration_type, config,
    credentials_last4, vault_secret_id, is_primary_ai, status, last_test_at,
    last_test_message, created_by, updated_by, updated_at
  ) values (
    p_business_id, p_provider_slug, trim(p_display_name), p_integration_type,
    coalesce(p_config,'{}'::jsonb), v_last4, v_secret_id,
    coalesce(p_is_primary_ai,false), 'saved', null, null,
    p_updated_by, p_updated_by, now()
  )
  on conflict (business_id, provider_slug) do update set
    display_name = excluded.display_name,
    integration_type = excluded.integration_type,
    config = excluded.config,
    credentials_last4 = excluded.credentials_last4,
    vault_secret_id = excluded.vault_secret_id,
    is_primary_ai = excluded.is_primary_ai,
    status = 'saved',
    last_test_at = null,
    last_test_message = null,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into v_id;

  return jsonb_build_object('id',v_id,'business_id',p_business_id,'provider_slug',p_provider_slug,'credentials_last4',v_last4,'is_primary_ai',coalesce(p_is_primary_ai,false),'status','saved');
end;
$function$;

create or replace function public.twiga_get_primary_business_ai_integration(p_business_id uuid)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog','public','private','vault'
as $function$
  select jsonb_build_object('provider_slug',i.provider_slug,'config',i.config,'credentials',ds.decrypted_secret::jsonb)
  from public.twiga_business_integrations i
  join vault.decrypted_secrets ds on ds.id = i.vault_secret_id
  where i.business_id = p_business_id and i.integration_type = 'ai_model'
    and i.is_primary_ai = true and i.status in ('saved','verified')
  order by i.updated_at desc limit 1;
$function$;

create or replace function public.twiga_delete_business_integration(
  p_business_id uuid, p_provider_slug text, p_updated_by uuid
) returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','vault'
as $function$
declare v_secret_id uuid;
begin
  if not exists (
    select 1 from public.business_members where business_id = p_business_id and user_id = p_updated_by and role in ('owner','admin')
  ) and not exists (
    select 1 from public.twiga_platform_admins where user_id = p_updated_by
  ) then raise exception 'Not authorised to manage integrations for this business'; end if;
  select vault_secret_id into v_secret_id from public.twiga_business_integrations where business_id = p_business_id and provider_slug = p_provider_slug;
  if v_secret_id is null then return false; end if;
  delete from public.twiga_business_integrations where business_id = p_business_id and provider_slug = p_provider_slug;
  delete from vault.secrets where id = v_secret_id;
  return true;
end;
$function$;

revoke all on function public.twiga_save_business_integration(uuid,text,text,text,jsonb,jsonb,boolean,uuid) from public, anon, authenticated;
revoke all on function public.twiga_get_primary_business_ai_integration(uuid) from public, anon, authenticated;
revoke all on function public.twiga_delete_business_integration(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.twiga_save_business_integration(uuid,text,text,text,jsonb,jsonb,boolean,uuid) to service_role;
grant execute on function public.twiga_get_primary_business_ai_integration(uuid) to service_role;
grant execute on function public.twiga_delete_business_integration(uuid,text,uuid) to service_role;
