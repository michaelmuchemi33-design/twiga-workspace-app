# TWIGA public website enquiry

The marketing site at https://twiga.co.ke/pages/contact.html uses a small, no-payment business-fit enquiry form. It is deliberately separate from account signup and subscription checkout.

## Request path

1. The browser posts the form fields to `POST https://twiga-api.twiga-ke.workers.dev/website-enquiry`.
2. The Worker validates the name, business, email, Kenyan phone number and industry, checks the honeypot and applies a per-source rate limit.
3. The Worker saves the enquiry in Supabase `public.twiga_demo_interests`, recording `industry`, `source`, the hashed request fingerprint and notification status.
4. The Worker reads active `owner` and `admin` email recipients from `public.twiga_admin_members`.
5. The Worker sends a notification with Resend from `TWIGA Website <leads@twiga.co.ke>`, with the prospective customer's email as `reply_to`.
6. The lead record is retained even if Resend reports an error; `notification_status` is set to `failed` and the form does not claim that an email was delivered.

## Secrets and migrations

- Resend key: Cloudflare Worker secret binding `RESEND_API_KEY`.
- The key is sending-only and was created with access restricted to the verified `twiga.co.ke` Resend domain.
- Never place the Resend key in the public site, browser JavaScript or a checked-in environment file.
- Supabase migration `twiga_website_interest_resend_notifications` adds the industry/source/fingerprint and notification status fields and indexes to `twiga_demo_interests`.

## Health check

`GET https://twiga-api.twiga-ke.workers.dev/website-enquiry/health` returns only non-secret flags indicating whether the database and Resend configuration are present. It does not expose credentials or confirm that an email has been delivered.

## Operations notes

- The active notification recipients are data-driven from `twiga_admin_members`; no personal address is hard-coded in the marketing site.
- The form does not create an account or charge the visitor.
- If the email provider fails, the enquiry remains saved for the TWIGA team to follow up.
- Do not turn the fit-check form into marketing consent. It is an enquiry response request; separate permission is required for promotional messages.
