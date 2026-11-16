-- Pin the remaining public helper functions that were flagged by the database linter.
alter function public.get_demo_by_industry(text) set search_path = pg_catalog, public, private;
alter function public.norm_number(text) set search_path = pg_catalog, public, private;
alter function public.seed_unity_demo_all_industries() set search_path = pg_catalog, public, private;

-- The demo seeder is an administrative maintenance function, not a public API.
revoke execute on function public.seed_unity_demo_all_industries() from public, anon, authenticated;
grant execute on function public.seed_unity_demo_all_industries() to service_role;

-- Do not delete a business's current phone line until the replacement has been
-- successfully claimed. The old function deleted first and silently ignored a
-- unique-number conflict belonging to another business.
create or replace function public.device_save_line(p_token text, p_number text)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  d public.devices;
  n text;
begin
  d := public.dev_by_token(p_token);
  if d.id is null then
    raise exception 'Unknown device';
  end if;

  n := public.norm_number(p_number);
  if left(n, 1) <> '+' or substring(n from 2) !~ '^[0-9]{7,14}$' then
    raise exception 'Enter the number with its country code';
  end if;

  if exists (
    select 1
    from public.ai_lines
    where number = n
      and business_id <> d.business_id
  ) then
    raise exception 'This phone number is already assigned to another business';
  end if;

  insert into public.ai_lines(number, business_id)
  values (n, d.business_id)
  on conflict (number) do update
    set business_id = excluded.business_id
    where public.ai_lines.business_id = excluded.business_id;

  if not found then
    raise exception 'This phone number is already assigned to another business';
  end if;

  delete from public.ai_lines
  where business_id = d.business_id
    and number <> n;
end
$function$;
