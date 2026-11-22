# TWIGA multi-business orchestrator architecture

## One Cloudflare account, isolated business orchestrators

TWIGA deploys one shared `twiga-api` Worker, one shared `twiga-db` D1 database, and one `BUSINESS_AGENT` Durable Object namespace in the Cloudflare account. It does **not** create a separate Cloudflare account or Worker deployment for every customer.

Each business workspace is assigned a stable Durable Object instance by its canonical Supabase business UUID:

- `BUSINESS_AGENT.idFromName(business_id)` identifies the business orchestrator.
- The Durable Object permanently stores its first business UUID and rejects any request that tries to reuse the object for another business.
- Each business has its own queue, profile, settings, notifications, owner contact, provider credentials and run history. D1 rows are always selected or modified using that business ID.
- The D1 `business_worker_orchestrators` table is a tenant registry and health index. It records registration, latest dispatch, successful run, failure and task counts.
- The Cloudflare scheduler is shared. It only selects eligible business IDs and invokes each business's own Durable Object.

## Capacity and fairness

The Cron Trigger checks the shared queue every minute. It chooses the least-recently-dispatched eligible businesses first, so a busy older tenant does not permanently starve a newly added client.

Current defaults:

- Up to 100 eligible business orchestrators selected per minute.
- Up to 16 business orchestrators dispatched concurrently.
- Up to 50 due tasks examined during one business orchestrator run.
- Scheduler settings can be raised with `BUSINESS_WORKER_DISPATCH_BATCH_SIZE` (maximum 250) and `BUSINESS_WORKER_DISPATCH_CONCURRENCY` (maximum 24).

The dispatch batch is not a customer limit. If more businesses are eligible than fit in one batch, unserved businesses remain in the shared D1 queue and are selected in later ticks by the fairness order. Actual throughput depends on Cloudflare plan limits, task duration and external provider response times.

## Tenant isolation rules

When adding or changing worker capabilities:

1. Obtain the business ID from the authenticated server-side workspace context. Do not trust a client-supplied business ID without `authorize()`.
2. Include `business_id = ?` in every tenant-owned D1 read, update and delete.
3. Store tenant provider credentials per business, not in a global default credential slot.
4. Derive the Durable Object name only from the validated business UUID.
5. Keep side effects idempotent and persist task state before/after processing so an interrupted run can safely recover.
6. Never let a task from one tenant use another tenant's customer records, connected accounts, owner phone or business profile.

## Current automatic handlers

The worker currently has automatic handlers for `daily_review`, `whatsapp_reply` and `whatsapp_call_event`. Other generated business recommendations are stored as owner-review tasks; they are not automatically executed. Multi-tenant orchestration and task-capability coverage are separate concerns: adding more clients does not magically make every advertised business action executable.
