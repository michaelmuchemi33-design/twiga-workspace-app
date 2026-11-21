create or replace function public.twiga_set_palpluss_secret(p_business_id uuid, p_secret text, p_updated_by uuid)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_secret_id uuid;
  v_name text;
  v_is_business_admin boolean;
  v_is_platform_admin boolean;
begin
  if length(coalesce(p_secret,'')) < 20 or length(p_secret) > 500 then
    raise exception 'Invalid PalPluss credential';
  end if;

  select exists (select 1 from public.business_members where business_id=p_business_id and user_id=p_updated_by and role in ('owner','admin')) into v_is_business_admin;
  select exists (select 1 from public.twiga_platform_admins where user_id=p_updated_by) into v_is_platform_admin;
  if not v_is_business_admin and not v_is_platform_admin then raise exception 'Not authorised to update this business payment credential'; end if;
  if not exists (select 1 from public.businesses where id=p_business_id) then raise exception 'Business workspace not found'; end if;

  v_name := 'twiga-palpluss-' || p_business_id::text;
  select vault_secret_id into v_secret_id from public.twiga_provider_secret_refs where business_id=p_business_id and provider='palpluss';
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_secret,v_name,'Encrypted TWIGA business PalPluss API key');
    insert into public.twiga_provider_secret_refs(business_id,provider,vault_secret_id,secret_last4,updated_by)
    values(p_business_id,'palpluss',v_secret_id,right(p_secret,4),p_updated_by)
    on conflict (business_id,provider) do update set vault_secret_id=excluded.vault_secret_id,secret_last4=excluded.secret_last4,updated_by=excluded.updated_by,updated_at=now();
  else
    perform vault.update_secret(v_secret_id,p_secret,v_name,'Encrypted TWIGA business PalPluss API key');
    update public.twiga_provider_secret_refs set secret_last4=right(p_secret,4),updated_by=p_updated_by,updated_at=now() where business_id=p_business_id and provider='palpluss';
  end if;
  return right(p_secret,4);
end;
$function$;
