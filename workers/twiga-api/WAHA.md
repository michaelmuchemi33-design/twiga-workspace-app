# TWIGA WhatsApp via WAHA

This is an optional WhatsApp Web integration for businesses that want to link an existing WhatsApp account by scanning a QR code or entering a temporary pairing code.

**Important:** WAHA is an unofficial WhatsApp Web integration. It is not Meta's official WhatsApp Cloud API. Account restrictions and session interruptions are possible. The official Meta Embedded Signup connection remains the recommended production option.

## Architecture

- Each TWIGA business gets a deterministic, isolated WAHA session name (`twiga-<business-id>`).
- TWIGA's Cloudflare Worker is the authenticated control plane. It owns business membership checks, D1 session metadata, per-session webhook validation, worker task dispatch, and AI replies.
- WAHA is a separate HTTP service. Run it on a durable container/VM or a supported Cloudflare Container deployment.
- Persist WAHA login/session state in PostgreSQL using `WHATSAPP_SESSIONS_POSTGRESQL_URL`. Do not rely on a container's local filesystem when it can sleep/restart.
- Do not expose the WAHA HTTP API without its API key. Route the HTTPS endpoint only to the TWIGA Worker where possible.

## WAHA service settings

Use WAHA Core or Plus. Configure these values in the WAHA service's own secret store / environment file:

```dotenv
WAHA_API_KEY=<long-random-private-api-key>
WHATSAPP_SESSIONS_POSTGRESQL_URL=<private-postgres-connection-string>
```

Use a managed PostgreSQL database with TLS/network restrictions. Store the WAHA API key and database URL in the hosting provider's secret manager, not in Git or in a business profile.

WAHA documents the PostgreSQL session store under `WHATSAPP_SESSIONS_POSTGRESQL_URL`. Persisting this storage is necessary to preserve paired sessions across restarts.

## Connect the Worker

Set the Worker-side values (not browser-exposed `VITE_*` variables):

```bash
cd workers/twiga-api
npx wrangler secret put WAHA_BASE_URL
npx wrangler secret put WAHA_API_KEY
```

- `WAHA_BASE_URL`: HTTPS base URL reachable by the TWIGA Worker, with no trailing slash.
- `WAHA_API_KEY`: the same private key configured in the WAHA service.

Keep both as Cloudflare Worker secrets. Never put the key in the frontend, a customer .env download, a chat prompt, or a GitHub commit.

## Workspace flow

1. A signed-in business owner opens Inbox → Connect a WhatsApp number.
2. TWIGA creates that business's WAHA session and stores a random per-session webhook token hash in D1.
3. The owner scans the QR code from WhatsApp → Linked devices → Link a device, or requests a pairing code using their international phone number.
4. WAHA sends session/message events to `https://twiga-api.twiga-ke.workers.dev/waha/webhook`.
5. The Worker validates the session's webhook token, writes messages into the business-scoped inbox tables, and dispatches the business's Durable Object.
6. Cloudflare Workers AI replies using that business's verified profile only. Human handovers and unsupported messages create workspace tasks.

## Current scope

- Text inbound messages, status events, QR linking, phone-number pairing, outgoing text replies, and human handover are implemented in the TWIGA Worker.
- Non-text/media messages are routed to an owner review task rather than transcribed by this WAHA route.
- The WAHA integration does not provide live AI voice calls.
- Keep the 24-hour TWIGA auto-reply safety window enabled; messages outside it are routed to the owner for review.
- WAHA health, session recovery, actual customer messages, and persistent reconnects must be tested against a deployed WAHA service before enabling it for paying businesses.

## Official Meta option

The existing Meta WhatsApp Cloud API connection remains available in this screen. It uses Meta Embedded Signup and Meta webhook verification. Choose that route for an official WhatsApp Business Platform integration.