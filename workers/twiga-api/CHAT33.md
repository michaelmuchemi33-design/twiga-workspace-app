# TWIGA social gateway — Chat33

TWIGA uses Chat33 as its optional social media gateway. Each business can connect up to three Chat33 workspace API keys in the **The 10 core functions** screen. A Chat33 workspace can contain multiple connected social channels.

## Setup

1. In the business workspace, open **The 10 core functions**.
2. Open [Chat33 Settings](https://chat33.io/settings) → API Keys and create an API key.
3. Grant the scopes required for the features that business wants:
   - Posting: `accounts:read`, `posts:read`, `posts:write`, `media:write`.
   - Inbox: `inbox:read`, `inbox:write`.
   - Comment scopes are not required for this TWIGA release; comment reading/replies are not yet integrated into the TWIGA inbox.
4. Connect the business's social profiles in Chat33 under its channel connections.
5. Paste the API key into one of the three business slots in TWIGA. Keys are saved by the Worker as encrypted, business-scoped credentials in Cloudflare D1.
6. To stream new Instagram/Facebook Messenger DMs into TWIGA immediately, configure the Chat33 message webhook at `https://twiga-api.twiga-ke.workers.dev/chat33/webhook` in Chat33 Settings → API Keys → Message webhook. Save the Chat33 signing secret in the matching TWIGA slot.

## What TWIGA does

- Reads connected social channels from each of the business's Chat33 workspaces.
- Publishes or schedules a caption and uploaded image/video to selected channels across the connected Chat33 workspaces. Each destination workspace receives its own direct media upload.
- Reads Instagram and Facebook Messenger DM conversations, loads conversation messages and sends owner-approved replies using the Chat33 API.
- Stores social contact identities from Chat33 conversations/webhooks in the business-scoped social contacts table so the People screen can show them alongside phone/Google/CSV contacts.
- The Inbox also merges messages from TWIGA's separate official Meta WhatsApp Business connection. WhatsApp is not a Chat33 channel; its reply action is gated by Meta's 24-hour customer-service window.
- The People screen also includes senders from stored WhatsApp conversations and participants from the current business call history.
- Verifies incoming Chat33 message webhooks using the timestamped HMAC-SHA256 `X-Chat33-Signature` header.

## Platform coverage limits

Publishing API coverage documented by Chat33 includes Instagram, Facebook, TikTok, YouTube, X, LinkedIn, Bluesky and Threads.

Chat33's documented inbox conversation tools currently list Instagram and Facebook Messenger DMs. Do not describe TikTok DMs, YouTube messages, X DMs, Threads DMs or Bluesky DMs as covered by the unified inbox unless Chat33 adds and documents those endpoints. Comment reading/replies are separate features and require the comments scopes and supported platform APIs.

Chat33 lists WhatsApp Business as coming soon. TWIGA therefore retains a separate official Meta WhatsApp connection in the meantime; its messages are merged into the TWIGA inbox using Meta's separate connector, not a Chat33 inbox endpoint. TikTok DMs and TikTok comment inbox are not claimed as supported by the current Chat33 integration. WAHA is retired.

## Security and operating rules

- Never expose a Chat33 API key to the browser logs, URLs, prompts or another business. The browser submits it to the authenticated Worker once; the Worker encrypts it with the business ID as its cryptographic context.
- Each of the three slots is private to the selected business. All account IDs are checked against that slot's own Chat33 account list before publishing.
- The owner must select destinations and confirm each publish/reply action. Respect channel-specific content rules, opt-in, reply windows, platform restrictions, daily limits and Chat33 credits.
- A Chat33 API key is a connection, not permission to message people indiscriminately. Only reply to permitted conversations and use platform-approved content flows.
