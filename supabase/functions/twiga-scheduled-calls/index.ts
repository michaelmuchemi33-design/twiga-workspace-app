import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-timestamp, x-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
function normalizePhone(value: unknown) {
  let number = safe(value, 40).replace(/[\s().-]/g, "");
  if (/^0[17]\d{8}$/.test(number)) number = "+254" + number.slice(1);
  else if (/^254[17]\d{8}$/.test(number)) number = "+" + number;
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : "";
}
const enc = new TextEncoder();
const safe = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);

const SAUTIKIT_API = "https://api.sautikit.com";
async function skRequest(key: string, path: string, method = "GET", body?: unknown, timeoutMs = 20000) {
  const response = await fetch(SAUTIKIT_API + path, {
    method,
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { message: raw.slice(0, 500) }; }
  if (!response.ok) {
    const details = payload?.error || payload;
    const message = String(details?.message || details?.detail || details?.resolution || (typeof details === "string" ? details : "") || payload?.message || ("SautiKit returned HTTP " + response.status));
    throw Object.assign(new Error(message), { status: response.status, details });
  }
  return payload;
}

function equalHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, b => b.toString(16).padStart(2, "0")).join("");
}
function partsInZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const out: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") out[p.type] = p.value;
  return { year: Number(out.year), month: Number(out.month), day: Number(out.day), hour: Number(out.hour), minute: Number(out.minute) };
}
function localToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(target);
  for (let i = 0; i < 3; i++) {
    const p = partsInZone(guess, timezone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess = new Date(guess.getTime() + target - represented);
  }
  return guess;
}
function nextWindow(date: Date, timezone: string, start: string, end: string, allowedDays?: number[]) {
  const p = partsInZone(date, timezone);
  const days = Array.isArray(allowedDays)
    ? Array.from(new Set(allowedDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6)))
    : [0, 1, 2, 3, 4, 5, 6];
  if (!days.length) throw new Error("This call has no permitted calling days.");
  const hm = (v: string) => {
    const [h, m] = String(v || "08:00").split(":").map(Number);
    return h * 60 + m;
  };
  const startMin = hm(start), endMin = hm(end);
  if (startMin < 0 || startMin >= 1440 || endMin <= startMin || endMin > 1440) {
    throw new Error("The saved calling window is invalid.");
  }
  const sh = Math.floor(startMin / 60), sm = startMin % 60;
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day));
  for (let offset = 0; offset < 15; offset++) {
    const day = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offset));
    if (!days.includes(day.getUTCDay())) continue;
    const y = day.getUTCFullYear(), mo = day.getUTCMonth() + 1, d = day.getUTCDate();
    const windowStart = localToUtc(y, mo, d, sh, sm, timezone);
    const eh = Math.floor(endMin / 60), em = endMin % 60;
    const windowEnd = localToUtc(y, mo, d, eh, em, timezone);
    if (offset === 0) {
      if (date >= windowStart && date < windowEnd) return null;
      if (date < windowStart) return windowStart;
      continue;
    }
    return windowStart;
  }
  throw new Error("No permitted calling day was found in the next 14 days.");
}
async function setJob(admin: any, id: string, values: Record<string, unknown>) {
  const { error } = await admin.from("twiga_scheduled_calls").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}


function plusMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}
function reportDateKey(date: Date, timezone: string) {
  const p = partsInZone(date, timezone);
  return [p.year, String(p.month).padStart(2, "0"), String(p.day).padStart(2, "0")].join("-");
}
async function buildOwnerReportSummary(admin: any, businessId: string, dateKey: string, timezone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const startAt = localToUtc(year, month, day, 0, 0, timezone).toISOString();
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const endAt = localToUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), 0, 0, timezone).toISOString();
  const [ordersResult, tasksResult, appointmentsResult, callsResult, productsResult] = await Promise.all([
    admin.from("twiga_orders").select("total_amount,payment_status,status").eq("business_id", businessId).gte("created_at", startAt).lt("created_at", endAt).limit(1000),
    admin.from("twiga_tasks").select("status").eq("business_id", businessId).limit(1000),
    admin.from("twiga_appointments").select("status").eq("business_id", businessId).gte("scheduled_at", startAt).lt("scheduled_at", endAt).limit(1000),
    admin.from("twiga_call_records").select("direction,status").eq("business_id", businessId).gte("created_at", startAt).lt("created_at", endAt).limit(1000),
    admin.from("twiga_products").select("name,stock_quantity,low_stock_threshold,track_stock,is_active").eq("business_id", businessId).eq("is_active", true).limit(1000),
  ]);
  const unavailable: string[] = [];
  if (ordersResult.error) unavailable.push("orders and sales");
  if (tasksResult.error) unavailable.push("tasks");
  if (appointmentsResult.error) unavailable.push("appointments");
  if (callsResult.error) unavailable.push("call records");
  if (productsResult.error) unavailable.push("inventory");
  const orders = ordersResult.error ? [] : (ordersResult.data || []);
  const tasks = tasksResult.error ? [] : (tasksResult.data || []);
  const appointments = appointmentsResult.error ? [] : (appointmentsResult.data || []);
  const calls = callsResult.error ? [] : (callsResult.data || []);
  const products = productsResult.error ? [] : (productsResult.data || []);
  const totalValue = orders.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.total_amount || 0)), 0);
  const paid = orders.filter((row: any) => String(row.payment_status || "").toLowerCase() === "paid").length;
  const unpaid = orders.filter((row: any) => String(row.payment_status || "").toLowerCase() === "unpaid").length;
  const openTasks = tasks.filter((row: any) => !["done", "completed", "cancelled", "closed", "dismissed"].includes(String(row.status || "").toLowerCase())).length;
  const activeAppointments = appointments.filter((row: any) => !["cancelled", "canceled"].includes(String(row.status || "").toLowerCase())).length;
  const inboundCalls = calls.filter((row: any) => String(row.direction || "").toLowerCase() === "inbound").length;
  const outboundCalls = calls.filter((row: any) => String(row.direction || "").toLowerCase() === "outbound").length;
  const lowStock = products.filter((row: any) => row.track_stock === true && Number(row.stock_quantity || 0) <= Number(row.low_stock_threshold || 0));
  const lines = [
    "Daily business report for " + dateKey + ".",
    "Orders recorded: " + orders.length + ". Total order value: " + new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(totalValue) + ". Paid orders: " + paid + ". Unpaid orders: " + unpaid + ".",
    "Appointments scheduled today: " + activeAppointments + ". Inbound calls: " + inboundCalls + ". Outbound calls: " + outboundCalls + ".",
    "Open staff tasks: " + openTasks + ". Low-stock products: " + lowStock.length + (lowStock.length ? " (" + lowStock.slice(0, 5).map((row: any) => String(row.name || "item").slice(0, 60)).join(", ") + ")" : "") + ".",
  ];
  if (unavailable.length) lines.push("Data not available for: " + unavailable.join(", ") + ". Do not guess these figures.");
  lines.push("Keep the spoken report short, read out the important numbers, and ask whether the owner wants any item escalated to staff. Do not disclose customer names, phone numbers or private customer notes.");
  return lines.join(" ");
}
async function enqueueOwnerReportCalls(admin: any) {
  const timezone = "Africa/Nairobi";
  const now = new Date();
  const parts = partsInZone(now, timezone);
  const dateKey = reportDateKey(now, timezone);
  const profilesResult = await admin.from("twiga_business_profiles")
    .select("business_id,owner_name,updated_by,setup_details").limit(1000);
  if (profilesResult.error) throw profilesResult.error;
  let queued = 0;
  for (const profile of profilesResult.data || []) {
    const details = profile.setup_details && typeof profile.setup_details === "object" ? profile.setup_details : {};
    const settings = details.owner_report_call && typeof details.owner_report_call === "object" ? details.owner_report_call : {};
    if (settings.enabled !== true) continue;
    const callTime = safe(settings.callTime || "16:30", 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(callTime)) continue;
    const [hour, minute] = callTime.split(":").map(Number);
    const minutesLate = parts.hour * 60 + parts.minute - (hour * 60 + minute);
    if (minutesLate < 0 || minutesLate > 10) continue;
    const primaryName = safe(settings.ownerName || profile.owner_name, 120);
    const primaryPhone = normalizePhone(settings.ownerPhone);
    const nextName = safe(settings.nextOwnerName, 120);
    const nextPhone = normalizePhone(settings.nextOwnerPhone);
    if (!primaryName || !primaryPhone || !nextName || !nextPhone || primaryPhone === nextPhone) continue;
    const businessId = String(profile.business_id || "");
    if (!businessId) continue;
    const { data: existing, error: existingError } = await admin.from("twiga_scheduled_calls")
      .select("id").eq("business_id", businessId)
      .filter("metadata->>owner_report_date", "eq", dateKey).limit(1);
    if (existingError) throw existingError;
    if ((existing || []).length) continue;
    const { data: business, error: businessError } = await admin.from("businesses")
      .select("name").eq("id", businessId).maybeSingle();
    if (businessError) throw businessError;
    const businessName = safe(business?.name || "your business", 120);
    const reportSummary = await buildOwnerReportSummary(admin, businessId, dateKey, timezone);
    const seriesId = crypto.randomUUID();
    const firstAt = localToUtc(parts.year, parts.month, parts.day, hour, minute, timezone);
    const rows = [
      { attempt: 1, name: primaryName, phone: primaryPhone, role: "primary" },
      { attempt: 2, name: primaryName, phone: primaryPhone, role: "primary" },
      { attempt: 3, name: nextName, phone: nextPhone, role: "backup" },
    ].map((target) => ({
      business_id: businessId,
      customer_name: target.name,
      phone_number: target.phone,
      reason: "Daily business report for " + dateKey,
      scheduled_at: plusMinutes(firstAt, (target.attempt - 1) * 30).toISOString(),
      timezone,
      consent_status: "opted_in",
      trigger_type: "timer",
      trigger_conditions: { owner_report: true, owner_report_date: dateKey, allowed_calling_days: [0, 1, 2, 3, 4, 5, 6] },
      calling_window_start: "08:00",
      calling_window_end: "20:00",
      status: "scheduled",
      attempt_count: 0,
      max_attempts: 1,
      retry_interval_minutes: 30,
      created_by: profile.updated_by || null,
      metadata: {
        owner_report_series_id: seriesId,
        owner_report_date: dateKey,
        owner_report_attempt: target.attempt,
        owner_report_recipient_role: target.role,
        owner_report_business_name: businessName,
        owner_report_summary: reportSummary,
        dispatch_status: "pending",
      },
    }));
    const { error: insertError } = await admin.from("twiga_scheduled_calls").insert(rows);
    if (insertError) throw insertError;
    queued += rows.length;
  }
  return { queued, date: dateKey };
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !service) return json({ error: "TWIGA server is not configured." }, 503);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const action = safe(body.action, 80);

    // User-facing queue actions authenticate the caller's Supabase JWT and verify business ownership.
    if (action !== "process_due_calls") {
      const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const authHeader = safe(req.headers.get("Authorization"), 4000);
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!anon || !token) return json({ error: "Sign in to manage scheduled calls." }, 401);
      const userClient = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
      const { data: userData, error: authError } = await userClient.auth.getUser(token);
      const user = userData?.user;
      if (authError || !user) return json({ error: "Your session is invalid or expired. Sign in again." }, 401);
      const businessId = safe(body.businessId, 80);
      if (!businessId) return json({ error: "Choose a business workspace first." }, 400);
      const { data: member, error: memberError } = await admin.from("business_members").select("role").eq("business_id", businessId).eq("user_id", user.id).maybeSingle();
      if (memberError) throw memberError;
      if (!member || !["owner", "admin", "manager"].includes(String(member.role || ""))) return json({ error: "Only a business owner, admin or manager can manage scheduled calls." }, 403);

      if (action === "list") {
        const { data: rows, error } = await admin.from("twiga_scheduled_calls").select("*").eq("business_id", businessId).order("scheduled_at", { ascending: false }).limit(100);
        if (error) throw error;
        const calls = (rows || []).map((row: any) => ({ id: row.id, phone_number: row.phone_number, task: row.reason, due_at: row.scheduled_at, status: row.status, last_error: row.last_error, metadata: { ...(row.metadata || {}), series_id: row.metadata?.series_id || row.id, repeat: row.metadata?.repeat || "none", dispatch_status: row.status, trigger_type: row.trigger_type } }));
        return json({ calls });
      }

      if (action === "schedule") {
        if (body.authorised !== true) return json({ error: "Explicit recipient consent is required before scheduling calls." }, 400);
        const rawContacts = Array.isArray(body.contacts) ? body.contacts : [];
        if (!rawContacts.length || rawContacts.length > 200) return json({ error: "Schedule between 1 and 200 recipients per batch." }, 400);
        const defaultScheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
        const contacts = rawContacts.map((item: any) => ({
          phone: normalizePhone(typeof item === "string" ? item : item?.phone),
          name: safe(item?.name, 120),
          scheduledAt: item && typeof item === "object" && item.scheduledAt
            ? new Date(item.scheduledAt)
            : defaultScheduledAt,
          profile: {
            email: safe(item?.email, 180),
            itemsBought: safe(item?.itemsBought || item?.items_bought || item?.purchases || "", 1500),
            notes: safe(item?.notes, 1000),
            preferredLanguage: safe(item?.preferredLanguage || item?.preferred_language || "", 80),
            lastPurchaseAt: safe(item?.lastPurchaseAt || item?.last_purchase_at || "", 40),
            followUpAt: safe(item?.followUpAt || item?.follow_up_at || "", 40),
          },
          marketingConsent: item?.marketingConsent === true || item?.marketing_consent === true || item?.consent === true,
          optOut: item?.optOut === true || item?.opt_out === true || item?.unsubscribed === true,
        }));
        if (contacts.some((contact: any) => contact.marketingConsent !== true || contact.optOut === true)) return json({ error: "Every recipient must have recorded permission for this call and must not have opted out. Re-import the contact list with valid consent records before scheduling." }, 400);
        if (contacts.some((contact: any) => !contact.phone)) return json({ error: "One or more phone numbers are invalid. Use Kenyan 07… / 01… or international +country format." }, 400);
        if (new Set(contacts.map((contact: any) => contact.phone)).size !== contacts.length) return json({ error: "The recipient list contains duplicate phone numbers. Remove duplicates before scheduling." }, 400);
        const requestedPhones = contacts.map((contact: any) => contact.phone);
        const [savedCustomersResult, paidOrdersResult] = await Promise.all([
          admin.from("twiga_customers").select("name,phone,email,notes").eq("business_id", businessId).in("phone", requestedPhones).limit(500),
          admin.from("twiga_orders").select("customer_phone,items,description,total_amount,currency,created_at,payment_status,status").eq("business_id", businessId).in("customer_phone", requestedPhones).limit(1000),
        ]);
        if (savedCustomersResult.error) throw savedCustomersResult.error;
        if (paidOrdersResult.error) throw paidOrdersResult.error;
        const savedCustomerByPhone = new Map<string, any>();
        for (const person of savedCustomersResult.data || []) {
          const normalized = normalizePhone(person.phone);
          if (normalized) savedCustomerByPhone.set(normalized, person);
        }
        const purchasedByPhone = new Map<string, { items: string[]; lastPurchaseAt: string }>();
        for (const order of paidOrdersResult.data || []) {
          const paymentStatus = String(order.payment_status || "").toLowerCase();
          const orderStatus = String(order.status || "").toLowerCase();
          if (paymentStatus !== "paid" && !["completed", "delivered", "fulfilled"].includes(orderStatus)) continue;
          const normalized = normalizePhone(order.customer_phone);
          if (!normalized) continue;
          let items: any[] = [];
          if (Array.isArray(order.items)) items = order.items;
          else if (typeof order.items === "string" && order.items.trim()) {
            try { const parsed = JSON.parse(order.items); items = Array.isArray(parsed) ? parsed : []; } catch { items = []; }
          }
          const itemText = items.map((item: any) => {
            const name = safe(item?.name || item?.product_name || item?.item || "", 100);
            const quantity = Math.max(1, Number(item?.quantity || 1));
            return name ? name + (quantity > 1 ? " x" + quantity : "") : "";
          }).filter(Boolean);
          if (!itemText.length && safe(order.description, 160)) itemText.push(safe(order.description, 160));
          const entry = purchasedByPhone.get(normalized) || { items: [], lastPurchaseAt: "" };
          entry.items.push(...itemText);
          if (!entry.lastPurchaseAt || String(order.created_at || "") > entry.lastPurchaseAt) entry.lastPurchaseAt = String(order.created_at || "");
          purchasedByPhone.set(normalized, entry);
        }
        for (const contact of contacts) {
          const savedCustomer = savedCustomerByPhone.get(contact.phone);
          const purchaseHistory = purchasedByPhone.get(contact.phone);
          if (!contact.name && savedCustomer?.name) contact.name = safe(savedCustomer.name, 120);
          if (!contact.profile.email && savedCustomer?.email) contact.profile.email = safe(savedCustomer.email, 180);
          if (!contact.profile.notes && savedCustomer?.notes) contact.profile.notes = safe(savedCustomer.notes, 1000);
          if (!contact.profile.itemsBought && purchaseHistory?.items.length) contact.profile.itemsBought = Array.from(new Set(purchaseHistory.items)).slice(0, 12).join(", ").slice(0, 1500);
          if (!contact.profile.lastPurchaseAt && purchaseHistory?.lastPurchaseAt) contact.profile.lastPurchaseAt = purchaseHistory.lastPurchaseAt.slice(0, 40);
        }

        const invalidSchedule = contacts.find((contact: any) => !contact.scheduledAt || !Number.isFinite(contact.scheduledAt.getTime()) || contact.scheduledAt.getTime() < Date.now() + 30000);
        if (invalidSchedule) return json({ error: "Every recipient needs a future calling time at least 30 seconds from now." }, 400);
        const reason = safe(body.reason, 500);
        if (!reason) return json({ error: "Enter the reason for calling." }, 400);
        const allowedDays = Array.isArray(body.allowedDays)
          ? Array.from(new Set(body.allowedDays.map(Number).filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6)))
          : [0, 1, 2, 3, 4, 5, 6];
        if (!allowedDays.length) return json({ error: "Select at least one permitted calling day." }, 400);
        if (Array.isArray(body.allowedDays) && allowedDays.length !== body.allowedDays.length) return json({ error: "Calling days must be weekday numbers from 0 (Sunday) to 6 (Saturday)." }, 400);
        const repeat = ["daily", "weekly"].includes(String(body.repeat)) ? String(body.repeat) : "none";
        const repeatCount = repeat === "none" ? 1 : Math.max(2, Math.min(30, Number(body.repeatCount) || 4));
        const retryOnNoAnswer = body.retryOnNoAnswer !== false;
        const retryDelayMinutes = Math.min(60, Math.max(1, Number(body.retryDelayMinutes) || 5));
        const triggerTypes = ["timer", "missed_call", "appointment_reminder", "follow_up", "conditional"];
        const triggerType = triggerTypes.includes(String(body.triggerType)) ? String(body.triggerType) : "timer";
        const onlyIfMissed = body.onlyIfMissed === true || triggerType === "missed_call";
        const onlyIfUnpaid = body.onlyIfUnpaid === true;
        const sourceCallId = safe(body.sourceCallId, 80);
        const orderId = safe(body.orderId, 80);
        if (onlyIfMissed && !/^[0-9a-f-]{36}$/i.test(sourceCallId)) return json({ error: "A valid source call record ID is required for a missed-call condition." }, 400);
        if (onlyIfUnpaid && !/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "A valid order ID is required for an unpaid-order condition." }, 400);
        if (onlyIfMissed) {
          const { data: sourceCall, error: sourceError } = await admin.from("twiga_call_records").select("id,status,direction").eq("id", sourceCallId).eq("business_id", businessId).eq("direction", "inbound").maybeSingle();
          if (sourceError) throw sourceError;
          if (!sourceCall) return json({ error: "Choose a real inbound call record from this business." }, 400);
        }
        if (onlyIfUnpaid) {
          const { data: order, error: orderError } = await admin.from("twiga_orders").select("id,payment_status").eq("id", orderId).eq("business_id", businessId).maybeSingle();
          if (orderError) throw orderError;
          if (!order) return json({ error: "The order ID does not belong to this business." }, 400);
          if (String(order.payment_status || "").toLowerCase() !== "unpaid") return json({ error: "That order is not currently marked unpaid; no reminder call was scheduled." }, 400);
        }
        const windowStart = safe(body.callingWindowStart || "08:00", 5);
        const windowEnd = safe(body.callingWindowEnd || "20:00", 5);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(windowStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(windowEnd) || windowStart >= windowEnd) return json({ error: "The allowed calling window must be a valid start and end time." }, 400);
        const seriesId = crypto.randomUUID();
        const timezone = safe(body.timezone || "Africa/Nairobi", 80);
        const rows = contacts.map((contact: any) => ({
          business_id: businessId, customer_name: contact.name, phone_number: contact.phone, reason,
          scheduled_at: contact.scheduledAt.toISOString(), timezone, consent_status: "opted_in", trigger_type: triggerType,
          trigger_conditions: { only_if_missed_call: onlyIfMissed, only_if_unpaid: onlyIfUnpaid, order_id: orderId || null, allowed_calling_days: allowedDays },
          source_call_id: sourceCallId || null, calling_window_start: windowStart, calling_window_end: windowEnd,
          status: "scheduled", attempt_count: 0, max_attempts: 3, retry_interval_minutes: 30, created_by: user.id,
          metadata: {
            series_id: seriesId, repeat, repeat_remaining: repeatCount, dispatch_status: "pending",
            ...(contact.profile && Object.values(contact.profile).some(Boolean) ? { contact_profile: contact.profile } : {}),
            no_answer_retry: { enabled: retryOnNoAnswer, attempts: 0, max_attempts: 2, delay_minutes: retryDelayMinutes },
          },
        }));
        const { data: inserted, error } = await admin.from("twiga_scheduled_calls").insert(rows).select("id");
        if (error) throw error;
        return json({ success: true, scheduledCount: inserted?.length || rows.length, seriesId, message: (inserted?.length || rows.length) + " consented call(s) added to the queue." });
      }

      if (action === "cancel") {
        const seriesId = safe(body.seriesId, 80);
        if (!seriesId) return json({ error: "Choose a scheduled call series to cancel." }, 400);
        const values = { status: "cancelled", last_error: "Cancelled by the business workspace.", updated_at: new Date().toISOString() };
        const { data: seriesRows, error: seriesError } = await admin.from("twiga_scheduled_calls").update(values).eq("business_id", businessId).filter("metadata->>series_id", "eq", seriesId).in("status", ["scheduled", "waiting_for_provider"]).select("id");
        if (seriesError) throw seriesError;
        const { data: singleRows, error: singleError } = await admin.from("twiga_scheduled_calls").update(values).eq("business_id", businessId).eq("id", seriesId).in("status", ["scheduled", "waiting_for_provider"]).select("id");
        if (singleError) throw singleError;
        const count = (seriesRows?.length || 0) + (singleRows?.length || 0);
        return json({ success: true, cancelledCount: count, message: count + " future call(s) cancelled." });
      }
      return json({ error: "Unknown scheduled-call action." }, 400);
    }

    const timestamp = safe(req.headers.get("x-timestamp"), 32);
    const signature = safe(req.headers.get("x-signature"), 128).toLowerCase();
    const seconds = Number(timestamp);
    if (!/^\d{10,13}$/.test(timestamp) || !Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) {
      return json({ error: "Invalid or expired scheduler timestamp." }, 401);
    }
    const { data: cronSecret, error: cronSecretError } = await admin.rpc("twiga_get_platform_secret", { p_provider: "twiga_scheduled_calls_cron_secret" });
    if (cronSecretError || !cronSecret) return json({ error: "Scheduled-call signing secret is not configured." }, 503);
    const expected = await hmacHex(String(cronSecret), timestamp);
    if (!equalHex(signature, expected)) return json({ error: "Invalid scheduler signature." }, 401);

    const { data: platformKeyData, error: platformKeyError } = await admin.rpc("twiga_get_platform_secret", { p_provider: "sautikit_platform_api_key" });
    if (platformKeyError) throw platformKeyError;
    const platformApiKey = String(platformKeyData || "");
    let ownerReportQueue = { queued: 0, date: reportDateKey(new Date(), "Africa/Nairobi"), error: "" };
    try { ownerReportQueue = { ...await enqueueOwnerReportCalls(admin), error: "" }; }
    catch (ownerReportError) {
      ownerReportQueue.error = ownerReportError instanceof Error ? ownerReportError.message.slice(0, 500) : "Owner report jobs could not be queued.";
      console.error("Owner report scheduling failed:", ownerReportQueue.error);
    }
    // Match the receptionist's credential policy: use TWIGA's shared key first,
    // then a business-owned SautiKit key only for that same business.
    const getSautiKitKey = async (targetBusinessId: string) => {
      if (platformApiKey) return platformApiKey;
      const { data, error } = await admin.rpc("twiga_get_business_provider_secret", {
        p_business_id: targetBusinessId, p_provider: "sautikit",
      });
      if (error) throw error;
      return String(data || "");
    };
    // Poll previously accepted calls so the queue and call history show their real outcome.
    const { data: submittedCalls } = await admin.from("twiga_scheduled_calls")
      .select("*")
      .eq("status", "submitted").not("provider_call_id", "is", null)
      .order("updated_at", { ascending: true }).limit(20);
    let polledCalls = 0;
    for (const item of submittedCalls || []) {
      try {
        const apiKey = await getSautiKitKey(String(item.business_id || ""));
        if (!apiKey) continue;
        const callStatus = await skRequest(apiKey, "/v1/calls/" + encodeURIComponent(String(item.provider_call_id)), "GET", undefined, 12000);
        const callData = callStatus.call || callStatus.data?.call || (callStatus.data && typeof callStatus.data === "object" ? callStatus.data : callStatus);
        const rawProviderStatus = String(callData.status || callData.state || "").toLowerCase().replace(/-/g, "_");
        const failureCode = String(callData.failure_code || callData.failureCode || callData.error_code || "").toLowerCase();
        const noAnswer = rawProviderStatus === "no_answer" || rawProviderStatus === "busy" || /no.?answer/.test(failureCode);
        const invalidNumber = ["invalid_number", "invalid_destination", "invalid_phone"].includes(rawProviderStatus)
          || /invalid.*(number|destination|phone|e164)|(?:number|destination|phone|e164).*invalid/.test(failureCode);
        const providerStatus = invalidNumber ? "invalid_number" : noAnswer ? "no_answer" : rawProviderStatus;
        if (!["completed", "failed", "no_answer", "busy", "canceled", "cancelled", "invalid_number"].includes(providerStatus)) continue;
        const finalStatus = providerStatus === "completed" ? "completed" : "failed";
        const finishedAt = callData.ended_at || callData.completed_at || new Date().toISOString();
        const retryConfig = item.metadata?.no_answer_retry && typeof item.metadata.no_answer_retry === "object"
          ? item.metadata.no_answer_retry : { enabled: false, attempts: 0, max_attempts: 2, delay_minutes: 5 };
        const noAnswerAttempts = Math.max(0, Number(retryConfig.attempts || 0));
        const noAnswerMaxAttempts = Math.min(2, Math.max(1, Number(retryConfig.max_attempts || 2)));
        const shouldRetryNoAnswer = noAnswer && retryConfig.enabled === true && noAnswerAttempts + 1 < noAnswerMaxAttempts;
        if (shouldRetryNoAnswer) {
          const retryDelayMinutes = Math.min(60, Math.max(1, Number(retryConfig.delay_minutes || 5)));
          const retryAt = new Date(Date.now() + retryDelayMinutes * 60000).toISOString();
          await setJob(admin, item.id, {
            status: "scheduled",
            scheduled_at: retryAt,
            provider_call_id: null,
            completed_at: null,
            last_error: "No answer on attempt " + (noAnswerAttempts + 1) + ". One more call is scheduled in " + retryDelayMinutes + " minutes.",
            metadata: {
              ...(item.metadata || {}),
              no_answer_retry: { ...retryConfig, enabled: true, attempts: noAnswerAttempts + 1, max_attempts: noAnswerMaxAttempts, delay_minutes: retryDelayMinutes },
              dispatch_status: "retry_scheduled",
              last_provider_outcome: "no_answer",
            },
          });
        } else {
          const unreachable = noAnswer && retryConfig.enabled === true && noAnswerAttempts + 1 >= noAnswerMaxAttempts;
          await setJob(admin, item.id, {
            status: finalStatus,
            completed_at: finishedAt,
            last_error: finalStatus === "failed"
              ? (invalidNumber
                ? "Invalid number confirmed by SautiKit. Check the number and country code before trying again."
                : unreachable
                  ? "Unreachable after two unanswered call attempts. The number has not been verified as invalid."
                  : noAnswer ? "The contact did not answer."
                  : providerStatus === "busy" ? "The contact's line was busy."
                  : "The provider did not complete the call.")
              : null,
            metadata: {
              ...(item.metadata || {}),
              ...(invalidNumber
                ? { final_outcome: "invalid_number", dispatch_status: "invalid_number", last_provider_outcome: providerStatus }
                : unreachable
                  ? { final_outcome: "unreachable_after_no_answer", dispatch_status: "unreachable", last_provider_outcome: providerStatus }
                  : { last_provider_outcome: providerStatus }),
              ...(retryConfig.enabled === true ? { no_answer_retry: { ...retryConfig, attempts: Math.min(noAnswerMaxAttempts, noAnswerAttempts + (noAnswer ? 1 : 0)) } } : {}),
            },
          });
        }
        if (finalStatus === "completed" && item.metadata?.owner_report_series_id) {
          const seriesId = safe(item.metadata.owner_report_series_id, 80);
          const { error: cancelError } = await admin.from("twiga_scheduled_calls")
            .update({ status: "cancelled", last_error: "The owner answered an earlier daily report call.", updated_at: new Date().toISOString() })
            .eq("business_id", item.business_id)
            .filter("metadata->>owner_report_series_id", "eq", seriesId)
            .in("status", ["scheduled", "waiting_for_provider"]);
          if (cancelError) console.error("Could not stop remaining owner report attempts:", cancelError.message);
        }
        const repeatMode = safe(item.metadata?.repeat || "none", 20);
        const repeatRemaining = Number(item.metadata?.repeat_remaining || 1);
        if (finalStatus === "completed" && ["daily", "weekly"].includes(repeatMode) && repeatRemaining > 1) {
          const nextAt = new Date(item.scheduled_at);
          nextAt.setUTCDate(nextAt.getUTCDate() + (repeatMode === "daily" ? 1 : 7));
          const nextMetadata = { ...(item.metadata || {}), repeat_remaining: repeatRemaining - 1, dispatch_status: "pending" };
          const { error: repeatError } = await admin.from("twiga_scheduled_calls").insert({
            business_id: item.business_id, customer_name: item.customer_name || "", phone_number: item.phone_number, reason: item.reason,
            scheduled_at: nextAt.toISOString(), timezone: item.timezone || "Africa/Nairobi", consent_status: item.consent_status,
            trigger_type: item.trigger_type, trigger_conditions: item.trigger_conditions || {}, source_call_id: item.source_call_id || null,
            calling_window_start: item.calling_window_start || "08:00", calling_window_end: item.calling_window_end || "20:00",
            voice_model_id: item.voice_model_id || null, voice_id: item.voice_id || null, status: "scheduled", attempt_count: 0,
            max_attempts: item.max_attempts || 3, retry_interval_minutes: item.retry_interval_minutes || 30, created_by: item.created_by || null, metadata: nextMetadata,
          });
          if (repeatError) console.error("Could not create next repeat call:", repeatError.message);
        }
        const { data: existingCallRecord } = await admin.from("twiga_call_records").select("metadata")
          .eq("provider_call_id", item.provider_call_id).eq("business_id", item.business_id).maybeSingle();
        await admin.from("twiga_call_records").update({
          status: providerStatus,
          ended_at: finishedAt,
          duration_seconds: Number(callData.duration_seconds || callData.duration_s || 0),
          transcript: typeof callData.transcript === "string" ? callData.transcript.slice(0, 30000) : undefined,
          summary: typeof callData.summary === "string" ? callData.summary.slice(0, 4000) : undefined,
          metadata: { ...(existingCallRecord?.metadata || {}), scheduled_call_id: item.id, provider_status: providerStatus, ...(failureCode ? { provider_failure_code: failureCode } : {}) },
        }).eq("provider_call_id", item.provider_call_id).eq("business_id", item.business_id);
        polledCalls++;
      } catch (pollError) { console.error("Could not refresh SautiKit call status:", pollError instanceof Error ? pollError.message : "unknown error"); }
    }
    // Requeue provider-waiting jobs only after this business has a verified,
    // explicitly enabled outbound line and a usable SautiKit credential.
    const { data: waitingJobs, error: waitingError } = await admin.from("twiga_scheduled_calls")
      .select("id,business_id").eq("status", "waiting_for_provider").order("updated_at", { ascending: true }).limit(50);
    if (waitingError) throw waitingError;
    for (const waiting of waitingJobs || []) {
      try {
        const { data: line } = await admin.from("twiga_phone_lines").select("provider,outbound_enabled,outbound_status,settings")
          .eq("business_id", waiting.business_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const settings = line?.settings && typeof line.settings === "object" ? line.settings : {};
        const ready = line?.provider === "sautikit" && line.outbound_enabled === true && line.outbound_status === "active" && !!safe(settings.inbound_agent_id, 100);
        if (!ready) continue;
        const apiKey = await getSautiKitKey(String(waiting.business_id || ""));
        if (!apiKey) continue;
        await setJob(admin, waiting.id, {
          status: "scheduled", scheduled_at: new Date().toISOString(), last_error: null,
          metadata: { ...(waiting.metadata || {}), dispatch_status: "provider_ready_requeued" },
        });
      } catch (requeueError) {
        console.error("Could not requeue provider-waiting outreach call:", requeueError instanceof Error ? requeueError.message : "unknown error");
      }
    }

    const { data: jobs, error: claimError } = await admin.rpc("twiga_claim_scheduled_calls", { p_limit: 10 });
    if (claimError) throw claimError;
    const claimed = Array.isArray(jobs) ? jobs : [];
    const summary = { ok: true, claimed: claimed.length, submitted: 0, polled: polledCalls, deferred: 0, skipped: 0, failed: 0, ownerReportCallsQueued: ownerReportQueue.queued, ownerReportDate: ownerReportQueue.date, ownerReportQueueError: ownerReportQueue.error };

    for (const job of claimed) {
      try {
        const ownerReportSeriesId = safe(job.metadata?.owner_report_series_id, 80);
        const ownerReportAttempt = Number(job.metadata?.owner_report_attempt || 0);
        if (ownerReportSeriesId && ownerReportAttempt > 1) {
          const { data: previous, error: previousError } = await admin.from("twiga_scheduled_calls")
            .select("id,status,metadata")
            .eq("business_id", job.business_id)
            .filter("metadata->>owner_report_series_id", "eq", ownerReportSeriesId)
            .filter("metadata->>owner_report_attempt", "eq", String(ownerReportAttempt - 1))
            .maybeSingle();
          if (previousError) throw previousError;
          const previousStatus = String(previous?.status || "").toLowerCase();
          const previousOutcome = String(previous?.metadata?.last_provider_outcome || "").toLowerCase();
          if (previousStatus === "completed") {
            await setJob(admin, job.id, { status: "skipped", last_error: "The owner already received the report on an earlier attempt." });
            summary.skipped++; continue;
          }
          if (previousStatus === "failed" && previousOutcome !== "no_answer") {
            await setJob(admin, job.id, { status: "skipped", last_error: "The previous report call failed for a reason other than no answer; no further automatic call was placed." });
            summary.skipped++; continue;
          }
          if (!(previousStatus === "failed" && previousOutcome === "no_answer")) {
            await setJob(admin, job.id, {
              status: "scheduled",
              scheduled_at: new Date(Date.now() + 60000).toISOString(),
              last_error: "Waiting for the previous report call outcome before trying another recipient.",
            });
            summary.deferred++; continue;
          }
        }
        const conditions = job.trigger_conditions && typeof job.trigger_conditions === "object" ? job.trigger_conditions : {};
        if (job.trigger_type === "missed_call" || conditions.only_if_missed_call === true) {
          if (!job.source_call_id) {
            await setJob(admin, job.id, { status: "skipped", last_error: "A source missed-call record is required for this trigger." });
            summary.skipped++; continue;
          }
          const { data: sourceCall } = await admin.from("twiga_call_records").select("status").eq("id", job.source_call_id).eq("business_id", job.business_id).maybeSingle();
          if (!sourceCall || !["missed", "no_answer", "failed"].includes(String(sourceCall.status || "").toLowerCase())) {
            await setJob(admin, job.id, { status: "skipped", last_error: "The source call is no longer a missed or unanswered call." });
            summary.skipped++; continue;
          }
        }
        if (conditions.only_if_unpaid === true) {
          const orderId = safe(conditions.order_id, 80);
          if (!orderId) {
            await setJob(admin, job.id, { status: "skipped", last_error: "An order ID is required for the unpaid-order condition." });
            summary.skipped++; continue;
          }
          const { data: order } = await admin.from("twiga_orders").select("payment_status").eq("id", orderId).eq("business_id", job.business_id).maybeSingle();
          if (!order || String(order.payment_status || "").toLowerCase() !== "unpaid") {
            await setJob(admin, job.id, { status: "skipped", last_error: "The order is paid or no longer exists; no call was placed." });
            summary.skipped++; continue;
          }
        }

        const timezone = safe(job.timezone || "Africa/Nairobi", 80);
        const deferredUntil = nextWindow(new Date(), timezone, String(job.calling_window_start || "08:00"), String(job.calling_window_end || "20:00"), Array.isArray(conditions.allowed_calling_days) ? conditions.allowed_calling_days : undefined);
        if (deferredUntil) {
          await setJob(admin, job.id, { status: "scheduled", scheduled_at: deferredUntil.toISOString(), last_error: "Deferred to the next permitted calling window." });
          summary.deferred++; continue;
        }

        const { data: line, error: lineError } = await admin.from("twiga_phone_lines").select("*")
          .eq("business_id", job.business_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (lineError) throw lineError;
        const settings = line?.settings && typeof line.settings === "object" ? line.settings : {};
        const agentId = safe(settings.inbound_agent_id, 100);
        if (!line || line.provider !== "sautikit" || line.outbound_enabled !== true || line.outbound_status !== "active" || !agentId) {
          await setJob(admin, job.id, { status: "waiting_for_provider", last_error: "This business needs an active SautiKit outbound line and a published agent before calls can be sent." });
          summary.deferred++; continue;
        }
        const { data: business, error: businessError } = await admin.from("businesses").select("name").eq("id", job.business_id).maybeSingle();
        if (businessError) throw businessError;
        const scripts = settings.sautikit_scripts && typeof settings.sautikit_scripts === "object" ? settings.sautikit_scripts : {};
        const outbound = safe(scripts.outbound || "Identify the business, explain the reason for calling, ask if this is a convenient time, keep the call brief, and respect requests not to be contacted again.", 5000);
        const apiKey = await getSautiKitKey(String(job.business_id || ""));
        if (!apiKey) {
          await setJob(admin, job.id, { status: "waiting_for_provider", last_error: "Connect SautiKit for this business or ask TWIGA to connect the shared platform account." });
          summary.deferred++; continue;
        }
        const to = safe(job.phone_number, 24);
        if (!/^\+[1-9]\d{7,14}$/.test(to)) throw new Error("The destination number is not in international format.");
        const metadata = job.metadata && typeof job.metadata === "object" ? job.metadata : {};
        const contactProfile = metadata.contact_profile && typeof metadata.contact_profile === "object" ? metadata.contact_profile : {};
        const customerContext = [
          contactProfile.itemsBought ? "Previous purchases/interests: " + safe(contactProfile.itemsBought, 1500) : "",
          contactProfile.notes ? "Customer notes: " + safe(contactProfile.notes, 1000) : "",
          contactProfile.lastPurchaseAt ? "Last purchase date: " + safe(contactProfile.lastPurchaseAt, 40) : "",
          contactProfile.followUpAt ? "Customer's requested follow-up time: " + safe(contactProfile.followUpAt, 40) : "",
        ].filter(Boolean).join(". ");
        const reportCall = !!metadata.owner_report_series_id;
        const reportSummary = safe(metadata.owner_report_summary, 5000);
        const customerLanguage = safe(contactProfile.preferredLanguage || "", 80);
        const promptTemplate = reportCall
          ? "You are TWIGA's AI business reporting assistant calling the configured owner of {{business_name}}. Address the recipient as {{customer_name}}. This is daily report number {{attempt_number}} for {{report_date}}. Read the following verified business summary clearly and naturally: {{report_summary}}. Do not disclose customer names, phone numbers, private notes, payment credentials or individual customer records. Ask whether the owner wants a follow-up task created. Speak in the business's normal Kenyan English or Kiswahili style."
          : "You are calling on behalf of {{business_name}}. The customer's name is {{customer_name}}. Reason for calling: {{call_reason}}. Customer language preference: {{customer_language}}. Customer context supplied from this business's own records: {{customer_context}}. Use this context carefully to make the conversation relevant. Do not assume that a purchase is current, promise availability or reveal private notes; confirm details with the customer. " + outbound;
        const call: any = await skRequest(apiKey, "/v1/agents/" + encodeURIComponent(agentId) + "/send", "POST", {
          to,
          prompt_template: promptTemplate,
          variables: {
            business_name: String(business?.name || metadata.owner_report_business_name || "the business"),
            call_reason: safe(job.reason, 500),
            customer_name: safe(job.customer_name || "", 120),
            customer_context: customerContext,
            customer_language: customerLanguage,
            report_summary: reportSummary,
            report_date: safe(metadata.owner_report_date || "", 20),
            attempt_number: String(ownerReportAttempt || 0),
          },
        }, 20000);
        const providerCallId = safe(call.call_id || call.id || call.data?.call_id || call.data?.id, 120);
        await setJob(admin, job.id, {
          status: "submitted",
          provider_call_id: providerCallId || null,
          last_error: null,
          metadata: {
            ...(job.metadata || {}),
            dispatch_status: "submitted",
            provider_call_ids: [...new Set([...(Array.isArray(job.metadata?.provider_call_ids) ? job.metadata.provider_call_ids : []), ...(providerCallId ? [providerCallId] : [])])].slice(-3),
          },
        });
        const { error: recordError } = await admin.from("twiga_call_records").insert({
          business_id: job.business_id,
          provider: "sautikit",
          provider_call_id: providerCallId || null,
          channel: "pstn",
          direction: "outbound",
          from_number: line.line_number,
          to_number: to,
          status: "queued",
          created_by: job.created_by || null,
          metadata: { scheduled_call_id: job.id, trigger_type: job.trigger_type, consent_status: job.consent_status },
        });
        if (recordError) console.error("Scheduled call record insert failed:", recordError.message);
        summary.submitted++;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Scheduled call failed.";
        const attempt = Number(job.attempt_count || 1), maxAttempts = Number(job.max_attempts || 1);
        const retryable = attempt < maxAttempts && !/HTTP 4\d\d|not in international format/i.test(message);
        if (retryable) {
          const retryAt = new Date(Date.now() + Number(job.retry_interval_minutes || 30) * 60000).toISOString();
          await setJob(admin, job.id, { status: "scheduled", scheduled_at: retryAt, last_error: message });
        } else {
          const invalidNumber = /invalid.*(number|destination|phone|e164)|(?:number|destination|phone|e164).*invalid|not in international format/i.test(message);
          await setJob(admin, job.id, {
            status: "failed",
            last_error: message,
            metadata: {
              ...(job.metadata || {}),
              ...(invalidNumber
                ? { final_outcome: "invalid_number", dispatch_status: "invalid_number" }
                : { dispatch_status: "failed" }),
            },
          });
        }
        summary.failed++;
      }
    }
    return json(summary);
  } catch (e) {
    console.error("twiga-scheduled-calls", e);
    return json({ error: e instanceof Error ? e.message : "Scheduled-call worker failed." }, 500);
  }
});