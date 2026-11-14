# TWIGA Business Workspace

This repository contains the new TWIGA React workspace. It is deployed in two host-based modes:

- `https://demo.twiga.co.ke` — interactive sample workspace with seeded preview records and a demo-interest form.
- `https://live.twiga.co.ke` — authenticated workspace; each signed-in user starts with empty records and their workspace state is stored under their Supabase user ID.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the TWIGA Supabase project URL and publishable key.
3. Run `npm install` and `npm run dev`.

`VITE_APP_MODE=demo` can be used to force demo mode locally. In production, `demo.twiga.co.ke` is detected by hostname.

## Authentication

Email/password and Google OAuth use Supabase Auth. The Google provider's OAuth client ID and secret must be configured in Supabase Auth provider settings (not copied into browser variables). Add `https://live.twiga.co.ke/auth/callback` and `https://demo.twiga.co.ke/auth/callback` to the Supabase redirect allow-list as appropriate. Google sign-in is intentionally only offered on the live workspace.

## Workspace data

`twiga_app_workspaces` stores the signed-in user's JSON workspace, protected by owner-only RLS. The demo uses sample data and does not read/write customer workspaces. `twiga_demo_interests` accepts lead form inserts only; public users cannot read the lead table.

## Installable app

The application includes a PWA manifest, service worker and install prompt. On supported browsers users can install TWIGA from the browser. On iOS they can use Share → Add to Home Screen.

A Capacitor Android wrapper build workflow is included separately; the generated debug APK is not a signed Play Store release. Telephony, Vapi/Retell, WhatsApp Business API, Google Calendar and live payment-provider activation require provider configuration and end-to-end testing.
