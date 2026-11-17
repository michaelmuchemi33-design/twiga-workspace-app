import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-timestamp, x-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const API = "https://api.sautikit.com";
const KIND = "sautikit_scheduled_call";
type Row = Record<string, any>;
async function skRequest(key: string, path: string, method = "GET", body?: unknown) {
  const response = await fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + key, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data: Row = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw.slice(0, 500) }; }
  if (!response.ok) {
    const message = String(data?.error?.message || data?.message || data?.error || "SautiKit request failed (HTTP " + response.status + ").");
    throw Object.assign(new Error(message), { status: response.status });
  }
  return data;
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifyCron(req: Request) {
  const secret = Deno.env.get("TWIGA_CRON_SECRET") || "";
  const timestamp = req.headers.get("x-timestamp") || "";
  const signature = req.headers.get("x-signature") || "";
  const seconds = Number(timestamp);
  if (!secret || !Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 120 || !signature) return false;
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(timestamp)));
  const expected = Array.from(signed).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return safeEqual(expected, signature.toLowerCase());
}
function nextKenyaEight(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const year = get("year"), month = get("month");
  let day = get("day");
  if (get("hour") >= 20) day += 1;
  return new Date(Date.UTC(year, month - 1, day, 8, 0, 0) - 3 * 60 * 60 * 1000);
}
function isKenyaCallingTime(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  return hour >= 8 && hour < 20;
}
async function getProvider(admin: any, businessId: string) {
  const { data: line, error: lineError } = await admin.from("twiga_phone_lines").select("*")
    .eq("business_id", businessId).eq("provider", "sautikit").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (lineError) throw lineError;
  if (!line || !line.outbound_enabled || line.outbound_status !== "active") throw Object.assign(new Error("This business does not have an active SautiKit outbound line."), { status: 409 });
  const settings: Row = line.settings && typeof line.settings === "object" ? line.settings : {};
  const agentId = String(settings.inbound_agent_id || "");
  const numberId = String(line.provider_reference || "");
  if (!agentId || !numberId) throw Object.assign(new Error("The existing phone line is missing its published agent or provider number ID."), { status: 409 });
  const { data: secret, error: secretError } = await admin.rpc("twiga_get_platform_secret", { p_provider: "sautikit_platform_api_key" });
  if (secretError) throw secretError;
  const key = String(secret || "");
  if (!key) throw Object.assign(new Error("Connect the SautiKit API key in Phone & AI before scheduling calls."), { status: 409 });
  const [agent, number, businessResult] = await Promise.all([
    skRequest(key, "/v1/agents/" + encodeURIComponent(agentId)),
    skRequest(key, "/v1/numbers/" + encodeURIComponent(numberId)),
    admin.from("businesses").select("name").eq("id", businessId).maybeSingle(),
  ]);
  const inbound = number?.routing?.inbound_agent;
  if (!inbound?.enabled || inbound.agent_id !== agentId) throw Object.assign(new Error("The existing SautiKit number is not verified against this published receptionist."), { status: 409 });
  if (agent?.status && agent.status !== "published") throw Object.assign(new Error("Publish the receptionist before scheduling outbound calls."), { status: 409 });
  return { line, settings, agentId, key, businessName: String(businessResult?.data?.name || "the business") };
}
async function processDueCalls(admin: any) {
  const now = new Date();
  const { data: due, error } = await admin.from("twiga_followups").select("*")
    .eq("channel", "phone").eq("status", "pending").eq("consent_status", "confirmed")
    .contains("metadata", { kind: KIND }).lte("due_at", now.toISOString()).order("due_at", { ascending: true }).limit(20);
  if (error) throw error;
  let submitted = 0, deferred = 0, failed = 0;
  for (const row of (due || []) as Row[]) {
    const callTime = new Date();
    if (!isKenyaCallingTime(callTime)) {
      const next = nextKenyaEight(callTime);
      await admin.from("twiga_followups").update({ due_at: next.toISOString(), metadata: { ...(row.metadata || {}), deferred_outside_calling_hours: true } }).eq("id", row.id).eq("status", "pending");
      deferred++;
      continue;
    }
    const nextAttempt = Number(row.attempt_count || 0) + 1;
    const { data: claimed, error: claimError } = await admin.from("twiga_followups")
      .update({ status: "processing", attempt_count: nextAttempt, last_attempt_at: callTime.toISOString() })
      .eq("id", row.id).eq("status", "pending").select("*").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;
    try {
      const provider = await getProvider(admin, String(row.business_id));
      const outbound = String(provider.settings.sautikit_scripts?.outbound ||
        "Introduce yourself and the business, explain the reason for calling, ask whether this is a convenient time, keep the conversation brief, and respect requests not to be called again.");
      const call = await skRequest(provider.key, "/v1/agents/" + encodeURIComponent(provider.agentId) + "/send", "POST", {
        to: String(row.phone_number),
        prompt_template: "You are calling on behalf of {{business_name}}. Reason for calling: {{call_reason}}. " + outbound,
        variables: { business_name: provider.businessName, call_reason: String(row.task || "Customer follow-up") },
      });
      const callId = String(call.call_id || call.id || call.call?.id || "");
      await admin.from("twiga_call_records").insert({
        business_id: row.business_id, provider: "sautikit", provider_call_id: callId || null,
        channel: "phone", direction: "outbound", from_number: provider.line.line_number,
        to_number: row.phone_number, status: "queued", created_by: row.created_by || null,
        metadata: { scheduled_followup_id: row.id, agent_id: provider.agentId, dispatch_status: "submitted" },
      });
      await admin.from("twiga_followups").update({
        status: "completed", completed_at: new Date().toISOString(),
        metadata: { ...(row.metadata || {}), dispatch_status: "submitted", provider_call_id: callId || null },
      }).eq("id", row.id);
      const repeat = String(row.metadata?.repeat || "none");
      if (repeat === "daily" || repeat === "weekly") {
        const nextAt = new Date(row.due_at);
        nextAt.setUTCDate(nextAt.getUTCDate() + (repeat === "daily" ? 1 : 7));
        const nextId = crypto.randomUUID();
        await admin.from("twiga_followups").insert({
          id: nextId, business_id: row.business_id, customer_name: row.customer_name || null,
          phone_number: row.phone_number, task: row.task, channel: "phone", due_at: nextAt.toISOString(),
          status: "pending", consent_status: "confirmed", created_by: row.created_by || null,
          metadata: { ...(row.metadata || {}), series_id: String(row.metadata?.series_id || row.id), occurrence: Number(row.metadata?.occurrence || 1) + 1, dispatch_status: null },
        });
      }
      submitted++;
    } catch (error) {
      const status = Number((error as any)?.status || 0);
      const retryable = status === 429 || status >= 500 || status === 0;
      const canRetry = retryable && nextAttempt < 3;
      const message = error instanceof Error ? error.message : "Provider submission failed.";
      await admin.from("twiga_followups").update({
        status: canRetry ? "pending" : "failed",
        due_at: canRetry ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : row.due_at,
        last_attempt_at: new Date().toISOString(),
        metadata: { ...(row.metadata || {}), dispatch_status: canRetry ? "retrying" : "failed", last_error: message.slice(0, 300) },
      }).eq("id", row.id);
      failed++;
    }
  }
  return { processed: (due || []).length, submitted, deferred, failed };
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !service) return json({ error: "TWIGA server is not configured." }, 503);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (action === "process_due_calls") {
      if (!(await verifyCron(req))) return json({ error: "Scheduled worker signature is invalid or expired." }, 401);
      return json(await processDueCalls(admin));
    }
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ") || !anon) return json({ error: "Sign in required." }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const user = authData?.user;
    if (authError || !user) return json({ error: "Your sign-in has expired. Sign in again." }, 401);
    const businessId = String(body.businessId || "").trim();
    if (!businessId) return json({ error: "Choose a business workspace first." }, 400);
    const { data: adminRow, error: adminError } = await admin.from("twiga_platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (adminError) throw adminError;
    const isPlatformAdmin = !!adminRow;
    const { data: membership, error: membershipError } = await admin.from("business_members").select("role").eq("business_id", businessId).eq("user_id", user.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership && !isPlatformAdmin) return json({ error: "You are not authorised for this business." }, 403);
    const canManage = isPlatformAdmin || ["owner", "admin"].includes(String(membership?.role || ""));
    if (action === "list") {
      const { data: calls, error } = await admin.from("twiga_followups")
        .select("id,phone_number,task,due_at,status,metadata,attempt_count,last_attempt_at,completed_at,created_at")
        .eq("business_id", businessId).eq("channel", "phone").contains("metadata", { kind: KIND })
        .order("due_at", { ascending: true }).limit(100);
      if (error) throw error;
      return json({ calls: calls || [] });
    }
    if (action === "schedule") {
      if (!canManage) return json({ error: "Only the business owner, admin or TWIGA platform administrator can schedule calls." }, 403);
      if (body.authorised !== true) return json({ error: "Confirm that every recipient has authorised these calls." }, 400);
      const contacts = Array.isArray(body.contacts) ? body.contacts : [];
      if (!contacts.length || contacts.length > 100) return json({ error: "Provide between 1 and 100 recipient phone numbers." }, 400);
      const reason = String(body.reason || "").trim().slice(0, 500);
      if (!reason) return json({ error: "Enter the reason for calling." }, 400);
      const scheduledAt = new Date(String(body.scheduledAt || ""));
      if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 30000) return json({ error: "Choose a future call time at least 30 seconds from now." }, 400);
      const repeat = ["none", "daily", "weekly"].includes(String(body.repeat || "")) ? String(body.repeat) : "none";
      const provider = await getProvider(admin, businessId);
      const numbers = Array.from(new Set(contacts.map((contact: Row) => String(contact?.phone || "").trim())));
      if (numbers.some((phone) => !/^\+[1-9]\d{7,14}$/.test(phone))) return json({ error: "All phone numbers must use international format, for example +2547XXXXXXXX." }, 400);
      const rows = numbers.map((phone) => {
        const id = crypto.randomUUID();
        return {
          id, business_id: businessId, customer_name: null, phone_number: phone, task: reason,
          channel: "phone", due_at: scheduledAt.toISOString(), status: "pending", consent_status: "confirmed", created_by: user.id,
          metadata: { kind: KIND, series_id: id, agent_id: provider.agentId, repeat, timezone: String(body.timezone || "Africa/Nairobi"), scheduled_by: user.id, dispatch_status: "scheduled" },
        };
      });
      const { error: insertError } = await admin.from("twiga_followups").insert(rows);
      if (insertError) throw insertError;
      return json({ scheduledCount: rows.length, message: rows.length + " authorised call(s) scheduled. The same published SautiKit agent and voice will be used." });
    }
    if (action === "cancel") {
      if (!canManage) return json({ error: "Only the business owner, admin or TWIGA platform administrator can cancel scheduled calls." }, 403);
      const seriesId = String(body.seriesId || "").trim();
      if (!seriesId) return json({ error: "Choose a scheduled call series to cancel." }, 400);
      const { data: cancelled, error } = await admin.from("twiga_followups")
        .update({ status: "cancelled", completed_at: new Date().toISOString(), metadata: { cancelled_by: user.id, kind: KIND, series_id: seriesId, dispatch_status: "cancelled" } })
        .eq("business_id", businessId).eq("channel", "phone").eq("status", "pending")
        .contains("metadata", { kind: KIND, series_id: seriesId }).select("id");
      if (error) throw error;
      return json({ cancelledCount: (cancelled || []).length, message: "Future call(s) in this series cancelled." });
    }
    return json({ error: "Unknown scheduled-call action." }, 404);
  } catch (error) {
    const err = error as Error & { status?: number };
    console.error("twiga-scheduled-calls", err.message);
    return json({ error: err.message || "Scheduled-call operation failed." }, err.status && err.status >= 400 && err.status < 600 ? err.status : 500);
  }
});
