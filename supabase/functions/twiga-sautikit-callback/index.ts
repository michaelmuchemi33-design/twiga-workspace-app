import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const clean = (value: unknown, max = 2000) => String(value ?? "").trim().slice(0, max);
const first = (...values: unknown[]) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
const isPhone = (value: string) => /^\+[1-9]\d{7,14}$/.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return json({ ok: true, service: "TWIGA SautiKit callback", version: 3 });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRole) return json({ error: "TWIGA callback service is not configured" }, 503);
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const raw = await req.text();
    if (raw.length > 1024 * 1024) return json({ error: "Payload too large" }, 413);
    let body: Record<string, any>;
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "Invalid JSON" }, 400); }

    const call = body.call && typeof body.call === "object"
      ? body.call
      : body.data?.call && typeof body.data.call === "object"
        ? body.data.call
        : body.data && typeof body.data === "object" ? body.data : body;
    const eventKind = clean(first(body.kind, req.headers.get("X-Sautikit-Event-Kind"), body.event_kind, body.event), 120);
    const callState = clean(first(body.callSessionState, body.call_session_state), 100);
    const rawStatus = clean(first(body.status, call.status, body.call_status, call.call_status), 100);
    const eventTail = eventKind.replace(/^call\./, "");
    const eventStatus: Record<string, string> = {
      started: "ringing",
      answered: "in_progress",
      completed: "completed",
      failed: "failed",
      "recording.available": "completed",
    };
    const status = rawStatus || eventStatus[eventTail] || callState;
    const statusKey = status.toLowerCase().replace(/-/g, "_");
    const direction = clean(first(body.direction, call.direction), 20).toLowerCase();
    const localNumber = clean(first(body.local_e164, call.local_e164), 40);
    const remoteNumber = clean(first(body.remote_e164, call.remote_e164), 40);
    const fromNumber = clean(first(
      direction === "inbound" ? remoteNumber : direction === "outbound" ? localNumber : undefined,
      body.callerNumber, body.From, body.from, body.from_number, body.fromNumber, call.from, call.from_number,
    ), 40);
    const toNumber = clean(first(
      direction === "inbound" ? localNumber : direction === "outbound" ? remoteNumber : undefined,
      body.destinationNumber, body.To, body.to, body.to_number, body.toNumber, call.to, call.to_number,
    ), 40);
    const sessionId = clean(first(body.sessionId, body.session_id, call.session_id), 200);
    const providerCallId = clean(first(
      body.call_id, body.callId, call.call_id, call.id, body.id, body.pbx_call_id, body.callSid, sessionId,
    ), 200);
    const candidates = [fromNumber, toNumber].filter(isPhone);
    const isHandover = status === "CallHandover" || statusKey === "callhandover" || eventTail === "handover";

    if (!candidates.length) {
      if (isHandover) {
        return json({ actions: [{ say: { text: "I’m sorry, the team cannot take your call live right now. Please try again shortly." } }, { hangup: {} }] });
      }
      if (callState) {
        if (["streamstopped", "streamerror", "completed"].includes(callState.toLowerCase())) return json({ actions: [] });
        return json({ actions: [{ say: { text: "Karibu TWIGA. Our AI receptionist is not available on this call right now. Please try again shortly." } }, { hangup: {} }] });
      }
      // A provider event without a TWIGA-owned number is acknowledged but never attached to another tenant.
      return json({ ok: true, ignored: true, reason: "no_registered_number" });
    }

    const { data: lines, error: lineError } = await admin
      .from("twiga_phone_lines")
      .select("id,business_id,line_number,provider_reference")
      .eq("provider", "sautikit")
      .in("line_number", candidates)
      .limit(5);
    if (lineError) throw lineError;
    const line = Array.isArray(lines) ? lines[0] : null;
    if (!line) return json({ ok: true, ignored: true, reason: "number_not_registered_to_twiga" });

    const resolvedDirection = direction === "inbound" || direction === "outbound"
      ? direction
      : toNumber === line.line_number ? "inbound" : "outbound";
    const failureCode = clean(first(body.failure_code, body.failureCode, call.failure_code, call.failureCode), 160);
    const recordingAvailable = eventKind === "call.recording.available" || eventKind === "call.recording.ready" || statusKey === "recording_ready";
    const terminal = ["completed", "failed", "no_answer", "busy", "canceled", "cancelled", "invalid_number"].includes(statusKey)
      || eventKind === "call.completed" || eventKind === "call.failed";
    const recordingUrl = clean(first(body.recording_url, body.recordingUrl, body.recording?.url, call.recording_url), 2000);
    const duration = Number(first(body.duration_seconds, body.duration, call.duration_seconds, call.duration_s, call.duration) || 0);
    const handover = body.handover && typeof body.handover === "object" ? body.handover : {};
    const summary = clean(first(handover.summary, body.summary, body.call_summary, call.summary), 4000);
    const reason = clean(first(handover.reason, body.reason), 1000);
    const transcript = clean(first(body.transcript, call.transcript), 30000);

    if (providerCallId) {
      const { data: existing } = await admin.from("twiga_call_records")
        .select("metadata")
        .eq("provider", "sautikit")
        .eq("provider_call_id", providerCallId)
        .eq("business_id", line.business_id)
        .maybeSingle();
      const metadata = {
        ...(existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {}),
        source: "sautikit_webhook",
        event_kind: eventKind || null,
        event_status: status || "received",
        call_session_state: callState || null,
        session_id: sessionId || null,
        agent_id: clean(first(handover.agent_id, body.agent_id, call.agent_id), 200) || null,
        agent_name: clean(first(handover.agent_name, body.agent_name, call.agent_name), 200) || null,
        handover_reason: reason || null,
        failure_code: failureCode || null,
        recording_available: recordingAvailable || existing?.metadata?.recording_available === true,
        recording_url: recordingUrl || existing?.metadata?.recording_url || null,
        last_provider_event_at: new Date().toISOString(),
      };
      const row: Record<string, any> = {
        business_id: line.business_id,
        provider: "sautikit",
        provider_call_id: providerCallId,
        channel: "pstn",
        direction: resolvedDirection,
        from_number: fromNumber || null,
        to_number: toNumber || null,
        status: statusKey && !["callhandover", "streamstopped", "streamerror"].includes(statusKey) ? statusKey : "received",
        started_at: first(body.started_at, body.startedAt, call.started_at, call.startedAt, body.occurred_at, body.created_at) || new Date().toISOString(),
        duration_seconds: Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 0,
        metadata,
      };
      if (terminal) row.ended_at = first(body.ended_at, body.endedAt, call.ended_at, call.endedAt) || new Date().toISOString();
      if (summary) row.summary = summary;
      if (transcript) row.transcript = transcript;
      const { error: saveError } = await admin.from("twiga_call_records")
        .upsert(row, { onConflict: "provider,provider_call_id" });
      if (saveError) throw saveError;
    }

    if (isHandover) {
      return json({ actions: [{ say: { text: "I’m sorry, the team cannot take your call live right now. Please leave a message after the tone or try again shortly." } }, { hangup: {} }] });
    }
    if (callState) {
      if (["streamstopped", "streamerror", "completed"].includes(callState.toLowerCase())) return json({ actions: [] });
      return json({ actions: [{ say: { text: "Karibu TWIGA. Our AI receptionist is not available on this call right now. Please try again shortly." } }, { hangup: {} }] });
    }
    return json({ ok: true, received: eventKind || status || "call_event", callId: providerCallId || null });
  } catch (error) {
    console.error("twiga-sautikit-callback:", error instanceof Error ? error.message : error);
    return json({ error: "Callback processing failed" }, 500);
  }
});