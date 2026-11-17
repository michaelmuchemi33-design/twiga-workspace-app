const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-twiga-tool-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const BASE = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
type Row = Record<string, any>;
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function adminRest(path: string, method = "GET", body?: unknown) {
  const headers: Record<string, string> = { apikey: SERVICE, Authorization: "Bearer " + SERVICE, Accept: "application/json" };
  if (body !== undefined) { headers["Content-Type"] = "application/json"; headers["Prefer"] = "return=representation"; }
  const response = await fetch(BASE + "/rest/v1/" + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: raw.slice(0, 400) }; }
  if (!response.ok) throw Object.assign(new Error(String(data?.message || data?.error_description || "TWIGA booking database request failed.")), { status: response.status });
  return data;
}
function normalizePhone(value: string) {
  const raw = value.trim().replace(/[()\s-]/g, "");
  if (/^0[17]\d{8}$/.test(raw)) return "+254" + raw.slice(1);
  if (/^254[17]\d{8}$/.test(raw)) return "+" + raw;
  if (/^\+[1-9]\d{7,14}$/.test(raw)) return raw;
  return "";
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);
  try {
    if (!BASE || !SERVICE) return json({ error: "TWIGA booking service is not configured." }, 503);
    const body = await req.json().catch(() => ({}));
    const args: Row = body.arguments && typeof body.arguments === "object" ? body.arguments : body;
    const businessId = String(body.business_id || body.businessId || args.business_id || "").trim();
    const agentId = String(body.agent_id || body.agentId || args.agent_id || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(businessId)) return json({ error: "This receptionist is not linked to a valid business workspace." }, 400);
    const supplied = req.headers.get("x-twiga-tool-secret") || "";
    let expectedSecret = Deno.env.get("TWIGA_BOOKING_TOOL_SECRET") || "";
    if (agentId) {
      if (!/^[0-9a-f-]{36}$/i.test(agentId)) return json({ error: "This receptionist agent ID is invalid." }, 400);
      const lines = await adminRest("twiga_phone_lines?provider=eq.sautikit&business_id=eq." + encodeURIComponent(businessId) +
        "&settings->>inbound_agent_id=eq." + encodeURIComponent(agentId) + "&select=id&limit=1");
      if (!Array.isArray(lines) || !lines.length) return json({ error: "This agent is not bound to this business phone line." }, 401);
      const secretValue = await adminRest("rpc/twiga_get_provider_secret", "POST", {
        p_business_id: businessId, p_provider: "sautikit_booking_tool_secret",
      });
      expectedSecret = String(secretValue || "");
    }
    if (!expectedSecret || !safeEqual(expectedSecret, supplied)) return json({ error: "Booking tool authentication failed." }, 401);
    if (args.consent_confirmed !== true) return json({ error: "Caller consent to save the appointment request is required." }, 400);
    const customerName = String(args.customer_name || "").trim().slice(0, 160);
    const phone = normalizePhone(String(args.phone || ""));
    const service = String(args.service || "").trim().slice(0, 160);
    const scheduledRaw = String(args.scheduled_at || "").trim();
    const duration = Math.min(240, Math.max(15, Number(args.duration_minutes || 30)));
    const extraNotes = String(args.notes || "").trim().slice(0, 1000);
    if (customerName.length < 2 || !phone || !service) return json({ error: "A customer name, valid phone number and service are required." }, 400);
    if (!/(Z|[+-]\d{2}:\d{2})$/i.test(scheduledRaw)) return json({ error: "Provide the appointment time with its timezone, for example 2026-11-18T10:00:00+03:00." }, 400);
    const scheduledAt = new Date(scheduledRaw);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 5 * 60 * 1000) return json({ error: "The appointment must be at least five minutes in the future." }, 400);

    const owners = await adminRest("business_members?business_id=eq." + encodeURIComponent(businessId) + "&role=eq.owner&select=user_id&limit=1");
    const createdBy = Array.isArray(owners) ? owners[0]?.user_id : null;
    if (!createdBy) return json({ error: "No business owner is configured for this workspace." }, 409);
    const businessRows = await adminRest("businesses?id=eq." + encodeURIComponent(businessId) + "&select=name&limit=1");
    const businessName = String(businessRows?.[0]?.name || "the business");
    const from = new Date(scheduledAt.getTime() - duration * 60000).toISOString();
    const to = new Date(scheduledAt.getTime() + duration * 60000).toISOString();
    const conflicts = await adminRest("twiga_appointments?business_id=eq." + encodeURIComponent(businessId) +
      "&status=neq.cancelled&scheduled_at=gte." + encodeURIComponent(from) +
      "&scheduled_at=lt." + encodeURIComponent(to) + "&select=id,scheduled_at&limit=1");
    if (Array.isArray(conflicts) && conflicts.length) return json({ error: "That time appears to overlap another appointment. Ask the caller for another time.", conflict: true }, 409);

    const notes = [
      "Service: " + service,
      "Duration: " + duration + " minutes",
      "Source: inbound TWIGA AI receptionist",
      "Confirmation: pending staff confirmation",
      extraNotes ? "Caller notes: " + extraNotes : "",
    ].filter(Boolean).join("\\n");
    const inserted = await adminRest("twiga_appointments", "POST", {
      business_id: businessId,
      created_by: createdBy,
      customer_name: customerName,
      phone,
      scheduled_at: scheduledAt.toISOString(),
      notes,
      status: "scheduled",
    });
    const appointment = Array.isArray(inserted) ? inserted[0] : inserted;
    return json({
      success: true,
      appointment_id: appointment?.id || null,
      business_name: businessName,
      scheduled_at: scheduledAt.toISOString(),
      status: "scheduled",
      confirmation: "pending_staff",
      message: "The appointment request has been saved in TWIGA. Tell the caller the team will confirm the time shortly; do not say it is confirmed yet.",
    });
  } catch (error) {
    const err = error as Error & { status?: number };
    console.error("twiga-booking-tool", err.message);
    return json({ error: err.message || "Could not save the appointment request." }, err.status && err.status >= 400 && err.status < 600 ? err.status : 500);
  }
});
