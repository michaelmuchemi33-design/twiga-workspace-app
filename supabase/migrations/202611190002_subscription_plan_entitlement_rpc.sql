-- Only the server-side subscription billing and administrator endpoints can record platform subscription payments.
-- The trusted RPC accepts the three public monthly tiers and preserves any unused trial or paid time.
create or replace function public.twiga_record_platform_payment(
  p_business_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text default null,
  p_notes text default null,
  p_period_start date default null,
  p_period_end date default null,
  p_recorded_by uuid default null
)
returns public.twiga_platform_payments
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_payment public.twiga_platform_payments;
  v_business public.businesses;
  v_subscription public.twiga_subscriptions;
  v_plan_code text;
  v_period_start date;
  v_period_end date;
  v_period_start_at timestamptz;
  v_period_end_at timestamptz;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 or round(p_amount,2) <> p_amount then
    raise exception 'Enter a valid subscription amount in KSh' using errcode='22023';
  end if;
  v_plan_code := case when p_amount=1650 then 'starter' when p_amount=3000 then 'professional' when p_amount=5000 then 'business_pro' else null end;
  if v_plan_code is null then raise exception 'Choose a published TWIGA subscription plan: KSh 1,650, KSh 3,000 or KSh 5,000' using errcode='22023'; end if;
  if p_method not in ('mpesa','bank','cash','card','other') then raise exception 'Unsupported payment method' using errcode='22023'; end if;
  select * into v_business from public.businesses where id=p_business_id for update;
  if not found then raise exception 'Client not found' using errcode='P0002'; end if;
  select * into v_subscription from public.twiga_subscriptions where business_id=p_business_id order by created_at desc limit 1 for update;
  v_period_start_at := greatest(now(),coalesce(v_subscription.current_period_end,v_subscription.trial_ends_at,now()));
  v_period_end_at := v_period_start_at + interval '30 days';
  v_period_start := timezone('Africa/Nairobi',v_period_start_at)::date;
  v_period_end := timezone('Africa/Nairobi',v_period_end_at)::date;
  insert into public.twiga_platform_payments(business_id,amount,currency,method,provider_reference,notes,period_start,period_end,recorded_by)
  values(p_business_id,p_amount,'KES',p_method,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),v_period_start,v_period_end,p_recorded_by)
  returning * into v_payment;
  update public.businesses set status='ACTIVE',paid_through=v_period_end where id=p_business_id;
  if v_subscription.id is not null then
    update public.twiga_subscriptions set plan_code=v_plan_code,billing_interval='monthly',amount=p_amount,currency='KES',status='active',
      current_period_start=v_period_start_at,current_period_end=v_period_end_at,grace_period_days=3,
      grace_period_ends_at=v_period_end_at+interval '3 days',last_payment_at=now(),updated_at=now()
    where id=v_subscription.id;
  else
    insert into public.twiga_subscriptions(business_id,plan_code,billing_interval,currency,amount,status,current_period_start,current_period_end,grace_period_days,grace_period_ends_at,last_payment_at,updated_at)
    values(p_business_id,v_plan_code,'monthly','KES',p_amount,'active',v_period_start_at,v_period_end_at,3,v_period_end_at+interval '3 days',now(),now());
  end if;
  return v_payment;
end;
$function$;
revoke all on function public.twiga_record_platform_payment(uuid,numeric,text,text,text,date,date,uuid) from public, anon, authenticated;
grant execute on function public.twiga_record_platform_payment(uuid,numeric,text,text,text,date,date,uuid) to service_role;
