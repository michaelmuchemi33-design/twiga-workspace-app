-- Lock down unused legacy ERP relations in the TWIGA project.
-- The separate ERP application uses a different Supabase project.
drop policy if exists customers_all on public.customers;
drop policy if exists invoices_all on public.invoices;
drop policy if exists products_all on public.products;
revoke all privileges on table public.customers, public.invoices, public.products from public, anon, authenticated;
grant all privileges on table public.customers, public.invoices, public.products to service_role;
revoke all privileges on table public.analytics_customer_value, public.analytics_executive_summary, public.analytics_inventory_health, public.analytics_procurement_metrics, public.analytics_production_metrics, public.analytics_revenue_summary, public.analytics_risk_center from public, anon, authenticated;
grant select on table public.analytics_customer_value, public.analytics_executive_summary, public.analytics_inventory_health, public.analytics_procurement_metrics, public.analytics_production_metrics, public.analytics_revenue_summary, public.analytics_risk_center to service_role;

-- Pin the search_path for every SECURITY DEFINER function in public.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    execute format('alter function %s set search_path = pg_catalog, public, private', r.signature);
  end loop;
end
$$;

-- Trigger functions are invoked by triggers, not directly by API clients.
revoke execute on function public.businesses_trial_once() from public, anon, authenticated;
revoke execute on function public.add_owner_membership() from public, anon, authenticated;
revoke execute on function public.twiga_initialize_business() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- The membership predicate is needed by authenticated RLS policies, not anonymous callers.
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated, service_role;
