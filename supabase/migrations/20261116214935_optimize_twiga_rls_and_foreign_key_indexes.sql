-- Evaluate auth.uid() once per statement instead of once per candidate row.
do $$
declare r record; new_qual text; new_check text; role_list text; ddl text;
begin
  for r in
    select * from pg_policies
    where schemaname='public'
      and position('auth.uid()' in coalesce(qual,'') || coalesce(with_check,''))>0
      and position('( SELECT auth.uid()' in coalesce(qual,'') || coalesce(with_check,''))=0
  loop
    new_qual := case when r.qual is null then null else replace(r.qual,'auth.uid()','(select auth.uid())') end;
    new_check := case when r.with_check is null then null else replace(r.with_check,'auth.uid()','(select auth.uid())') end;
    role_list := array_to_string(r.roles,', ');
    execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
    ddl := format('create policy %I on %I.%I as %s for %s to %s',r.policyname,r.schemaname,r.tablename,r.permissive,r.cmd,role_list);
    if new_qual is not null then ddl := ddl || format(' using (%s)',new_qual); end if;
    if new_check is not null then ddl := ddl || format(' with check (%s)',new_check); end if;
    execute ddl;
  end loop;
end
$$;

-- Member-read policies already grant SELECT; keep owner/admin manage policies write-only.
do $$
declare r record; role_list text;
begin
  for r in
    select p.*,v.prefix
    from pg_policies p
    join (values
      ('twiga_business_settings','twiga_settings_owner_manage','twiga_settings_owner'),
      ('twiga_business_voice_configs','twiga_voice_config_owner_manage','twiga_voice_config_owner'),
      ('twiga_palpluss_channels','Business admins manage PalPluss channels','twiga_palpluss_admin'),
      ('twiga_phone_lines','twiga_lines_owner_manage','twiga_lines_owner'),
      ('twiga_subscriptions','twiga_subscriptions_owner_manage','twiga_subscriptions_owner'),
      ('twiga_whatsapp_connections','business members manage WhatsApp connection','twiga_whatsapp_connection'),
      ('twiga_whatsapp_optouts','business members manage WhatsApp optouts','twiga_whatsapp_optouts')
    ) as v(tablename,policyname,prefix)
      on p.tablename=v.tablename and p.policyname=v.policyname
    where p.schemaname='public' and p.cmd='ALL'
  loop
    role_list := array_to_string(r.roles,', ');
    execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
    execute format('drop policy if exists %I on %I.%I',r.prefix||'_insert',r.schemaname,r.tablename);
    execute format('drop policy if exists %I on %I.%I',r.prefix||'_update',r.schemaname,r.tablename);
    execute format('drop policy if exists %I on %I.%I',r.prefix||'_delete',r.schemaname,r.tablename);
    execute format('create policy %I on %I.%I as %s for insert to %s with check (%s)',r.prefix||'_insert',r.schemaname,r.tablename,r.permissive,role_list,r.with_check);
    execute format('create policy %I on %I.%I as %s for update to %s using (%s) with check (%s)',r.prefix||'_update',r.schemaname,r.tablename,r.permissive,role_list,r.qual,r.with_check);
    execute format('create policy %I on %I.%I as %s for delete to %s using (%s)',r.prefix||'_delete',r.schemaname,r.tablename,r.permissive,role_list,r.qual);
  end loop;
end
$$;

-- Index active TWIGA/core foreign keys that were missing a supporting index.
create index if not exists idx_ai_lines_business_id_fk on public.ai_lines(business_id);
create index if not exists idx_businesses_created_by_fk on public.businesses(created_by);
create index if not exists idx_call_commands_business_id_fk on public.call_commands(business_id);
create index if not exists idx_profiles_tenant_id_fk on public.profiles(tenant_id);
create index if not exists idx_twiga_appointments_created_by_fk on public.twiga_appointments(created_by);
create index if not exists idx_twiga_business_profiles_updated_by_fk on public.twiga_business_profiles(updated_by);
create index if not exists idx_twiga_business_workspace_data_updated_by_fk on public.twiga_business_workspace_data(updated_by);
create index if not exists idx_twiga_call_records_created_by_fk on public.twiga_call_records(created_by);
create index if not exists idx_twiga_customers_business_id_fk on public.twiga_customers(business_id);
create index if not exists idx_twiga_customers_created_by_fk on public.twiga_customers(created_by);
create index if not exists idx_twiga_device_update_events_business_id_fk on public.twiga_device_update_events(business_id);
create index if not exists idx_twiga_device_update_events_device_id_fk on public.twiga_device_update_events(device_id);
create index if not exists idx_twiga_followups_call_record_id_fk on public.twiga_followups(call_record_id);
create index if not exists idx_twiga_internal_upload_tokens_business_id_fk on public.twiga_internal_upload_tokens(business_id);
create index if not exists idx_twiga_orders_created_by_fk on public.twiga_orders(created_by);
create index if not exists idx_twiga_palpluss_channels_created_by_fk on public.twiga_palpluss_channels(created_by);
create index if not exists idx_twiga_platform_payments_recorded_by_fk on public.twiga_platform_payments(recorded_by);
create index if not exists idx_twiga_platform_secret_refs_updated_by_fk on public.twiga_platform_secret_refs(updated_by);
create index if not exists idx_twiga_products_created_by_fk on public.twiga_products(created_by);
create index if not exists idx_twiga_support_tickets_business_id_fk on public.twiga_support_tickets(business_id);
create index if not exists idx_twiga_support_tickets_user_id_fk on public.twiga_support_tickets(user_id);
create index if not exists idx_twiga_tasks_business_id_fk on public.twiga_tasks(business_id);
create index if not exists idx_twiga_tasks_created_by_fk on public.twiga_tasks(created_by);
create index if not exists idx_twiga_vapi_accounts_created_by_fk on public.twiga_vapi_accounts(created_by);
create index if not exists idx_twiga_voice_sessions_business_id_fk on public.twiga_voice_sessions(business_id);
create index if not exists idx_twiga_voice_sessions_user_id_fk on public.twiga_voice_sessions(user_id);
create index if not exists idx_twiga_whatsapp_connections_created_by_fk on public.twiga_whatsapp_connections(created_by);

-- The pairing failure log was empty and had no primary key.
alter table public.pairing_failures add column if not exists id bigint generated by default as identity;
alter table public.pairing_failures add constraint pairing_failures_pkey primary key (id);
