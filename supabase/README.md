# TWIGA Supabase Edge Functions

- `twiga-sautikit`: manages the SautiKit agent, confirms the provider-side inbound binding, sends outbound calls and writes call history using the `pstn` channel.
- `twiga-scheduled-calls`: authenticated dashboard actions (`list`, `schedule`, `cancel`) plus HMAC-authenticated `process_due_calls` for the cron worker. Dashboard actions validate the Supabase user JWT and business membership inside the function.
- `twiga-business-workspaces`: idempotent business creation and workspace-profile persistence for the AI setup wizard.
- `twiga-platform-secrets`: encrypted Grok/SautiKit platform key management.

`twiga-scheduled-calls` has `verify_jwt = false` because it accepts both browser calls and cron calls. It validates browser JWTs itself, checks owner/admin/manager membership, and validates an HMAC signature for cron dispatch. Do not remove those checks.

The scheduled-call cron is configured in the project to run every minute. The HMAC secret is stored in Supabase Vault under `twiga_scheduled_calls_cron_secret`; never put its value in source control.

Scheduled calls require explicit consent, valid E.164 phone numbers, and are restricted to the business calling window (08:00–20:00 Africa/Nairobi by default). Conditional callbacks re-check the source inbound call or unpaid order at dispatch time. Repeating series are bounded to 30 total calls and advance only after a completed call.
