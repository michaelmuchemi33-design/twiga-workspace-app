import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const safe = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);
function normalizePhone(value: unknown) {
  let phone = safe(value, 40).replace(/[\s().-]/g, "");
  if (/^0[17]\d{8}$/.test(phone)) phone = "254" + phone.slice(1);
  else if (/^\+254[17]\d{8}$/.test(phone)) phone = phone.slice(1);
  else if (/^254[17]\d{8}$/.test(phone)) { /* already E.164 country digits */ }
  return /^254[17]\d{8}$/.test(phone) ? phone : "";
}
async function readBody(response: Response) {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : {}; } catch { return { message: raw.slice(0, 500) }; }
}
async function getKimismsToken(clientId: string, clientSecret: string) {
  const response = await fetch("https://app.kimisms.com/api/generate-token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await readBody(response);
  const token = String(data.access_token || data.data?.access_token || "");
  if (!response.ok || !token) throw new Error(response.status === 401 ? "KIMISMS rejected the Client ID or Client Secret." : "KIMISMS could not issue an SMS access token.");
  return token;
}

const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((x) => x.toString(16).padStart(2, "0")).join("");
async function createPublicPaymentLink(admin: any, businessId: string, orderId: string, createdBy: string) {
  const [{ data: settings }, { data: businessSecret }, { data: platformSecret }] = await Promise.all([
    admin.from("twiga_business_settings").select("palpluss_paylink_id").eq("business_id", businessId).maybeSingle(),
    admin.rpc("twiga_get_provider_secret", { p_business_id: businessId, p_provider: "palpluss" }),
    admin.rpc("twiga_get_platform_secret", { p_provider: "palpluss_platform_api_key" }),
  ]);
  const paylinkId = safe(settings?.palpluss_paylink_id, 120);
  if (!paylinkId || !(businessSecret || platformSecret)) return "";
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map((x) => x.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from("twiga_public_payment_links").insert({
    business_id: businessId, order_id: orderId, token_hash: tokenHash, expires_at: expiresAt, created_by: createdBy,
  });
  if (error) throw error;
  return "https://app.twiga.co.ke/pay?token=" + encodeURIComponent(token);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST only." }, 405);
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply({ error: "Sign in first." }, 401);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url || !service || !anon) return reply({ error: "TWIGA server is not configured." }, 503);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return reply({ error: "Your session expired. Sign in again." }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const action = safe(body.action, 80);
    const businessId = safe(body.businessId, 80);
    if (!businessId) return reply({ error: "Choose a business workspace first." }, 400);
    const { data: member, error: memberError } = await admin.from("business_members")
      .select("role").eq("business_id", businessId).eq("user_id", user.id).maybeSingle();
    if (memberError) throw memberError;
    if (!member) return reply({ error: "You do not have access to this business." }, 403);
    const role = String(member.role || "");
    const canManage = ["owner", "admin"].includes(role);
    if (["save_credentials", "save_settings"].includes(action) && !canManage) {
      return reply({ error: "Only the business owner or administrator can manage SMS credentials and settings." }, 403);
    }

    if (action === "get_config") {
      const [{ data: secretRef, error: secretRefError }, { data: settings, error: settingsError }] = await Promise.all([
        admin.from("twiga_provider_secret_refs").select("secret_last4,updated_at").eq("business_id", businessId).eq("provider", "kimisms").maybeSingle(),
        admin.from("twiga_sms_settings").select("sender_name,order_confirmation_enabled,payment_confirmation_enabled,updated_at").eq("business_id", businessId).maybeSingle(),
      ]);
      if (secretRefError) throw secretRefError;
      if (settingsError) throw settingsError;
      return reply({
        connected: !!secretRef,
        keyLast4: secretRef?.secret_last4 || "",
        keyUpdatedAt: secretRef?.updated_at || null,
        senderName: settings?.sender_name || "",
        orderConfirmationEnabled: settings?.order_confirmation_enabled === true,
        paymentConfirmationEnabled: settings?.payment_confirmation_enabled === true,
      });
    }

    if (action === "save_credentials") {
      if (!canManage) return reply({ error: "Only the business owner or administrator can save SMS credentials." }, 403);
      const clientId = safe(body.clientId, 200);
      const clientSecret = safe(body.clientSecret, 1000);
      const senderName = safe(body.senderName, 20).replace(/[^A-Za-z0-9]/g, "");
      if (clientId.length < 4 || clientSecret.length < 8) return reply({ error: "Enter both the KIMISMS Client ID and Client Secret." }, 400);
      if (!senderName || senderName.length > 11) return reply({ error: "Enter the approved KIMISMS Sender ID (up to 11 letters or numbers)." }, 400);
      await getKimismsToken(clientId, clientSecret);
      const { data: last4, error: saveError } = await admin.rpc("twiga_set_kimisms_secret", {
        p_business_id: businessId, p_client_id: clientId, p_client_secret: clientSecret, p_updated_by: user.id,
      });
      if (saveError) throw new Error("KIMISMS credentials were validated but could not be stored in encrypted Vault.");
      const { error: settingsSaveError } = await admin.from("twiga_sms_settings").upsert({
        business_id: businessId, sender_name: senderName, updated_by: user.id, updated_at: new Date().toISOString(),
      }, { onConflict: "business_id" });
      if (settingsSaveError) throw settingsSaveError;
      return reply({ connected: true, keyLast4: last4, senderName, message: "KIMISMS credentials validated and saved securely for this business. No SMS has been sent yet." });
    }

    if (action === "save_settings") {
      if (!canManage) return reply({ error: "Only the business owner or administrator can change SMS notification settings." }, 403);
      const senderName = safe(body.senderName, 20).replace(/[^A-Za-z0-9]/g, "");
      if (!senderName || senderName.length > 11) return reply({ error: "Enter the approved Sender ID." }, 400);
      const { error } = await admin.from("twiga_sms_settings").upsert({
        business_id: businessId,
        sender_name: senderName,
        order_confirmation_enabled: body.orderConfirmationEnabled === true,
        payment_confirmation_enabled: body.paymentConfirmationEnabled === true,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "business_id" });
      if (error) throw error;
      return reply({ saved: true, message: "Business SMS notification settings saved." });
    }

    if (action === "record_order_consent") {
      const orderId = safe(body.orderId, 80);
      if (!/^[0-9a-f-]{36}$/i.test(orderId) || body.customerConfirmed !== true) {
        return reply({ error: "Confirm that this customer explicitly agreed to receive order SMS before recording consent." }, 400);
      }
      const { data: order, error: orderError } = await admin.from("twiga_orders")
        .select("id,customer_phone").eq("id", orderId).eq("business_id", businessId).maybeSingle();
      if (orderError) throw orderError;
      if (!order) return reply({ error: "Order not found in this business." }, 404);
      const { error: updateError } = await admin.from("twiga_orders").update({
        customer_sms_consent: true, sms_consent_at: new Date().toISOString(),
      }).eq("id", orderId).eq("business_id", businessId);
      if (updateError) throw updateError;
      return reply({ consentRecorded: true, message: "Customer SMS consent recorded for this order." });
    }

    const { data: credentialData, error: credentialError } = await admin.rpc("twiga_get_provider_secret", {
      p_business_id: businessId, p_provider: "kimisms",
    });
    if (credentialError || !credentialData) return reply({ error: "Connect this business's KIMISMS Client ID and Client Secret in Connections first." }, 409);
    let credentials: any;
    try { credentials = JSON.parse(String(credentialData)); } catch { credentials = {}; }
    const clientId = safe(credentials.client_id, 200);
    const clientSecret = safe(credentials.client_secret, 1000);
    if (!clientId || !clientSecret) return reply({ error: "Stored KIMISMS credentials are incomplete. Reconnect the SMS account." }, 409);

    const { data: smsSettings, error: smsSettingsError } = await admin.from("twiga_sms_settings")
      .select("sender_name,order_confirmation_enabled,payment_confirmation_enabled")
      .eq("business_id", businessId).maybeSingle();
    if (smsSettingsError) throw smsSettingsError;
    const senderName = safe(smsSettings?.sender_name, 20);
    if (!senderName) return reply({ error: "Save the approved Sender ID in Connections first." }, 409);

    let recipient = "";
    let message = "";
    let eventType = "manual";
    let orderId: string | null = null;
    let idempotencyKey = safe(body.idempotencyKey, 180);
    let shouldIncludePaymentLink = false;
    let paymentLinkIncluded = false;

    if (action === "send_order_confirmation" || action === "send_payment_request_notice" || action === "send_payment_confirmation") {
      orderId = safe(body.orderId, 80);
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) return reply({ error: "A valid business order ID is required." }, 400);
      const { data: order, error: orderError } = await admin.from("twiga_orders")
        .select("id,order_number,customer_name,customer_phone,total_amount,currency,payment_status,customer_sms_consent,status")
        .eq("id", orderId).eq("business_id", businessId).maybeSingle();
      if (orderError) throw orderError;
      if (!order) return reply({ error: "Order not found." }, 404);
      if (order.customer_sms_consent !== true) return reply({ error: "This customer has not opted in to SMS for this order." }, 409);
      if (!order.customer_phone) return reply({ error: "This order has no customer phone number." }, 409);
      if (action === "send_order_confirmation" && (!canManage || body.ownerConfirmed !== true)) {
        return reply({ error: "A business owner or administrator must confirm this order before its payment link is sent." }, 403);
      }
      if (action === "send_order_confirmation" && !["pending_confirmation", "confirmed"].includes(String(order.status || "").toLowerCase())) {
        return reply({ error: "This order is not awaiting confirmation." }, 409);
      }
      if (action === "send_payment_request_notice" && !canManage) {
        return reply({ error: "Only a business owner or administrator can send a payment request." }, 403);
      }
      const isPayment = action === "send_payment_confirmation";
      const isPaymentRequest = action === "send_payment_request_notice";
      if (isPayment && String(order.payment_status || "").toLowerCase() !== "paid") return reply({ error: "The payment is not confirmed as paid. No payment receipt was sent." }, 409);
      if (isPaymentRequest && !["pending","processing"].includes(String(order.payment_status || "").toLowerCase())) return reply({ error: "The M-Pesa request is not pending. No payment notice was sent." }, 409);
      if (!isPayment && smsSettings.order_confirmation_enabled !== true) return reply({ error: "Order and payment-request SMS is disabled for this business." }, 409);
      if (isPayment && smsSettings.payment_confirmation_enabled !== true) return reply({ error: "Payment-confirmation SMS is disabled for this business." }, 409);
      recipient = normalizePhone(order.customer_phone);
      if (!recipient) return reply({ error: "The customer's number is not a valid Kenyan mobile number." }, 400);
      eventType = isPayment ? "payment_confirmation" : isPaymentRequest ? "payment_request_notice" : "order_confirmation";
      shouldIncludePaymentLink = !isPayment;
      idempotencyKey = safe(idempotencyKey || (eventType === "order_confirmation" ? order.id + ":order_confirmation_paylink" : order.id + ":" + eventType), 180);
      const business = await admin.from("businesses").select("name").eq("id", businessId).maybeSingle();
      const businessName = safe(business.data?.name || "the business", 60);
      const orderNumber = safe(order.order_number || order.id.slice(0, 8), 60);
      const amount = Number(order.total_amount || 0).toLocaleString("en-KE");
      message = isPayment
        ? "Payment received by " + businessName + ". Order " + orderNumber + " · KSh " + amount + ". Thank you."
        : isPaymentRequest
          ? "We sent an M-Pesa payment prompt for order " + orderNumber + " (KSh " + amount + "). Approve the prompt on your phone to complete payment. Never share your M-Pesa PIN."
          : "Order confirmed by " + businessName + ". Order " + orderNumber + " · KSh " + amount + ".";
    } else if (action === "send_test") {
      if (!canManage || body.confirmTestRecipient !== true) return reply({ error: "Confirm that you control this test phone number before sending a test SMS." }, 403);
      recipient = normalizePhone(body.to);
      message = safe(body.message || "TWIGA SMS test. Your KIMISMS connection is working.", 1000);
      if (!recipient || !message) return reply({ error: "Enter a valid Kenyan mobile number and a message." }, 400);
      eventType = "test";
      idempotencyKey = safe(idempotencyKey || crypto.randomUUID(), 180);
    } else {
      return reply({ error: "Unknown KIMISMS action." }, 404);
    }

    const { data: existing } = await admin.from("twiga_sms_messages").select("id,status,provider_message_id")
      .eq("business_id", businessId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing && ["queued", "pending", "sent", "delivered"].includes(String(existing.status))) {
      if (action === "send_order_confirmation") {
        await admin.from("twiga_orders").update({ status: "confirmed" }).eq("id", orderId).eq("business_id", businessId).eq("status", "pending_confirmation");
      }
      return reply({ sent: true, duplicate: true, paymentLinkIncluded: String(existing.message || "").includes("https://app.twiga.co.ke/pay?token="), messageId: existing.provider_message_id || null, status: existing.status, message: "This SMS event was already submitted; it was not sent twice." });
    }
    if (shouldIncludePaymentLink) {
      const paymentLink = await createPublicPaymentLink(admin, businessId, String(orderId), user.id);
      if (!paymentLink && action === "send_order_confirmation") {
        return reply({ error: "Connect this business's PalPluss API key and public Paylink ID in Payments → API & connection before confirming an order by payment-link SMS." }, 409);
      }
      if (paymentLink) {
        message += (eventType === "payment_request_notice" ? " If the prompt does not appear, pay securely here: " : " Pay securely here: ") + paymentLink;
        paymentLinkIncluded = true;
      }
    }
    if (existing) {
      await admin.from("twiga_sms_messages").update({ status: "queued", message, error_message: null, updated_at: new Date().toISOString() })
        .eq("id", existing.id).eq("business_id", businessId);
    } else {
      const { error: insertError } = await admin.from("twiga_sms_messages").insert({
        business_id: businessId, order_id: orderId, event_type: eventType, recipient, message,
        provider: "kimisms", idempotency_key: idempotencyKey, status: "queued", created_by: user.id,
      });
      if (insertError && !String(insertError.message || "").includes("duplicate")) throw insertError;
    }

    try {
      const token = await getKimismsToken(clientId, clientSecret);
      const response = await fetch("https://app.kimisms.com/api/send-sms", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ sender_name: senderName, contact: recipient, message }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await readBody(response);
      if (!response.ok) throw new Error(response.status === 401 ? "KIMISMS SMS token was rejected. Reconnect the SMS credentials." : "KIMISMS could not send the SMS (HTTP " + response.status + ").");
      const providerData = result.data || result;
      const providerMessageId = safe(providerData.message_id || providerData.messageId || providerData.id, 200);
      const providerStatus = String(providerData.status || "pending").toLowerCase();
      const status = providerStatus === "delivered" ? "delivered" : providerStatus === "sent" ? "sent" : "pending";
      const saveQuery = admin.from("twiga_sms_messages").update({
        provider_message_id: providerMessageId || null, status, error_message: null,
        metadata: { provider_response: providerData }, updated_at: new Date().toISOString(),
      }).eq("business_id", businessId).eq("idempotency_key", idempotencyKey);
      const { error: saveError } = await saveQuery;
      if (saveError) throw saveError;
      if (action === "send_order_confirmation") {
        const { error: confirmError } = await admin.from("twiga_orders").update({ status: "confirmed" })
          .eq("id", orderId).eq("business_id", businessId).eq("status", "pending_confirmation");
        if (confirmError) throw confirmError;
      }
      return reply({ sent: true, status, paymentLinkIncluded, messageId: providerMessageId || null, message: "SMS accepted by KIMISMS. Delivery may remain pending until the provider confirms it." });
    } catch (error) {
      const messageError = error instanceof Error ? error.message : "SMS send failed.";
      await admin.from("twiga_sms_messages").update({
        status: "failed", error_message: messageError, updated_at: new Date().toISOString(),
      }).eq("business_id", businessId).eq("idempotency_key", idempotencyKey);
      throw error;
    }
  } catch (error) {
    console.error("twiga-kimisms", error instanceof Error ? error.message : "unknown error");
    return reply({ error: error instanceof Error ? error.message : "SMS request failed." }, 500);
  }
});
