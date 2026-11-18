-- Durable schema migration for the TWIGA business task queue and AI action approvals.
-- The same DDL was applied to the connected Supabase project on 2026-11-18.

alter table public.twiga_tasks
  add column if not exists kind text not null default 'task',
  add column if not exists category text not null default 'operations',
  add column if not exists priority text not null default 'normal',
  add column if not exists due_at timestamptz,
  add column if not exists assigned_to uuid,
  add column if not exists source text not null default 'manual',
  add column if not exists approval_required boolean not null default false,
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists action_type text,
  add column if not exists action_payload jsonb not null default '{}'::jsonb,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'twiga_tasks_kind_check') then
    alter table public.twiga_tasks
      add constraint twiga_tasks_kind_check check (kind in ('task', 'idea', 'followup'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'twiga_tasks_priority_check') then
    alter table public.twiga_tasks
      add constraint twiga_tasks_priority_check check (priority in ('low', 'normal', 'high', 'urgent'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'twiga_tasks_approval_status_check') then
    alter table public.twiga_tasks
      add constraint twiga_tasks_approval_status_check check (approval_status in ('not_required', 'pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists twiga_tasks_business_due_idx
  on public.twiga_tasks (business_id, status, due_at);

create index if not exists twiga_tasks_business_approval_idx
  on public.twiga_tasks (business_id, approval_status, created_at desc);

alter table public.twiga_tasks enable row level security;
