-- Preserve the current phone line until a replacement number is successfully claimed.
create or replace function public.save_ai_line(p_business uuid, p_number text)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare n text;
begin
  if not exists (
    select 1 from public.business_members m
    where m.business_id = p_business
      and m.user_id = auth.uid()
      and m.role in ('owner','admin','manager')
  ) then
    raise exception 'Not allowed';
  end if;

  n := public.norm_number(p_number);
  if left(n, 1) <> '+' or substring(n from 2) !~ '^[0-9]{7,14}$' then
    raise exception 'Enter the number with its country code, like +254712345678';
  end if;

  if exists (select 1 from public.ai_lines where number = n and business_id <> p_business) then
    raise exception 'That number is already used by another business';
  end if;

  insert into public.ai_lines(number, business_id)
  values (n, p_business)
  on conflict (number) do update
    set business_id = excluded.business_id
    where public.ai_lines.business_id = excluded.business_id;

  if not found then
    raise exception 'That number is already used by another business';
  end if;

  delete from public.ai_lines where business_id = p_business and number <> n;
end
$function$;

-- Admins are permitted to update business AI settings, alongside owners and managers.
create or replace function public.save_business_ai(
  p_business uuid, p_prompt text, p_greeting text, p_auto_reply text,
  p_faq text default null::text, p_rules text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if not exists (
    select 1 from public.business_members m
    where m.business_id = p_business
      and m.user_id = auth.uid()
      and m.role in ('owner','admin','manager')
  ) then
    raise exception 'Not allowed';
  end if;

  insert into public.business_ai(business_id,prompt,greeting,auto_reply,faq,rules,updated_at)
  values (p_business,left(coalesce(p_prompt,''),20000),left(coalesce(p_greeting,''),500),
    left(coalesce(p_auto_reply,''),500),left(coalesce(p_faq,''),10000),left(coalesce(p_rules,''),3000),now())
  on conflict (business_id) do update set
    prompt=excluded.prompt,
    greeting=excluded.greeting,
    auto_reply=excluded.auto_reply,
    faq=case when p_faq is null then public.business_ai.faq else excluded.faq end,
    rules=case when p_rules is null then public.business_ai.rules else excluded.rules end,
    updated_at=now();
end
$function$;

-- Only business owners/admins/managers can toggle a paired device's AI state.
create or replace function public.set_device_ai(p_device uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  update public.devices d
  set ai_enabled=p_enabled
  where d.id=p_device
    and exists (
      select 1 from public.business_members m
      where m.business_id=d.business_id
        and m.user_id=auth.uid()
        and m.role in ('owner','admin','manager')
    );
  if not found then raise exception 'Not allowed'; end if;
end
$function$;

create index if not exists idx_devices_business_id_fk on public.devices(business_id);
create index if not exists idx_device_pairings_business_id_fk on public.device_pairings(business_id);
