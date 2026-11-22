# TWIGA + AiSensy WhatsApp

## Architecture
AiSensy hosts the WhatsApp AI Agent and sends WhatsApp messages. TWIGA remains the business system of record: each business UUID has its own Durable Object orchestrator and its own encrypted AiSensy credentials in D1.

This is additive. The existing direct Meta WhatsApp Cloud API connection remains available and continues to power the existing TWIGA WhatsApp inbox. AiSensy agent conversations are handled in AiSensy; Custom API Actions call TWIGA for live business operations. This Worker does not claim to mirror every AiSensy customer message into the TWIGA inbox.

## Connect a business
1. In the business workspace, open Unified Inbox → AiSensy for this business.
2. Paste the AiSensy API campaign key from AiSensy Developer settings.
3. Optionally enter an exact Live API Campaign name. Owner-alert delivery requires a live API campaign backed by an approved WhatsApp template with exactly two text variables (alert title and alert body).
4. Enter the registered owner WhatsApp number in international format (Kenyan examples: +2547XXXXXXXX or +2541XXXXXXXX).
5. Save. TWIGA encrypts the API key and a newly generated business-specific action token with the existing per-business integration encryption.
6. Copy the one-time bearer token into the AiSensy agent's Custom API Action Authorization header. Saving again rotates this token, so update AiSensy if you rotate credentials.

The key is stored encrypted; the full action token is returned only once. Never paste either secret into AI prompts, public documents, screenshots or customer-facing messages.

## Custom API Action
Create one AiSensy Custom API Action:
- Method: POST
- URL: the business-specific actionUrl displayed by TWIGA
- Authentication: Bearer token, using the one-time action token
- Header: Content-Type: application/json
- Map sender_phone to AiSensy's actual current WhatsApp contact phone variable via the variable picker. Do not let the AI fill this field from text typed by the customer.

Send a JSON body containing an operation plus the fields required for that operation.

Supported operations:

| Operation | Required fields | Access |
| --- | --- | --- |
| get_business_info | none | customer |
| list_products | none | customer |
| lookup_order | order_id, customer_phone | matching customer phone |
| check_appointment | date, time, optional duration_minutes | customer |
| save_lead | customer_name, customer_phone, optional email | customer |
| create_order | customer_name, customer_phone, items, confirmed=true | after customer confirms |
| book_appointment | customer_name, customer_phone, service_item_id, date, time, confirmed=true | after customer confirms |
| sales_report | sender_phone, period=today/week/month | registered owner only |
| owner_summary | sender_phone, optional period | registered owner only |
| human_handoff | sender_phone, message, optional reason | customer or owner |

Example body for a report call:

    {
      "operation": "sales_report",
      "sender_phone": "<AiSensy current contact phone>",
      "period": "week"
    }

Sales reports return totals, daily breakdowns and chart-ready series in KES, plus a link to the TWIGA Analytics dashboard. They are generated from that business's own order records. The Custom API Action returns structured chart data; it does not itself send a rendered chart image into WhatsApp.

Example body for an order lookup:

    {
      "operation": "lookup_order",
      "order_id": "ORD-123",
      "customer_phone": "<phone used for this order>"
    }

The Worker checks that the order belongs to this business and that its phone matches the customer's supplied WhatsApp number before returning order details.

## Agent instructions and safety
Add these rules to the AiSensy agent's Ground Rules:
- Use TWIGA Custom API Actions for current prices, stock, business information, order status, bookings, owner reports and staff handoffs. Do not invent business data.
- For orders, repeat the full order, quantities and total; create it only after the customer explicitly confirms. TWIGA records it as unpaid; never claim payment has been received.
- For appointments, check availability first, repeat service/date/time and obtain explicit confirmation before booking.
- Ask for the customer's order reference and phone used for that order. Do not reveal an order if the phone does not match.
- Owner financial reports and worker management data are available only when sender_phone matches the registered owner number. Never trust a phone number copied from the conversation text.
- If a person requests staff, call human_handoff; say the request was recorded for the team. Do not promise an instant transfer or callback.
- Never ask for PINs, OTPs, passwords or card credentials. Never claim a payment, refund, dispatch or external change happened unless a connected action confirms it.
- Match the customer's language, including Kenyan English and Kiswahili.

## Human handoff webhook
AiSensy's Handoff webhook can point to the business-specific handoffUrl shown by TWIGA. Use the same Authorization Bearer token. TWIGA records a staff handoff task and queues a high-priority owner alert. The webhook accepts common fields such as event_id, customer_name/name, customer_phone/phone, reason, and message/last_message.

## Owner alerts via AiSensy
Owner alerts are queued by TWIGA's scheduler. If the business has a connected direct Meta WhatsApp number and an open 24-hour conversation window, the existing Meta route is used. If not, TWIGA uses the business's AiSensy Live API Campaign as a template fallback.

The campaign must:
- be a Live API Campaign using an approved WhatsApp template,
- have exactly two text placeholders in this order: title, alert body,
- be entered exactly in TWIGA's Live API campaign name field,
- be approved and available to the connected AiSensy business.

AiSensy template messages are subject to WhatsApp template approval, quality and pricing rules. The Worker does not send arbitrary marketing broadcasts; it only dispatches queued high-priority owner alerts.

## Launch checklist
- Connect the correct business-owned AiSensy account and WhatsApp number.
- Configure and save the business owner's number.
- Configure the Custom API Action with the one-time token and map the actual contact phone to sender_phone.
- Run read-only tests first: business info, product list, customer order lookup and owner sales report from the registered owner phone.
- Test booking/order writes in a controlled workspace and confirm explicit confirmation is enforced.
- Configure and test the Handoff webhook.
- For automated owner alerts, create and approve the two-variable Live API Campaign and send a permitted test from AiSensy.
- Purchase/enable the required AiSensy AI Messages pack and publish the agent before inviting customers.
- Verify each business with its own AiSensy key, owner phone, action token and webhook settings. Never reuse another business's token.
