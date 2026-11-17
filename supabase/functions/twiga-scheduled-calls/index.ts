const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-timestamp, x-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const API = "https://api.sautikit.com";
const KIND = "sautikit_scheduled_call";
const BASE = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
type Row = Record<string, any>;

async function adminRest(path: string, method = "GET", body?: unknown) {
  const headers: Record<string, string> = {
    apikey: SERVICE,
    Authorization: "Bearer " + SERVICE,
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["Prefer"] = "return=representation";
  }
  const response = await fetch(BASE + "/rest/v1/" + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: raw.slice(0, 500) }; }
  if (!response.ok) {
    const message = String(data?.message || data?.error_description || data?.error || "Supabase database request failed (HTTP " + response.status + ").");
    throw Object.assign(new Error(message), { status: response.status });
  }
  return data;
}
async function getUser(auth: string) {
  const response = await fetch(BASE + "/auth/v1/user", { headers: { apikey: ANON, Authorization: auth } });
  if (!response.ok) return null;
  return await response.json();
}
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
async function getProvider(businessId: string) {
  const lines = await adminRest("twiga_phone_lines?business_id=eq." + encodeURIComponent(businessId) + "&provider=eq.sautikit&select=*&order=created_at.desc&limit=1");
  const line = Array.isArray(lines) ? lines[0] : null;
  if (!line || !line.outbound_enabled || line.outbound_status !== "active") throw Object.assign(new Error("This business does not have an active SautiKit outbound line."), { status: 409 });
  const settings: Row = line.settings && typeof line.settings === "object" ? line.settings : {};
  const agentId = String(settings.inbound_agent_id || "");
  const numberId = String(line.provider_reference || "");
  if (!agentId || !numberId) throw Object.assign(new Error("The existing phone line is missing its published agent or provider number ID."), { status: 409 });
  const secret = await adminRest("rpc/twiga_get_platform_secret", "POST", { p_provider: "sautikit_platform_api_key" });
  const key = String(secret || "");
  if (!key) throw Object.assign(new Error("Connect the SautiKit API key in Phone & AI before scheduling calls."), { status: 409 });
  const [agent, number, businesses] = await Promise.all([
    skRequest(key, "/v1/agents/" + encodeURIComponent(agentId)),
    skRequest(key, "/v1/numbers/" + encodeURIComponent(numberId)),
    adminRest("businesses?id=eq." + encodeURIComponent(businessId) + "&select=name&limit=1"),
  ]);
  const inbound = number?.routing?.inbound_agent;
  if (!inbound?.enabled || inbound.agent_id !== agentId) throw Object.assign(new Error("The existing SautiKit number is not verified against this published receptionist."), { status: 409 });
  if (agent?.status && agent.status !== "published") throw Object.assign(new Error("Publish the receptionist before scheduling outbound calls."), { status: 409 });
  return { line, settings, agentId, key, businessName: String(businesses?.[0]?.name || "the business") };
}
async function processDueCalls() {
  const now = new Date();
  const due = await adminRest("twiga_followups?channel=eq.phone&status=eq.pending&consent_status=eq.confirmed&metadata=cs." +
    encodeURIComponent(JSON.stringify({ kind: KIND })) + "&due_at=lte." + encodeURIComponent(now.toISOString()) +
    "&select=*&order=due_at.asc&limit=20");
  let submitted = 0, deferred = 0, failed = 0;
  for (const row of (Array.isArray(due) ? due : []) as Row[]) {
    const callTime = new Date();
    if (!isKenyaCallingTime(callTime)) {
      const next = nextKenyaEight(callTime);
      await adminRest("twiga_followups?id=eq." + encodeURIComponent(row.id) + "&status=eq.pending", "PATCH", {
        due_at: next.toISOString(), metadata: { ...(row.metadata || {}), deferred_outside_calling_hours: true },
      });
      deferred++;
      continue;
    }
    const nextAttempt = Number(row.attempt_count || 0) + 1;
    const claimed = await adminRest("twiga_followups?id=eq." + encodeURIComponent(row.id) + "&status=eq.pending", "PATCH", {
      status: "processing", attempt_count: nextAttempt, last_attempt_at: callTime.toISOString(),
    });
    if (!Array.isArray(claimed) || !claimed.length) continue;
    try {
      const provider = await getProvider(String(row.business_id));
      const outbound = String(provider.settings.sautikit_scripts?.outbound ||
        "Introduce yourself and the business, explain the reason for calling, ask whether this is a convenient time, keep the conversation brief, and respect requests not to be called again.");
      const call = await skRequest(provider.key, "/v1/agents/" + encodeURIComponent(provider.agentId) + "/send", "POST", {
        to: String(row.phone_number),
        prompt_template: "You are calling on behalf of {{business_name}}. Reason for calling: {{call_reason}}. " + outbound,
        variables: { business_name: provider.businessName, call_reason: String(row.task || "Customer follow-up") },
      });
      const callId = String(call.call_id || call.id || call.call?.id || "");
      await adminRest("twiga_call_records", "POST", {
        business_id: row.business_id, provider: "sautikit", provider_call_id: callId || null,
        channel: "phone", direction: "outbound", from_number: provider.line.line_number,
        to_number: row.phone_number, status: "queued", created_by: row.created_by || null,
        metadata: { scheduled_followup_id: row.id, agent_id: provider.agentId, dispatch_status: "submitted" },
      });
      await adminRest("twiga_followups?id=eq." + encodeURIComponent(row.id), "PATCH", {
        status: "completed", completed_at: new Date().toISOString(),
        metadata: { ...(row.metadata || {}), dispatch_status: "submitted", provider_call_id: callId || null },
      });
      const repeat = String(row.metadata?.repeat || "none");
      if (repeat === "daily" || repeat === "weekly") {
        const nextAt = new Date(row.due_at);
        nextAt.setUTCDate(nextAt.getUTCDate() + (repeat === "daily" ? 1 : 7));
        const nextId = crypto.randomUUID();
        await adminRest("twiga_followups", "POST", {
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
      await adminRest("twiga_followups?id=eq." + encodeURIComponent(row.id), "PATCH", {
        status: canRetry ? "pending" : "failed",
        due_at: canRetry ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : row.due_at,
        last_attempt_at: new Date().toISOString(),
        metadata: { ...(row.metadata || {}), dispatch_status: canRetry ? "retrying" : "failed", last_error: message.slice(0, 300) },
      });
      failed++;
    }
  }
  return { processed: Array.isArray(due) ? due.length : 0, submitted, deferred, failed };
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);
  try {
    if (!BASE || !SERVICE) return json({ error: "TWIGA server is not configured." }, 503);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (action === "process_due_calls") {
      if (!(await verifyCron(req))) return json({ error: "Scheduled worker signature is invalid or expired." }, 401);
      return json(await processDueCalls());
    }
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ") || !ANON) return json({ error: "Sign in required." }, 401);
    const user = await getUser(auth);
    if (!user?.id) return json({ error: "Your sign-in has expired. Sign in again." }, 401);
    const businessId = String(body.businessId || "").trim();
    if (!businessId) return json({ error: "Choose a business workspace first." }, 400);
    const [admins, memberships] = await Promise.all([
      adminRest("twiga_platform_admins?user_id=eq." + encodeURIComponent(user.id) + "&select=user_id&limit=1"),
      adminRest("business_members?business_id=eq." + encodeURIComponent(businessId) + "&user_id=eq." + encodeURIComponent(user.id) + "&select=role&limit=1"),
    ]);
    const isPlatformAdmin = Array.isArray(admins) && admins.length > 0;
    const membership = Array.isArray(memberships) ? memberships[0] : null;
    if (!membership && !isPlatformAdmin) return json({ error: "You are not authorised for this business." }, 403);
    const canManage = isPlatformAdmin || ["owner", "admin"].includes(String(membership?.role || ""));
    if (action === "list") {
      const calls = await adminRest("twiga_followups?business_id=eq." + encodeURIComponent(businessId) +
        "&channel=eq.phone&metadata=cs." + encodeURIComponent(JSON.stringify({ kind: KIND })) +
        "&select=id,phone_number,task,due_at,status,metadata,attempt_count,last_attempt_at,completed_at,created_at&order=due_at.asc&limit=100");
      return json({ calls: Array.isArray(calls) ? calls : [] });
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
      const provider = await getProvider(businessId);
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
      await adminRest("twiga_followups", "POST", rows);
      return json({ scheduledCount: rows.length, message: rows.length + " authorised call(s) scheduled. The same published SautiKit agent and voice will be used." });
    }
    if (action === "cancel") {
      if (!canManage) return json({ error: "Only the business owner, admin or TWIGA platform administrator can cancel scheduled calls." }, 403);
      const seriesId = String(body.seriesId || "").trim();
      if (!seriesId) return json({ error: "Choose a scheduled call series to cancel." }, 400);
      const filter = encodeURIComponent(JSON.stringify({ kind: KIND, series_id: seriesId }));
      const cancelled = await adminRest("twiga_followups?business_id=eq." + encodeURIComponent(businessId) +
        "&channel=eq.phone&status=eq.pending&metadata=cs." + filter, "PATCH", {
          status: "cancelled", completed_at: new Date().toISOString(),
          metadata: { cancelled_by: user.id, kind: KIND, series_id: seriesId, dispatch_status: "cancelled" },
        });
      return json({ cancelledCount: Array.isArray(cancelled) ? cancelled.length : 0, message: "Future call(s) in this series cancelled." });
    }
    return json({ error: "Unknown scheduled-call action." }, 404);
  } catch (error) {
    const err = error as Error & { status?: number };
    console.error("twiga-scheduled-calls", err.message);
    return json({ error: err.message || "Scheduled-call operation failed." }, err.status && err.status >= 400 && err.status < 600 ? err.status : 500);
  }
});
