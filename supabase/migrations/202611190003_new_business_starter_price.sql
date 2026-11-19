create or replace function public.twiga_initialize_business()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  insert into public.business_members (business_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;

  insert into public.business_ai (business_id, prompt, greeting, auto_reply, faq, rules)
  values (new.id, '', '', '', '', '')
  on conflict (business_id) do nothing;

  insert into public.twiga_business_settings (business_id)
  values (new.id)
  on conflict (business_id) do nothing;

  insert into public.twiga_subscriptions (
    business_id, plan_code, billing_interval, currency, amount, status,
    trial_started_at, trial_ends_at, current_period_start, current_period_end
  )
  values (
    new.id, 'starter', 'monthly', 'KES', 1650,
    case when new.status = 'TRIAL' then 'trialing' else 'expired' end,
    case when new.status = 'TRIAL' then new.created_at else null end,
    case when new.status = 'TRIAL' then new.created_at + interval '7 days' else null end,
    case when new.status = 'TRIAL' then new.created_at else null end,
    case when new.status = 'TRIAL' then new.created_at + interval '7 days' else null end
  )
  on conflict (business_id) do nothing;

  return new;
end;
$function$;