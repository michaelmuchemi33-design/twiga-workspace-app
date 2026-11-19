import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-twiga-tool-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
type Row = Record<string, any>;
const safe = (value: unknown, max = 2000) => String(value ?? "").trim().slice(0, max);
const validUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);
function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function normalizePhone(value: unknown) {
  let phone = safe(value, 40).replace(/[\s().-]/g, "");
  if (/^0[17]\d{8}$/.test(phone)) phone = "+254" + phone.slice(1);
  else if (/^254[17]\d{8}$/.test(phone)) phone = "+" + phone;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : "";
}
function validScheduledAt(value: unknown) {
  const raw = safe(value, 80);
  if (!raw || !/(Z|[+-]\d{2}:\d{2})$/i.test(raw)) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) && parsed.getTime() >= Date.now() + 30_000 ? parsed.toISOString() : null;
}
async function ownerId(admin: any, businessId: string) {
  const { data, error } = await admin.from("business_members")
    .select("user_id").eq("business_id", businessId).in("role", ["owner", "admin"])
    .order("role", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return String(data?.user_id || "");
}
async function insertScheduledCall(admin: any, input: {
  businessId: string; createdBy: string; phone: string; customerName: string;
  reason: string; scheduledAt: string; callWindowStart?: string; callWindowEnd?: string;
}) {
  const { data, error } = await admin.from("twiga_scheduled_calls").insert({
    business_id: input.businessId,
    customer_name: input.customerName,
    phone_number: input.phone,
    reason: input.reason,
    scheduled_at: input.scheduledAt,
    timezone: "Africa/Nairobi",
    consent_status: "opted_in",
    trigger_type: "follow_up",
    trigger_conditions: { source: "ai_receptionist_tool", recipient_consent_confirmed: true },
    calling_window_start: input.callWindowStart || "08:00",
    calling_window_end: input.callWindowEnd || "20:00",
    status: "scheduled",
    attempt_count: 0,
    max_attempts: 2,
    retry_interval_minutes: 5,
    created_by: input.createdBy,
    metadata: {
      source: "ai_receptionist_tool",
      no_answer_retry: { enabled: true, attempts: 0, max_attempts: 2, delay_minutes: 5 },
      recipient_consent_confirmed: true,
    },
  }).select("id").single();
  if (error) throw error;
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url || !service || !anon) return json({ error: "TWIGA action service is not configured." }, 503);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const body: Row = await req.json().catch(() => ({}));
    const action = safe(body.action || body.operation, 80);
    const toolSecret = safe(req.headers.get("x-twiga-tool-secret"), 500);
    if (toolSecret) {
      // Provider calls are accepted only from the agent currently bound to this business.
      const businessId = safe(body.business_id || body.businessId, 80);
      const agentId = safe(body.agent_id || body.agentId, 120);
      if (!validUuid(businessId) || !agentId) return json({ error: "This receptionist is not linked to a valid business workspace." }, 400);
      const { data: lines, error: lineError } = await admin.from("twiga_phone_lines")
        .select("id,settings").eq("business_id", businessId).eq("provider", "sautikit").limit(5);
      if (lineError) throw lineError;
      const isBound = (lines || []).some((line: Row) => String(line.settings?.inbound_agent_id || "") === agentId);
      if (!isBound) return json({ error: "This SautiKit agent is not bound to this business." }, 401);
      const { data: expected, error: secretError } = await admin.rpc("twiga_get_provider_secret", {
        p_business_id: businessId, p_provider: "sautikit_booking_tool_secret",
      });
      if (secretError) throw secretError;
      if (!expected || !sameSecret(String(expected), toolSecret)) return json({ error: "TWIGA AI tool authentication failed." }, 401);
      const args: Row = { ...body, ...(body.arguments && typeof body.arguments === "object" ? body.arguments : {}) };
      const createdBy = await ownerId(admin, businessId);
      if (!createdBy) return json({ error: "No owner or administrator is configured for this workspace." }, 409);

      if (action === "lookup_business_information") {
        const query = safe(args.query || args.search, 120).toLowerCase();
        const [businessProfileResult, settingsResult, productResult, businessResult] = await Promise.all([
          admin.from("twiga_business_profiles")
            .select("business_summary,what_they_sell,what_they_do,products_and_services,target_customers,unique_selling_points,service_area,opening_hours,delivery_and_payment,returns_and_refunds,frequently_asked_questions,brand_voice,reply_language")
            .eq("business_id", businessId).maybeSingle(),
          admin.from("twiga_business_settings")
            .select("timezone,business_hours,language_mode")
            .eq("business_id", businessId).maybeSingle(),
          admin.from("twiga_products")
            .select("id,name,sku,description,category,price,currency,unit,stock_quantity,item_type,track_stock")
            .eq("business_id", businessId).eq("is_active", true).order("name").limit(100),
          admin.from("businesses").select("name,business_type").eq("id", businessId).maybeSingle(),
        ]);
        if (businessProfileResult.error) throw businessProfileResult.error;
        if (settingsResult.error) throw settingsResult.error;
        if (productResult.error) throw productResult.error;
        const profile: Row = businessProfileResult.data || {};
        const settings: Row = settingsResult.data || {};
        const allProducts: Row[] = Array.isArray(productResult.data) ? productResult.data : [];
        const matches = query
          ? allProducts.filter((p) => [p.name,p.sku,p.description,p.category].some((v) => String(v || "").toLowerCase().includes(query)))
          : allProducts;
        const products = matches.slice(0, 12).map((p) => ({
          name: safe(p.name,120), sku: safe(p.sku,80) || null,
          category: safe(p.category,80) || null, description: safe(p.description,400) || null,
          item_type: p.item_type === "service" ? "service" : "product",
          price: Number(p.price || 0), currency: safe(p.currency || "KES",8),
          unit: safe(p.unit || "piece",30),
          stock_tracked: p.track_stock !== false,
          last_saved_stock: p.item_type === "service" || p.track_stock === false ? null : Number(p.stock_quantity || 0),
        }));
        return json({
          success: true,
          business: {
            name: safe(businessResult.data?.name || "",160),
            type: safe(businessResult.data?.business_type || "",80),
            summary: safe(profile.business_summary,1800),
            what_they_do: safe(profile.what_they_do,1200),
            what_they_sell: safe(profile.what_they_sell,1200),
            products_and_services: safe(profile.products_and_services,1800),
            service_area: safe(profile.service_area,500),
            opening_hours: safe(profile.opening_hours || JSON.stringify(settings.business_hours || {}),1000),
            timezone: safe(settings.timezone || "Africa/Nairobi",60),
            payment_and_delivery: safe(profile.delivery_and_payment,1000),
            returns_and_refunds: safe(profile.returns_and_refunds,800),
            frequently_asked_questions: safe(profile.frequently_asked_questions,1600),
            reply_language: safe(profile.reply_language || settings.language_mode || "Kenyan English and Kiswahili",100),
          },
          query: query || null,
          products,
          matching_count: matches.length,
          has_more: matches.length > products.length,
          privacy: "This lookup returns only this business's public business profile and active catalogue. It does not disclose customer, staff, payment-account or other private personal records.",
          instructions: "Use only these returned facts. Do not invent a price, stock count, service, opening time or policy. Stock is the latest saved count, not a reservation. If no result matches, offer to ask staff.",
        });
      }

      if (action === "capture_customer_lead") {
        const name = safe(args.customer_name || args.name, 160);
        const phone = normalizePhone(args.phone);
        const email = safe(args.email, 254);
        const interest = safe(args.interest || args.requirement, 1200);
        if (name.length < 2 || (!phone && !/^\\S+@\\S+\\.\\S+$/.test(email))) {
          return json({ error: "A customer name and at least one valid phone number or email address are required." }, 400);
        }
        const { data: existing, error: existingError } = phone
          ? await admin.from("twiga_customers").select("id,notes").eq("business_id", businessId).eq("phone", phone).limit(1).maybeSingle()
          : await admin.from("twiga_customers").select("id,notes").eq("business_id", businessId).eq("email", email).limit(1).maybeSingle();
        if (existingError) throw existingError;
        const note = ["Lead captured by TWIGA AI receptionist.", interest ? "Interest: " + interest : "", safe(args.source || "Inbound call", 100) ? "Source: " + safe(args.source || "Inbound call", 100) : ""].filter(Boolean).join("\\n");
        if (existing) {
          const { error: updateError } = await admin.from("twiga_customers").update({
            name, phone: phone || undefined, email: email || undefined,
            notes: [String(existing.notes || ""), note].filter(Boolean).join("\\n\\n").slice(0, 4000),
          }).eq("id", existing.id).eq("business_id", businessId);
          if (updateError) throw updateError;
          return json({ success: true, customer_id: existing.id, updated: true, message: "The customer lead was added to this business CRM. No marketing message or callback was sent." });
        }
        const { data: customer, error: insertError } = await admin.from("twiga_customers").insert({
          business_id: businessId, created_by: createdBy, name, phone: phone || null, email: email || null, notes: note,
        }).select("id,name").single();
        if (insertError) throw insertError;
        return json({ success: true, customer_id: customer.id, name: customer.name, message: "The customer lead was saved in this business CRM. No marketing message or callback was sent." });
      }

      if (action === "create_order_request") {
        const customerName = safe(args.customer_name, 160);
        const phone = normalizePhone(args.phone);
        const email = safe(args.email, 254);
        const items = Array.isArray(args.items) ? args.items.slice(0, 40).map((item: Row) => ({
          name: safe(item?.name, 180),
          sku: safe(item?.sku, 80),
          quantity: Math.max(1, Math.min(10000, Number(item?.quantity || 1))),
          unit_price: Number.isFinite(Number(item?.unit_price)) && Number(item.unit_price) >= 0 ? Number(item.unit_price) : null,
          notes: safe(item?.notes, 500),
        })).filter((item: Row) => item.name) : [];
        const totalSupplied = args.total_amount !== undefined && args.total_amount !== null && String(args.total_amount).trim() !== "";
        const total = totalSupplied ? Number(args.total_amount) : null;
        if (customerName.length < 2 || (!phone && !/^\\S+@\\S+\\.\\S+$/.test(email)) || !items.length) {
          return json({ error: "An order request needs the customer's name, a reachable contact and at least one item or service." }, 400);
        }
        if (totalSupplied && (!Number.isFinite(total) || Number(total) < 0)) return json({ error: "The order total must be a valid non-negative amount." }, 400);
        const { data: business } = await admin.from("businesses").select("name").eq("id", businessId).maybeSingle();
        const orderNumber = "TW-" + new Date().toISOString().slice(0,10).replace(/-/g,"") + "-" + crypto.randomUUID().slice(0,8).toUpperCase();
        const { data: order, error: orderError } = await admin.from("twiga_orders").insert({
          business_id: businessId, created_by: createdBy, customer_name: customerName,
          customer_phone: phone || null, total_amount: total ?? 0,
          description: safe(args.order_notes, 2000) || "Order request captured by AI receptionist. Staff must confirm items, prices, stock and delivery.",
          status: "pending_confirmation", order_number: orderNumber, items,
          currency: safe(args.currency || "KES", 8), payment_status: "unpaid", payment_method: "Pay later",
          customer_sms_consent: false,
        }).select("id,order_number").single();
        if (orderError) throw orderError;
        const { error: taskError } = await admin.from("twiga_tasks").insert({
          business_id: businessId, created_by: createdBy,
          title: "Confirm order " + orderNumber + " for " + customerName,
          description: "Review items, stock, price, fulfilment and delivery before confirming with the customer. No payment has been requested or received.",
          status: "open", kind: "task", category: "sales", priority: "high",
          source: "ai_receptionist", approval_required: false, approval_status: "not_required",
          action_type: "confirm_order", action_payload: { order_id: order.id, order_number: orderNumber },
          metadata: { agent_id: agentId, source: "ai_receptionist_order_request" },
        });
        if (taskError) throw taskError;
        return json({ success: true, order_id: order.id, order_number: order.order_number, status: "pending_confirmation", payment_status: "unpaid", message: "The order request has been saved for staff confirmation. No payment or stock deduction occurred. Tell the customer the team will confirm availability and final price." });
      }

      if (action === "create_staff_task") {
        const title = safe(args.title, 180);
        if (title.length < 3) return json({ error: "A clear task title is required." }, 400);
        const dueAtRaw = safe(args.due_at, 80);
        const dueAt = dueAtRaw ? validScheduledAt(dueAtRaw) : null;
        if (dueAtRaw && !dueAt) return json({ error: "Task due time must be a future ISO date-time with a timezone." }, 400);
        const { data: task, error } = await admin.from("twiga_tasks").insert({
          business_id: businessId, created_by: createdBy, title,
          description: safe(args.description, 2000) || null,
          status: "open", kind: "task",
          category: safe(args.category || "operations", 80),
          priority: ["low", "normal", "high", "urgent"].includes(String(args.priority)) ? args.priority : "normal",
          due_at: dueAt,
          source: "ai_receptionist",
          approval_required: false,
          approval_status: "not_required",
          metadata: { source: "sautikit_agent", agent_id: agentId, customer_name: safe(args.customer_name, 160) || null, phone: normalizePhone(args.phone) || null },
        }).select("id,title,status,due_at").single();
        if (error) throw error;
        return json({ success: true, task_id: task.id, title: task.title, status: task.status, message: "The staff task is saved in the TWIGA Organize page." });
      }

      if (action === "request_customer_followup") {
        const customerName = safe(args.customer_name || "Customer", 160);
        const phone = normalizePhone(args.phone);
        const reason = safe(args.reason, 500);
        const when = validScheduledAt(args.scheduled_at);
        if (!phone || !reason) return json({ error: "A valid customer phone number and follow-up reason are required." }, 400);
        if (!when) return json({ error: "Ask the customer for a specific future callback time, including timezone, before scheduling." }, 400);
        const consent = args.recipient_consent_confirmed === true;
        if (!consent) {
          const { data: task, error } = await admin.from("twiga_tasks").insert({
            business_id: businessId, created_by: createdBy,
            title: "Obtain permission before calling " + customerName,
            description: "Proposed follow-up: " + reason + ". The customer has not explicitly agreed to a callback. Do not call until consent is obtained.",
            status: "open", kind: "followup", category: "customer_follow_up", priority: "normal",
            source: "ai_receptionist", approval_required: true, approval_status: "pending",
            action_type: "obtain_recipient_consent", action_payload: { customer_name: customerName, phone, reason, scheduled_at: when, recipient_consent_confirmed: false },
            metadata: { agent_id: agentId, consent_missing: true },
          }).select("id").single();
          if (error) throw error;
          return json({ success: false, task_id: task.id, approval_required: true, message: "No call was scheduled because the customer has not explicitly consented. A task was added for staff to obtain permission." });
        }

        const { data: profile } = await admin.from("twiga_business_profiles").select("setup_details").eq("business_id", businessId).maybeSingle();
        const details = profile?.setup_details && typeof profile.setup_details === "object" ? profile.setup_details : {};
        const approval = details.action_approval_matrix && typeof details.action_approval_matrix === "object" ? details.action_approval_matrix : {};
        const { data: businessSettings } = await admin.from("twiga_business_settings").select("followups_enabled,business_hours").eq("business_id", businessId).maybeSingle();
        const autoAllowed = approval.allow_ai_callback_after_recipient_consent === true
          && businessSettings?.followups_enabled !== false;
        if (autoAllowed) {
          const call = await insertScheduledCall(admin, { businessId, createdBy, phone, customerName, reason, scheduledAt: when });
          return json({ success: true, scheduled: true, scheduled_call_id: call.id, message: "The customer explicitly consented and this workspace allows consent-based routine callbacks. The follow-up is scheduled. Tell the customer the expected callback time." });
        }

        const { data: task, error } = await admin.from("twiga_tasks").insert({
          business_id: businessId, created_by: createdBy,
          title: "Approve callback to " + customerName,
          description: "The customer explicitly requested a callback. Review and approve the proposed call in Organize before it is dispatched. Reason: " + reason,
          status: "waiting_approval", kind: "followup", category: "customer_follow_up", priority: "high",
          due_at: when, source: "ai_receptionist", approval_required: true, approval_status: "pending",
          action_type: "schedule_followup",
          action_payload: { customer_name: customerName, phone, reason, scheduled_at: when, recipient_consent_confirmed: true, agent_id: agentId },
          metadata: { agent_id: agentId, approval_reason: "Business workspace requires owner approval before AI-scheduled outbound calls." },
        }).select("id").single();
        if (error) throw error;
        return json({ success: true, approval_required: true, task_id: task.id, message: "The customer consented. No call has been placed yet; the owner or admin must approve the proposed callback in Organize." });
      }
      return json({ error: "Unknown AI action tool." }, 404);
    }

    // Interactive dashboard actions require a current Supabase user and business membership.
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in to manage AI action approvals." }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const user = authData?.user;
    if (authError || !user) return json({ error: "Your sign-in has expired. Sign in again." }, 401);
    const businessId = safe(body.businessId, 80);
    const taskId = safe(body.taskId, 80);
    if (!validUuid(businessId) || !validUuid(taskId)) return json({ error: "Choose a valid business and task." }, 400);
    const { data: membership, error: memberError } = await admin.from("business_members")
      .select("role").eq("business_id", businessId).eq("user_id", user.id).maybeSingle();
    if (memberError) throw memberError;
    if (!membership || !["owner", "admin"].includes(String(membership.role))) return json({ error: "Only the business owner or administrator can approve outbound AI actions." }, 403);
    const { data: task, error: taskError } = await admin.from("twiga_tasks")
      .select("*").eq("id", taskId).eq("business_id", businessId).maybeSingle();
    if (taskError) throw taskError;
    if (!task) return json({ error: "The proposed action was not found in this business." }, 404);
    if (task.approval_status !== "pending" || task.approval_required !== true) {
      return json({ error: "This proposal is no longer awaiting approval." }, 409);
    }
    if (action === "reject_callback" || action === "reject_proposal") {
      const { data: rejected, error } = await admin.from("twiga_tasks").update({
        status: "cancelled", approval_status: "rejected", approved_by: user.id,
        approved_at: new Date().toISOString(), completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", taskId).eq("business_id", businessId).eq("approval_status", "pending")
        .select("id").maybeSingle();
      if (error) throw error;
      if (!rejected) return json({ error: "This proposal was already handled. Refresh the approval inbox." }, 409);
      return json({ success: true, rejected: true, message: "The proposal was rejected. No external action was executed." });
    }
    if (action !== "approve_callback") return json({ error: "This proposal type has no verified execution handler yet. It has not been approved or executed." }, 409);
    if (task.action_type !== "schedule_followup") return json({ error: "Only consented callbacks can currently be approved for execution." }, 409);
    const payload = task.action_payload && typeof task.action_payload === "object" ? task.action_payload : {};
    if (payload.recipient_consent_confirmed !== true) return json({ error: "The customer has not explicitly consented. Do not schedule this call." }, 409);
    const phone = normalizePhone(payload.phone);
    const scheduledAt = validScheduledAt(payload.scheduled_at);
    const reason = safe(payload.reason, 500);
    if (!phone || !scheduledAt || !reason) return json({ error: "The approved callback details are incomplete or the requested time has passed. Edit the task and request a new consented callback." }, 409);
    const call = await insertScheduledCall(admin, {
      businessId, createdBy: user.id, phone,
      customerName: safe(payload.customer_name || "Customer", 160), reason, scheduledAt,
    });
    const { error: updateError } = await admin.from("twiga_tasks").update({
      status: "done", approval_status: "approved", approved_by: user.id,
      approved_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      metadata: { ...(task.metadata || {}), scheduled_call_id: call.id },
      updated_at: new Date().toISOString(),
    }).eq("id", taskId).eq("business_id", businessId).eq("approval_status", "pending");
    if (updateError) throw updateError;
    return json({ success: true, scheduled: true, scheduled_call_id: call.id, message: "Callback approved and added to the scheduled-call queue. It will dispatch inside the allowed calling window." });
  } catch (error) {
    const failure = error as Error & { status?: number };
    console.error("twiga-ai-actions", failure.message);
    return json({ error: failure.message || "The AI action could not be completed." }, failure.status && failure.status >= 400 && failure.status < 600 ? failure.status : 500);
  }
});
