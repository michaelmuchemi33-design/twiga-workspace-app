# TWIGA workspace app and Supabase services

The live workspace app is served from `live.twiga.co.ke` (with `app.twiga.co.ke` redirecting to it).

- `twiga-business-workspaces` creates a complete business workspace idempotently. Database triggers create membership, business AI defaults and settings; the function checks/upserts rather than inserting duplicates.
- `twiga-sautikit` manages the SautiKit API key, live voice/model catalogue, receptionist agent publishing and authorised outbound calls.
- `twiga-platform-secrets` validates/stores the xAI Grok key and reports Google OAuth credential readiness.
- `twiga-setup-assistant` powers Grok-assisted business onboarding.
- `google-workspace` handles business Google OAuth and Calendar, Contacts, Sheets and Drive actions.
- `twiga-scheduled-calls` is the HMAC-authenticated worker invoked by the existing Supabase Cron job every minute. It dispatches only consented calls through a ready business SautiKit line and respects local calling windows.

Platform keys are stored in Supabase Vault, not browser storage. The scheduled worker requires the Vault secret reference `twiga_scheduled_calls_cron_secret` and a SautiKit key saved from Connections. The user must record consent before a call can be scheduled.
