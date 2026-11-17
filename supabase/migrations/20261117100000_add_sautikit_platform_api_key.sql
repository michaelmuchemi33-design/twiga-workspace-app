alter table public.twiga_platform_secret_refs
  drop constraint if exists twiga_platform_secret_refs_provider_check;

alter table public.twiga_platform_secret_refs
  add constraint twiga_platform_secret_refs_provider_check
  check (provider = any (array[
    'xai'::text,
    'google_oauth_client_id'::text,
    'google_oauth_client_secret'::text,
    'google_token_encryption_key'::text,
    'retell_platform_api_key'::text,
    'palpluss_platform_api_key'::text,
    'sautikit_platform_api_key'::text
  ]));

create or replace function public.twiga_set_platform_secret(
  p_provider text,
  p_secret text,
  p_updated_by uuid
) returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_secret_id uuid;
  v_name text;
  v_description text;
begin
  if p_provider not in (
      'xai',
      'google_oauth_client_id',
      'google_oauth_client_secret',
      'google_token_encryption_key',
      'retell_platform_api_key',
      'palpluss_platform_api_key',
      'sautikit_platform_api_key'
    )
    or length(coalesce(p_secret,'')) < 20
    or length(p_secret) > 4000 then
    raise exception 'Invalid platform secret';
  end if;

  if not exists (select 1 from public.twiga_platform_admins where user_id = p_updated_by) then
    raise exception 'Not authorised to manage platform secrets';
  end if;

  v_name := 'twiga-platform-' || p_provider;
  v_description := case p_provider
    when 'xai' then 'Encrypted TWIGA Grok setup and follow-up API key'
    when 'google_oauth_client_id' then 'Google OAuth web client ID for per-business consent'
    when 'google_oauth_client_secret' then 'Google OAuth web client secret for per-business consent'
    when 'google_token_encryption_key' then 'Google Workspace AES-GCM token encryption key'
    when 'retell_platform_api_key' then 'Platform Retell API key used for TWIGA voice agents and web-call testing'
    when 'palpluss_platform_api_key' then 'Central PalPluss API key used to register each business Till or Paybill channel'
    when 'sautikit_platform_api_key' then 'Platform SautiKit API key used by TWIGA to read the voice catalogue and manage the receptionist'
    else 'TWIGA platform integration secret'
  end;

  select vault_secret_id into v_secret_id from public.twiga_platform_secret_refs where provider = p_provider;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_secret, v_name, v_description);
    insert into public.twiga_platform_secret_refs(provider, vault_secret_id, secret_last4, updated_by)
    values (p_provider, v_secret_id, right(p_secret, 4), p_updated_by)
    on conflict(provider) do update set
      vault_secret_id = excluded.vault_secret_id,
      secret_last4 = excluded.secret_last4,
      updated_by = excluded.updated_by,
      updated_at = now();
  else
    perform vault.update_secret(v_secret_id, p_secret, v_name, v_description);
    update public.twiga_platform_secret_refs set
      secret_last4 = right(p_secret, 4),
      updated_by = p_updated_by,
      updated_at = now()
    where provider = p_provider;
  end if;

  return right(p_secret, 4);
end;
$function$;