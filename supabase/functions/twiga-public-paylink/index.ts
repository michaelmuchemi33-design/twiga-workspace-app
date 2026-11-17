import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const safe = (value: unknown, max = 2000) => String(value ?? "").trim().slice(0, max);
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((x) => x.toString(16).padStart(2, "0")).join("");
const normalPhone = (value: unknown) => safe(value, 40).replace(/[\\s().-]/g, "").replace(/^\\+/, "").replace(/^0([17])/, "254$1");
async function readBody(response: Response) {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : {}; } catch { return { message: raw.slice(0, 500) }; }
}
async function palRequest(key: string, path: string) {
  const response = await fetch("https://api.palpluss.com/v1" + path, {
    method: "GET",
    headers: { Authorization: "Basic " + btoa(key + ":"), "Content-Type": "application/json", Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const raw = await readBody(response);
  return { ok: response.ok, status: response.status, data: raw?.data ?? raw, error: raw?.error ?? null };
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
  if (!response.ok || !token) throw new Error("KIMISMS could not issue a receipt SMS token.");
  return token;
}
async function sendPaymentReceipt(admin: any, businessId: string, order: any, businessName: string) {
  if (order.customer_sms_consent !== true) return false;
  const { data: smsSettings } = await admin.from("twiga_sms_settings")
    .select("sender_name,payment_confirmation_enabled").eq("business_id", businessId).maybeSingle();
  if (smsSettings?.payment_confirmation_enabled !== true) return false;
  const { data: credentialData } = await admin.rpc("twiga_get_provider_secret", { p_business_id: businessId, p_provider: "kimisms" });
  if (!credentialData) return false;
  let credentials: any = {};
  try { credentials = JSON.parse(String(credentialData)); } catch { return false; }
  const clientId = safe(credentials.client_id, 200);
  const clientSecret = safe(credentials.client_secret, 1000);
  const senderName = safe(smsSettings.sender_name, 20);
  const recipient = normalPhone(order.customer_phone);
  if (!clientId || !clientSecret || !senderName || !recipient) return false;
  const idempotencyKey = order.id + ":payment_confirmation";
  const message = "Payment received by " + businessName + ". Order " + safe(order.order_number || order.id.slice(0, 8), 60) + " · KSh " + Number(order.total_amount || 0).toLocaleString("en-KE") + ". Thank you.";
  const { data: existing } = await admin.from("twiga_sms_messages").select("id,status")
    .eq("business_id", businessId).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing && ["queued", "pending", "sent", "delivered"].includes(String(existing.status))) return true;
  if (existing) {
    await admin.from("twiga_sms_messages").update({ status: "queued", message, error_message: null, updated_at: new Date().toISOString() })
      .eq("id", existing.id).eq("business_id", businessId);
  } else {
    const { error } = await admin.from("twiga_sms_messages").insert({
      business_id: businessId, order_id: order.id, event_type: "payment_confirmation", recipient, message,
      provider: "kimisms", idempotency_key: idempotencyKey, status: "queued", metadata: {}, created_by: null,
    });
    if (error) throw error;
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
    if (!response.ok) throw new Error("KIMISMS could not send the payment receipt SMS.");
    const providerData = result.data || result;
    const providerStatus = String(providerData.status || "pending").toLowerCase();
    const status = providerStatus === "delivered" ? "delivered" : providerStatus === "sent" ? "sent" : "pending";
    await admin.from("twiga_sms_messages").update({
      provider_message_id: safe(providerData.message_id || providerData.messageId || providerData.id, 200) || null,
      status, error_message: null, metadata: { provider_response: providerData }, updated_at: new Date().toISOString(),
    }).eq("business_id", businessId).eq("idempotency_key", idempotencyKey);
    return true;
  } catch (error) {
    await admin.from("twiga_sms_messages").update({
      status: "failed", error_message: error instanceof Error ? error.message : "Receipt SMS failed.",
      updated_at: new Date().toISOString(),
    }).eq("business_id", businessId).eq("idempotency_key", idempotencyKey);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST only." }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !service) return reply({ error: "TWIGA server is not configured." }, 503);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const action = safe(body.action, 40);
    const token = safe(body.token, 128);
    if (!/^[a-f0-9]{64}$/i.test(token)) return reply({ error: "This payment link is invalid or expired." }, 404);
    if (!["load", "status", "verify"].includes(action)) return reply({ error: "Unknown payment-link action." }, 404);
    const tokenHash = await sha256(token);
    const { data: link, error: linkError } = await admin.from("twiga_public_payment_links")
      .select("id,business_id,order_id,expires_at,used_at").eq("token_hash", tokenHash).maybeSingle();
    if (linkError) throw linkError;
    if (!link) return reply({ error: "This payment link is invalid or expired." }, 404);

    const { data: order, error: orderError } = await admin.from("twiga_orders")
      .select("id,order_number,customer_name,customer_phone,total_amount,currency,payment_status,payment_method,palpluss_transaction_id,customer_sms_consent")
      .eq("id", link.order_id).eq("business_id", link.business_id).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return reply({ error: "The order linked to this payment request could not be found." }, 404);
    const { data: business } = await admin.from("businesses").select("name").eq("id", link.business_id).maybeSingle();
    const businessName = safe(business?.name || "the business", 80);
    const isPaid = String(order.payment_status || "").toLowerCase() === "paid";

    if (action === "status") return reply({ paid: isPaid, orderNumber: safe(order.order_number || "", 60) });
    if (!isPaid && new Date(link.expires_at).getTime() < Date.now()) return reply({ error: "This payment link has expired. Ask the business to send a new one." }, 410);
    if (!isPaid && link.used_at) return reply({ error: "This payment link has already been used. Ask the business for an updated link." }, 409);

    if (action === "load" && isPaid) {
      return reply({
        businessName, orderNumber: safe(order.order_number || order.id.slice(0, 8), 60),
        customerName: safe(order.customer_name, 120), phone: safe(order.customer_phone, 40),
        amount: Number(order.total_amount), currency: safe(order.currency || "KES", 8),
        paylinkId: "", expiresAt: link.expires_at, paid: true,
      });
    }
    if (action === "load") {
      const [{ data: settings }, { data: businessSecret }, { data: platformSecret }] = await Promise.all([
        admin.from("twiga_business_settings").select("palpluss_paylink_id").eq("business_id", link.business_id).maybeSingle(),
        admin.rpc("twiga_get_provider_secret", { p_business_id: link.business_id, p_provider: "palpluss" }),
        admin.rpc("twiga_get_platform_secret", { p_provider: "palpluss_platform_api_key" }),
      ]);
      const paylinkId = safe(settings?.palpluss_paylink_id, 120);
      if (!paylinkId || !(businessSecret || platformSecret)) return reply({ error: "The business payment connection is not ready. Contact the business for help." }, 409);
      return reply({
        businessName, orderNumber: safe(order.order_number || order.id.slice(0, 8), 60),
        customerName: safe(order.customer_name, 120), phone: safe(order.customer_phone, 40),
        amount: Number(order.total_amount), currency: safe(order.currency || "KES", 8),
        paylinkId, expiresAt: link.expires_at, paid: isPaid,
      });
    }

    const transactionId = safe(body.transactionId, 160);
    if (!/^[0-9a-f-]{36}$/i.test(transactionId)) return reply({ error: "A valid PalPluss transaction ID is required." }, 400);
    if (isPaid && order.palpluss_transaction_id === transactionId) {
      const receiptSmsSent = await sendPaymentReceipt(admin, link.business_id, order, businessName);
      return reply({ verified: true, alreadyVerified: true, receiptSmsSent, orderNumber: safe(order.order_number || "", 60) });
    }
    if (isPaid) return reply({ error: "This order is already paid. A second transaction cannot be attached." }, 409);
    const { data: used } = await admin.from("twiga_orders").select("id")
      .eq("business_id", link.business_id).eq("palpluss_transaction_id", transactionId).neq("id", order.id).maybeSingle();
    if (used) return reply({ error: "This PalPluss transaction is already attached to another order." }, 409);

    const [{ data: businessSecret }, { data: platformSecret }] = await Promise.all([
      admin.rpc("twiga_get_provider_secret", { p_business_id: link.business_id, p_provider: "palpluss" }),
      admin.rpc("twiga_get_platform_secret", { p_provider: "palpluss_platform_api_key" }),
    ]);
    const key = String(businessSecret || platformSecret || "");
    if (!key) return reply({ error: "The business payment connection is not ready." }, 409);
    const result = await palRequest(key, "/transactions/" + encodeURIComponent(transactionId));
    if (!result.ok) return reply({ error: "PalPluss could not verify this transaction. Try again shortly." }, 502);
    const tx = result.data?.transaction || result.data;
    const status = String(tx.status || "").toUpperCase();
    if (status !== "SUCCESS") return reply({ verified: false, status, message: "PalPluss is still processing this payment. TWIGA will update the order when it confirms SUCCESS." });
    const expected = Number(order.total_amount || 0);
    const paidAmount = Number(tx.amount || 0);
    if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - expected) > 0.001) return reply({ error: "The verified payment amount does not match this order. The order remains unpaid." }, 409);
    const orderPhone = normalPhone(order.customer_phone);
    const paymentPhone = normalPhone(tx.phone_number || tx.phone);
    if (orderPhone && paymentPhone && orderPhone !== paymentPhone) return reply({ error: "The paid phone number does not match this order. The order remains unpaid." }, 409);

    const { error: updateError } = await admin.from("twiga_orders").update({
      payment_status: "paid", payment_method: "MPESA_PAYLINK", palpluss_transaction_id: transactionId,
    }).eq("business_id", link.business_id).eq("id", order.id).neq("payment_status", "paid");
    if (updateError) throw updateError;
    await admin.from("twiga_palpluss_transactions").upsert({
      business_id: link.business_id, transaction_id: transactionId, transaction_type: "PAYLINK", status: "SUCCESS",
      amount: paidAmount, currency: safe(tx.currency || order.currency || "KES", 8),
      phone: tx.phone_number || tx.phone || order.customer_phone || null,
      account_reference: order.order_number || null,
      transaction_desc: "PalPluss hosted Paylink · order " + safe(order.order_number || order.id, 60),
      mpesa_receipt: tx.mpesa_receipt || tx.receipt_number || null,
      response_data: tx, updated_at: new Date().toISOString(),
    }, { onConflict: "business_id,transaction_id" });
    await admin.from("twiga_public_payment_links").update({ used_at: new Date().toISOString() }).eq("id", link.id);
    const receiptSmsSent = await sendPaymentReceipt(admin, link.business_id, order, businessName);
    return reply({ verified: true, receiptSmsSent, transactionId, amount: paidAmount, orderNumber: safe(order.order_number || "", 60), message: "PalPluss verified the payment and TWIGA marked this order as paid." });
  } catch (error) {
    console.error("twiga-public-paylink:", error instanceof Error ? error.message : error);
    return reply({ error: "The payment request could not be completed. Contact the business if you have been charged." }, 500);
  }
});