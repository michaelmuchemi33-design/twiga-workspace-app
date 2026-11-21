create schema if not exists private;

create table if not exists private.twiga_worker_internal_secret_ref (
  singleton boolean primary key default true check (singleton = true),
  vault_secret_id uuid not null,
  updated_at timestamptz not null default now()
);

revoke all on private.twiga_worker_internal_secret_ref from public, anon, authenticated, service_role;

create or replace function public.twiga_get_worker_internal_secret()
returns text
language sql
stable
security definer
set search_path to 'pg_catalog','private','vault'
as $function$
  select ds.decrypted_secret
  from private.twiga_worker_internal_secret_ref ref
  join vault.decrypted_secrets ds on ds.id = ref.vault_secret_id
  where ref.singleton = true
  limit 1;
$function$;

revoke all on function public.twiga_get_worker_internal_secret() from public, anon, authenticated;
grant execute on function public.twiga_get_worker_internal_secret() to service_role;

insert into private.twiga_worker_internal_secret_ref(singleton,vault_secret_id)
select true,
  vault.create_secret(
    replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text,'-',''),
    'twiga-worker-internal-auth',
    'Internal server-to-server authentication for the TWIGA Cloudflare Worker'
  )
on conflict (singleton) do nothing;
