# TWIGA Business Workspace

The TWIGA workspace is a multi-business React application for Kenyan businesses. The live app and the public product preview run in separate host modes.

## Hosts

- `https://live.twiga.co.ke` — authenticated business workspace.
- `https://demo.twiga.co.ke` — isolated interactive preview with clearly labelled sample customers, products, tasks and sales. Demo changes stay in browser memory and are never written to a customer workspace. The demo does not fabricate Retell call records.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the TWIGA Supabase project URL and publishable key.
3. Run `npm install`, `npm run dev`, `npm test` and `npm run build`.

Set `VITE_APP_MODE=demo` to force the isolated demo mode locally. In production, `demo.twiga.co.ke` is detected by hostname.

## Multi-business data model

- `businesses` identifies each business workspace.
- `business_members` grants users owner/admin/member access to a business.
- `twiga_business_workspace_data` stores the workspace JSON by `business_id`, not by user ID.
- Row-level security checks business membership. A user switching businesses receives only the selected business's records.
- Retell call history is read from `twiga_call_records` and filtered by the selected `business_id`. Demo mode never inserts fake call records.

Do not add sample records to the live workspace. Keep sample content inside the explicit demo host only.

## Authentication and Google

Email/password and Google sign-in use the configured Supabase and Google OAuth setup. Register the exact production JavaScript origins in the Google OAuth Web client, including `https://live.twiga.co.ke` and `https://app.twiga.co.ke` if that host is used for sign-in. Add `https://twiga.co.ke` only if sign-in is initiated there. For Supabase's Google provider callback, allow `https://ztyxxikkposfpxsutnfr.supabase.co/auth/v1/callback`.

Provider secrets must remain server-side in Supabase/Vault. Never place Retell, xAI/Grok, Palpluss or Google client secrets in `VITE_*` browser variables.

## Integrations and activation

- Retell voice catalogue, publishing and call actions require the server-side Retell API key.
- A phone number assignment is not a live route. Incoming/outgoing calls require a supported carrier/SIP/forwarding route and a verified test call.
- Google Calendar, Contacts, Sheets and Drive require successful OAuth consent and per-business connection tests.
- M-Pesa/payment collection requires an active payment channel and a successful sandbox/live callback test.
- The default new-business trial is seven days; the Starter default is KSh 1,500 monthly. Existing manually configured subscriptions should be reviewed before changing them.

## Data-save feedback

The workspace shows a save status while changes are pending, saving, saved or failed. If loading the selected business workspace fails, the app warns that edits are not being persisted instead of silently accepting them.

## Quality checks

- `npm test` runs the repository smoke checks.
- `npm run build` runs TypeScript project checks and the Vite production build.
- GitHub Actions runs both on pull requests and pushes to `main`.

The Android wrapper is a debug/beta build until it is signed through the production release process; it is not a Play Store production release.
