ALTER TABLE public.twiga_provider_secret_refs
  DROP CONSTRAINT IF EXISTS twiga_provider_secret_refs_provider_check;

ALTER TABLE public.twiga_provider_secret_refs
  ADD CONSTRAINT twiga_provider_secret_refs_provider_check
  CHECK (provider = ANY (ARRAY['retell'::text, 'palpluss'::text, 'kimisms'::text, 'sautikit_agent_tool_signing'::text, 'sautikit_booking_tool_secret'::text]));

CREATE OR REPLACE FUNCTION public.twiga_set_provider_secret(
  p_business_id uuid,
  p_provider text,
  p_secret text,
  p_updated_by uuid DEFAULT NULL::uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_secret_id uuid;
  v_name text;
  v_description text;
begin
  if p_provider not in ('retell', 'sautikit_agent_tool_signing', 'sautikit_booking_tool_secret')
    or length(coalesce(p_secret,'')) < 20
    or length(p_secret) > 4000 then
    raise exception 'Invalid provider credential';
  end if;

  if not exists (
    select 1 from public.business_members
    where business_id = p_business_id
      and user_id = p_updated_by
      and role in ('owner','admin')
  ) and not exists (
    select 1 from public.twiga_platform_admins
    where user_id = p_updated_by
  ) then
    raise exception 'Not authorised to manage provider credentials';
  end if;

  v_name := 'twiga-' || p_provider || '-' || p_business_id::text;
  v_description := case p_provider
    when 'retell' then 'Encrypted TWIGA business Retell API key'
    when 'sautikit_agent_tool_signing' then 'Encrypted SautiKit signing secret for this business-specific AI agent tools'
    when 'sautikit_booking_tool_secret' then 'Encrypted TWIGA booking-tool authentication secret for this business-specific SautiKit agent'
    else 'Encrypted TWIGA business provider credential'
  end;

  select vault_secret_id into v_secret_id
  from public.twiga_provider_secret_refs
  where business_id = p_business_id and provider = p_provider;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_secret, v_name, v_description);
    insert into public.twiga_provider_secret_refs(business_id,provider,vault_secret_id,secret_last4,updated_by)
    values (p_business_id,p_provider,v_secret_id,right(p_secret,4),p_updated_by)
    on conflict (business_id,provider) do update
      set vault_secret_id=excluded.vault_secret_id,
          secret_last4=excluded.secret_last4,
          updated_by=excluded.updated_by,
          updated_at=now();
  else
    perform vault.update_secret(v_secret_id,p_secret,v_name,v_description);
    update public.twiga_provider_secret_refs
       set secret_last4=right(p_secret,4),updated_by=p_updated_by,updated_at=now()
     where business_id=p_business_id and provider=p_provider;
  end if;
  return right(p_secret,4);
end;
$function$;