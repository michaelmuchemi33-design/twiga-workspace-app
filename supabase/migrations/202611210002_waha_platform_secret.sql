create or replace function public.twiga_set_platform_secret(p_provider text, p_secret text, p_updated_by uuid)
returns text
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
    'openrouter',
    'google_oauth_client_id',
    'google_oauth_client_secret',
    'google_token_encryption_key',
    'retell_platform_api_key',
    'palpluss_platform_api_key',
    'sautikit_platform_api_key',
    'composio_sautikit_api_key',
    'twiga_scheduled_calls_cron_secret',
    'aisensy_campaign_api_key',
    'aisensy_project_api_key',
    'aisensy_project_id',
    'twiga_cloudflare_files_ai_secret',
    'waha_internal_api_key'
  ) or length(coalesce(p_secret,'')) < 4 or length(p_secret) > 4000 then
    raise exception 'Invalid platform secret';
  end if;

  if not exists (select 1 from public.twiga_platform_admins where user_id=p_updated_by) then
    raise exception 'Not authorised to manage platform secrets';
  end if;

  v_name := 'twiga-platform-' || p_provider;
  v_description := case p_provider
    when 'openrouter' then 'OpenRouter API key for TWIGA business setup model'
    when 'aisensy_campaign_api_key' then 'AiSensy Campaign API key for approved business template campaigns'
    when 'aisensy_project_api_key' then 'AiSensy Project API key for the TWIGA WhatsApp integration'
    when 'aisensy_project_id' then 'AiSensy Project identifier for the TWIGA WhatsApp integration'
    when 'twiga_cloudflare_files_ai_secret' then 'Internal service credential for TWIGA business file search'
    when 'waha_internal_api_key' then 'Internal API key used by TWIGA Cloudflare Worker to authenticate to private WAHA containers'
    else 'TWIGA platform integration secret'
  end;

  select vault_secret_id into v_secret_id
  from public.twiga_platform_secret_refs where provider=p_provider;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_secret,v_name,v_description);
    insert into public.twiga_platform_secret_refs(provider,vault_secret_id,secret_last4,updated_by)
    values(p_provider,v_secret_id,right(p_secret,4),p_updated_by)
    on conflict(provider) do update
      set vault_secret_id=excluded.vault_secret_id,
          secret_last4=excluded.secret_last4,
          updated_by=excluded.updated_by,
          updated_at=now();
  else
    perform vault.update_secret(v_secret_id,p_secret,v_name,v_description);
    update public.twiga_platform_secret_refs
      set secret_last4=right(p_secret,4),updated_by=p_updated_by,updated_at=now()
      where provider=p_provider;
  end if;
  return right(p_secret,4);
end;
$function$;