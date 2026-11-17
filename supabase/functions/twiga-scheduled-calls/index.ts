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
function nextWindow(date: Date, timezone: string, start: string, end: string) {
  const p = partsInZone(date, timezone);
  const hm = (v: string) => {
    const [h, m] = String(v || "08:00").split(":").map(Number);
    return h * 60 + m;
  };
  const nowMin = p.hour * 60 + p.minute, startMin = hm(start), endMin = hm(end);
  if (nowMin >= startMin && nowMin < endMin) return null;
  let y = p.year, mo = p.month, d = p.day;
  if (nowMin >= endMin) {
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    y = next.getUTCFullYear(); mo = next.getUTCMonth() + 1; d = next.getUTCDate();
  }
  const sh = Math.floor(startMin / 60), sm = startMin % 60;
  return localToUtc(y, mo, d, sh, sm, timezone);
}
async function setJob(admin: any, id: string, values: Record<string, unknown>) {
  const { error } = await admin.from("twiga_scheduled_calls").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
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
        if (!rawContacts.length || rawContacts.length > 100) return json({ error: "Schedule between 1 and 100 recipients per batch." }, 400);
        const contacts = Array.from(new Map(rawContacts.map((item: any) => {
          const phone = normalizePhone(typeof item === "string" ? item : item?.phone);
          return [phone, { phone, name: safe(item?.name, 120) }];
        }).filter(([phone]) => !!phone)).values());
        if (!contacts.length || contacts.length !== rawContacts.length) return json({ error: "One or more phone numbers are invalid. Use Kenyan 07… / 01… or international +country format." }, 400);
        const reason = safe(body.reason, 500);
        const scheduledAt = new Date(body.scheduledAt);
        if (!reason) return json({ error: "Enter the reason for calling." }, 400);
        if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 30000) return json({ error: "Choose a future call time at least 30 seconds from now." }, 400);
        const repeat = ["daily", "weekly"].includes(String(body.repeat)) ? String(body.repeat) : "none";
        const repeatCount = repeat === "none" ? 1 : Math.max(2, Math.min(30, Number(body.repeatCount) || 4));
        const retryOnNoAnswer = body.retryOnNoAnswer !== false;
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
          scheduled_at: scheduledAt.toISOString(), timezone, consent_status: "opted_in", trigger_type: triggerType,
          trigger_conditions: { only_if_missed_call: onlyIfMissed, only_if_unpaid: onlyIfUnpaid, order_id: orderId || null },
          source_call_id: sourceCallId || null, calling_window_start: windowStart, calling_window_end: windowEnd,
          status: "scheduled", attempt_count: 0, max_attempts: 3, retry_interval_minutes: 30, created_by: user.id,
          metadata: {
            series_id: seriesId, repeat, repeat_remaining: repeatCount, dispatch_status: "pending",
            no_answer_retry: { enabled: retryOnNoAnswer, attempts: 0, max_attempts: 2, delay_minutes: 5 },
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

    const { data: keyData, error: keyError } = await admin.rpc("twiga_get_platform_secret", { p_provider: "sautikit_platform_api_key" });
    const apiKey = String(keyData || "");
    if (keyError || !apiKey) {
      await admin.from("twiga_scheduled_calls").update({
        status: "waiting_for_provider",
        last_error: "Connect the SautiKit API key in Connections to enable scheduled calls.",
        updated_at: new Date().toISOString(),
      }).eq("status", "scheduled").lte("scheduled_at", new Date().toISOString());
      return json({ ok: true, processed: 0, waitingForProvider: true });
    }
    // Poll previously accepted calls so the queue and call history show their real outcome.
    const { data: submittedCalls } = await admin.from("twiga_scheduled_calls")
      .select("*")
      .eq("status", "submitted").not("provider_call_id", "is", null)
      .order("updated_at", { ascending: true }).limit(20);
    let polledCalls = 0;
    for (const item of submittedCalls || []) {
      try {
        const statusResponse = await fetch("https://api.sautikit.com/v1/calls/" + encodeURIComponent(String(item.provider_call_id)), {
          headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(12000),
        });
        if (!statusResponse.ok) continue;
        const rawStatus = await statusResponse.text();
        let callStatus: any = {};
        try { callStatus = rawStatus ? JSON.parse(rawStatus) : {}; } catch { callStatus = {}; }
        const callData = callStatus.data && typeof callStatus.data === "object" ? callStatus.data : callStatus;
        const providerStatus = String(callData.status || "").toLowerCase();
        if (!["completed", "failed", "no_answer", "busy", "canceled", "cancelled"].includes(providerStatus)) continue;
        const finalStatus = providerStatus === "completed" ? "completed" : "failed";
        const finishedAt = callData.ended_at || callData.completed_at || new Date().toISOString();
        const retryConfig = item.metadata?.no_answer_retry && typeof item.metadata.no_answer_retry === "object"
          ? item.metadata.no_answer_retry : { enabled: false, attempts: 0, max_attempts: 2, delay_minutes: 5 };
        const noAnswerAttempts = Math.max(0, Number(retryConfig.attempts || 0));
        const noAnswerMaxAttempts = Math.min(2, Math.max(1, Number(retryConfig.max_attempts || 2)));
        const shouldRetryNoAnswer = providerStatus === "no_answer" && retryConfig.enabled === true && noAnswerAttempts + 1 < noAnswerMaxAttempts;
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
          const unreachable = providerStatus === "no_answer" && retryConfig.enabled === true && noAnswerAttempts + 1 >= noAnswerMaxAttempts;
          await setJob(admin, item.id, {
            status: finalStatus,
            completed_at: finishedAt,
            last_error: finalStatus === "failed"
              ? (unreachable
                ? "Unreachable after two unanswered call attempts. The number has not been verified as invalid."
                : providerStatus === "no_answer" ? "The contact did not answer."
                : providerStatus === "busy" ? "The contact's line was busy."
                : "The provider did not complete the call.")
              : null,
            metadata: {
              ...(item.metadata || {}),
              ...(unreachable ? { final_outcome: "unreachable_after_no_answer", dispatch_status: "unreachable" } : { last_provider_outcome: providerStatus }),
              ...(retryConfig.enabled === true ? { no_answer_retry: { ...retryConfig, attempts: Math.min(noAnswerMaxAttempts, noAnswerAttempts + (providerStatus === "no_answer" ? 1 : 0)) } } : {}),
            },
          });
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
        await admin.from("twiga_call_records").update({
          status: providerStatus,
          ended_at: finishedAt,
          duration_seconds: Number(callData.duration_seconds || callData.duration_s || 0),
          transcript: typeof callData.transcript === "string" ? callData.transcript.slice(0, 30000) : undefined,
          summary: typeof callData.summary === "string" ? callData.summary.slice(0, 4000) : undefined,
          metadata: { scheduled_call_id: item.id, provider_status: providerStatus },
        }).eq("provider_call_id", item.provider_call_id).eq("business_id", item.business_id);
        polledCalls++;
      } catch (pollError) { console.error("Could not refresh SautiKit call status:", pollError instanceof Error ? pollError.message : "unknown error"); }
    }
    await admin.from("twiga_scheduled_calls").update({ status: "scheduled", last_error: null, updated_at: new Date().toISOString() })
      .eq("status", "waiting_for_provider");

    const { data: jobs, error: claimError } = await admin.rpc("twiga_claim_scheduled_calls", { p_limit: 10 });
    if (claimError) throw claimError;
    const claimed = Array.isArray(jobs) ? jobs : [];
    const summary = { ok: true, claimed: claimed.length, submitted: 0, polled: polledCalls, deferred: 0, skipped: 0, failed: 0 };

    for (const job of claimed) {
      try {
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
        const deferredUntil = nextWindow(new Date(), timezone, String(job.calling_window_start || "08:00"), String(job.calling_window_end || "20:00"));
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
        const to = safe(job.phone_number, 24);
        if (!/^\+[1-9]\d{7,14}$/.test(to)) throw new Error("The destination number is not in international format.");
        const response = await fetch("https://api.sautikit.com/v1/agents/" + encodeURIComponent(agentId) + "/send", {
          method: "POST",
          headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            to,
            prompt_template: "You are calling on behalf of {{business_name}}. Reason for calling: {{call_reason}}. " + outbound,
            variables: { business_name: String(business?.name || "the business"), call_reason: safe(job.reason, 500) },
          }),
          signal: AbortSignal.timeout(20000),
        });
        const raw = await response.text();
        let call: any = {};
        try { call = raw ? JSON.parse(raw) : {}; } catch { call = {}; }
        if (!response.ok) throw new Error("SautiKit call request failed (HTTP " + response.status + ").");
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
          await setJob(admin, job.id, { status: "failed", last_error: message });
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