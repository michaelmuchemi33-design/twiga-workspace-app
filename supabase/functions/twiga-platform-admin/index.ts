import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return reply({ error: "Sign in required" }, 401);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !anon || !service) return reply({ error: "Admin service is not configured" }, 503);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    const user = userData?.user;
    if (authError || !user) return reply({ error: "Your sign-in has expired. Sign in again." }, 401);

    const admin = createClient(url, service);
    const { data: allowed, error: allowError } = await admin
      .from("twiga_platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (allowError || !allowed) return reply({ error: "Platform administrator access required" }, 403);

    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || "overview");
    if (action === "whoami") return reply({ isAdmin: true, email: user.email || null });

    if (action === "overview") {
      const { data: clientRows, error: clientError, count: totalClientCount } = await admin
        .from("businesses")
        .select("id,name,business_type,status,paid_through,created_at,business_members(user_id,role)", { count: "exact" })
        .order("created_at", { ascending: false }).limit(500);
      if (clientError) throw clientError;
      const { data: subscriptionRows, error: subscriptionError } = await admin.from("twiga_subscriptions")
        .select("business_id,amount,current_period_end,plan_code,status,created_at")
        .order("created_at", { ascending: false }).limit(2000);
      if (subscriptionError) throw subscriptionError;
      const latestSubscriptions = new Map<string, any>();
      for (const subscription of (subscriptionRows || [])) {
        if (!latestSubscriptions.has(subscription.business_id)) latestSubscriptions.set(subscription.business_id, subscription);
      }
      const businessIds = (clientRows || []).map((business: any) => String(business.id));
      const { data: profileRows, error: profileError } = businessIds.length
        ? await admin.from("twiga_business_profiles").select("business_id,owner_email").in("business_id", businessIds)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const ownerEmails = new Map((profileRows || []).map((profile: any) => [String(profile.business_id), String(profile.owner_email || "")]));
      const clients = (clientRows || []).map((business: any) => {
        const members = Array.isArray(business.business_members) ? business.business_members : [];
        return {
          id: business.id, name: business.name, businessType: business.business_type,
          status: business.status, paidThrough: business.paid_through, createdAt: business.created_at,
          memberCount: members.length, ownerEmail: ownerEmails.get(String(business.id)) || null,
          subscriptionAmount: latestSubscriptions.get(business.id)?.amount ?? null,
          currentPeriodEnd: latestSubscriptions.get(business.id)?.current_period_end || null,
          planCode: latestSubscriptions.get(business.id)?.plan_code || null,
        };
      });

      const { data: payments, error: payError } = await admin
        .from("twiga_platform_payments")
        .select("id,business_id,amount,currency,method,provider_reference,notes,paid_at,period_start,period_end,businesses(name)")
        .order("paid_at", { ascending: false }).limit(100);
      if (payError) throw payError;

      const { data: tickets, error: ticketError } = await admin
        .from("twiga_support_tickets")
        .select("id,user_id,business_id,channel,subject,message,contact,status,created_at,updated_at,businesses(name)")
        .order("created_at", { ascending: false }).limit(100);
      if (ticketError) throw ticketError;

      const { data: vapiAccounts, error: vapiError } = await admin
        .from("twiga_vapi_accounts")
        .select("id,name,vapi_public_key,assistant_id,voice_label,voice_model,priority,enabled,last_used_at,created_at")
        .order("priority", { ascending: true }).order("created_at", { ascending: true });
      if (vapiError) throw vapiError;

      const [{ data: phoneLines, error: phoneError }, { data: recentCalls, error: callsError },
        { data: auditLogs, error: auditError }, { data: providerConnections, error: providerError }] = await Promise.all([
        admin.from("twiga_phone_lines").select("id,business_id,line_number,provider,inbound_enabled,inbound_status,outbound_enabled,outbound_status,verified_at,updated_at").order("updated_at", { ascending: false }).limit(500),
        admin.from("twiga_call_records").select("id,business_id,provider,direction,status,created_at,duration_seconds").order("created_at", { ascending: false }).limit(100),
        admin.from("twiga_admin_audit_logs").select("id,admin_email,action,resource_type,resource_id,created_at").order("created_at", { ascending: false }).limit(100),
        admin.from("twiga_business_provider_secret_refs").select("business_id,provider,updated_at").order("updated_at", { ascending: false }).limit(1000),
      ]);
      if (phoneError) throw phoneError;
      if (callsError) throw callsError;
      if (auditError) throw auditError;
      if (providerError) throw providerError;

      const paidTotal = (payments || []).reduce((n: number, payment: any) => n + Number(payment.amount || 0), 0);
      return reply({
        isAdmin: true, clients, totalClientCount: totalClientCount || clients.length,
        clientsLimit: 500, payments: payments || [], tickets: tickets || [], vapiAccounts: vapiAccounts || [],
        phoneLines: phoneLines || [], recentCalls: recentCalls || [], auditLogs: auditLogs || [],
        providerConnections: providerConnections || [],
        metrics: { clientCount: totalClientCount || clients.length, paymentCount: (payments || []).length,
          paidTotalKes: Number(paidTotal.toFixed(2)),
          openTickets: (tickets || []).filter((ticket: any) => ticket.status !== "resolved").length,
          phoneLineCount: (phoneLines || []).length,
          inboundEnabled: (phoneLines || []).filter((line: any) => line.inbound_enabled === true).length,
          outboundEnabled: (phoneLines || []).filter((line: any) => line.outbound_enabled === true).length,
          recentCallCount: (recentCalls || []).length,
          failedCalls: (recentCalls || []).filter((call: any) => /fail|error/i.test(String(call.status || ""))).length,
          providerConnectionCount: (providerConnections || []).length }
      });
    }

    if (action === "ai_prompt_setup") {
      const businessId = String(payload.businessId || "").trim();
      const prompt = String(payload.prompt || "").trim().slice(0, 10000);
      if (!businessId || !/^[0-9a-f-]{36}$/i.test(businessId)) return reply({ error: "Choose a valid client business." }, 400);
      if (prompt.length < 12) return reply({ error: "Enter a clear setup instruction for this business." }, 400);
      const [{ data: business, error: businessError }, { data: existing, error: profileError }] = await Promise.all([
        admin.from("businesses").select("id,name,business_type").eq("id", businessId).maybeSingle(),
        admin.from("twiga_business_profiles").select("*").eq("business_id", businessId).maybeSingle(),
      ]);
      if (businessError) throw businessError;
      if (profileError) throw profileError;
      if (!business) return reply({ error: "Client business not found." }, 404);

      // Reuse the same Cloudflare Workers AI model as customer setup.
      // The platform-admin JWT has already been checked against twiga_platform_admins above.
      const aiResponse = await fetch("https://twiga-api.twiga-ke.workers.dev/ai/setup", {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          token: auth.slice(7).trim(),
          messages: [{
            role: "user",
            content: JSON.stringify({
              administrator_instruction: prompt,
              selected_business: { name: business.name, business_type: business.business_type },
              existing_profile: existing || {},
              instruction: "Apply the administrator's request only to this selected business. Preserve all unrelated confirmed details. Return a complete updated business_profile and a concise summary. Do not create products, customers, orders, bookings, employees, provider credentials, or phone numbers. Do not change payment, subscription, billing, or phone routing."
            }),
          }],
          ownerProfile: { name: user.user_metadata?.full_name || user.email || "TWIGA platform administrator", email: user.email || "" },
          existingProfile: existing || {},
          uploadedFiles: [],
        }),
        signal: AbortSignal.timeout(30000),
      });
      const aiResult = await aiResponse.json().catch(() => ({}));
      if (!aiResponse.ok || aiResult?.ok !== true || !aiResult?.businessProfile) {
        return reply({ error: String(aiResult?.error || "Cloudflare Workers AI could not prepare the requested client update. The saved profile was not changed.") }, aiResponse.status >= 400 && aiResponse.status < 600 ? aiResponse.status : 502);
      }
      const parsed: any = {
        business_name: aiResult.businessProfile.business_name,
        business_type: aiResult.businessProfile.business_type,
        business_profile: aiResult.businessProfile,
        summary: aiResult.reply || "The selected business profile draft is ready.",
      };
      const modelUsed = String(aiResult.model || "Cloudflare Workers AI · Llama 3.3 70B");
      const profilePatch = parsed.business_profile && typeof parsed.business_profile === "object" ? parsed.business_profile : {};
      const allowed = [
        "owner_name","owner_email","business_summary","what_they_sell","what_they_do","products_and_services",
        "target_customers","unique_selling_points","service_area","opening_hours","delivery_and_payment",
        "returns_and_refunds","frequently_asked_questions","brand_voice","reply_language","assistant_instructions","setup_details",
      ];
      const update: Record<string, any> = { business_id: businessId, updated_by: user.id, updated_at: new Date().toISOString() };
      for (const field of allowed) {
        if (Object.prototype.hasOwnProperty.call(profilePatch, field)) {
          if (field === "setup_details" && profilePatch[field] && typeof profilePatch[field] === "object" && !Array.isArray(profilePatch[field])) {
            update.setup_details = {
              ...(existing?.setup_details && typeof existing.setup_details === "object" ? existing.setup_details : {}),
              ...profilePatch[field],
            };
          } else if (field !== "setup_details") {
            update[field] = String(profilePatch[field] ?? "").slice(0, field === "assistant_instructions" ? 8000 : 5000);
          }
        }
      }
      const greeting = typeof parsed.business_profile?.receptionist_greeting === "string"
        ? String(parsed.business_profile.receptionist_greeting).slice(0, 1200) : "";
      if (greeting) update.setup_details = { ...(update.setup_details || existing?.setup_details || {}), receptionist_greeting: greeting };
      if (Object.keys(update).length <= 3) return reply({ error: "The AI did not return any supported profile changes. Your profile was not changed." }, 422);
      const { data: saved, error: saveError } = await admin.from("twiga_business_profiles")
        .upsert(update, { onConflict: "business_id" }).select("*").single();
      if (saveError) throw saveError;
      const nextName = String(parsed.business_name || "").trim().slice(0, 160);
      const nextType = String(parsed.business_type || "").trim().slice(0, 100);
      if (nextName || nextType) {
        const businessUpdate: Record<string, string> = {};
        if (nextName) businessUpdate.name = nextName;
        if (nextType) businessUpdate.business_type = nextType;
        const { error: updateBusinessError } = await admin.from("businesses").update(businessUpdate).eq("id", businessId);
        if (updateBusinessError) throw updateBusinessError;
      }
      await admin.from("twiga_admin_audit_logs").insert({
        admin_email: user.email || "unknown", action: "business.ai_profile_prompted",
        resource_type: "business", resource_id: businessId,
        metadata: { model: modelUsed, prompt_excerpt: prompt.slice(0, 1200), fields_updated: Object.keys(update).filter((x) => !["business_id","updated_by","updated_at"].includes(x)), summary: String(parsed.summary || "").slice(0, 500) },
      });
      return reply({
        saved: true, businessId, modelUsed, profile: saved,
        businessName: nextName || business.name,
        summary: String(parsed.summary || "The selected business profile and receptionist instructions were updated."),
        message: "Updated this business's profile and AI receptionist instructions. No message was sent, no call was placed, and billing or phone routing was not changed. Review and publish the receptionist from the business's Phone & AI receptionist screen.",
      });
    }

    if (action === "record_payment") {
      const businessId = String(payload.businessId || "");
      const amount = Number(payload.amount);
      const method = String(payload.method || "").toLowerCase();
      const reference = String(payload.reference || "").trim().slice(0, 100);
      const notes = String(payload.notes || "").trim().slice(0, 1000);
      const periodStart = payload.periodStart ? String(payload.periodStart) : null;
      const periodEnd = payload.periodEnd ? String(payload.periodEnd) : null;
      if (!businessId || !Number.isFinite(amount) || amount <= 0 || amount > 100000000)
        return reply({ error: "Choose a client and enter a valid amount." }, 400);
      if (!["mpesa", "bank", "cash", "card", "other"].includes(method))
        return reply({ error: "Unsupported payment method." }, 400);
      if (periodStart && !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) return reply({ error: "Invalid period start date." }, 400);
      if (periodEnd && !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return reply({ error: "Invalid period end date." }, 400);
      const { data: business, error: businessError } = await admin.from("businesses")
        .select("id").eq("id", businessId).maybeSingle();
      if (businessError || !business) return reply({ error: "Client not found." }, 404);
      const { data, error } = await admin.rpc("twiga_record_platform_payment", {
        p_business_id: businessId,
        p_amount: amount,
        p_method: method,
        p_reference: reference || null,
        p_notes: notes || null,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_recorded_by: user.id,
      });
      if (error) {
        if (error.code === "23505") return reply({ error: "That payment reference has already been recorded." }, 409);
        if (error.code === "P0002") return reply({ error: "Client not found." }, 404);
        throw error;
      }
      const { data: subscription } = await admin.from("twiga_subscriptions")
        .select("current_period_start,current_period_end,grace_period_ends_at")
        .eq("business_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      await admin.from("twiga_admin_audit_logs").insert({
        admin_email: user.email || "unknown", action: "payment.recorded",
        resource_type: "business", resource_id: businessId,
        metadata: { amount, method, reference: reference || null, payment_id: data.id, current_period_end: subscription?.current_period_end || null },
      });
      return reply({
        saved: true, payment: data, clientAccessUpdated: true,
        periodStart: subscription?.current_period_start || null,
        periodEnd: subscription?.current_period_end || null,
        gracePeriodEndsAt: subscription?.grace_period_ends_at || null,
      });
    }

    if (action === "extend_access_days") {
      const businessId = String(payload.businessId || "");
      const days = Number(payload.days);
      if (!businessId || !Number.isInteger(days) || days < 1 || days > 1000)
        return reply({ error: "Choose a business and enter between 1 and 1000 days." }, 400);
      const { data: business, error: businessError } = await admin.from("businesses")
        .select("id,name,paid_through").eq("id", businessId).maybeSingle();
      if (businessError) throw businessError;
      if (!business) return reply({ error: "Business not found." }, 404);
      const today = new Date();
      const baseDate = business.paid_through && business.paid_through > today.toISOString().slice(0, 10)
        ? business.paid_through : today.toISOString().slice(0, 10);
      const [year, month, day] = baseDate.split("-").map(Number);
      const paidDate = new Date(Date.UTC(year, month - 1, day + days));
      const paidThrough = paidDate.toISOString().slice(0, 10);
      const { data: updatedBusiness, error: updateBusinessError } = await admin.from("businesses")
        .update({ status: "ACTIVE", paid_through: paidThrough }).eq("id", businessId)
        .select("id,name,status,paid_through").single();
      if (updateBusinessError) throw updateBusinessError;
      const { data: subscription, error: subscriptionError } = await admin.from("twiga_subscriptions")
        .select("id,current_period_start,current_period_end")
        .eq("business_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (subscriptionError) throw subscriptionError;
      let periodEnd: string | null = null;
      if (subscription?.id) {
        const now = new Date();
        const priorEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : now;
        const startFrom = priorEnd > now ? priorEnd : now;
        const nextEnd = new Date(startFrom.getTime() + days * 86400000);
        periodEnd = nextEnd.toISOString();
        const { error: updateSubscriptionError } = await admin.from("twiga_subscriptions")
          .update({ status: "active", current_period_start: subscription.current_period_start || now.toISOString(),
            current_period_end: periodEnd, grace_period_ends_at: null, updated_at: now.toISOString() })
          .eq("id", subscription.id);
        if (updateSubscriptionError) throw updateSubscriptionError;
      }
      await admin.from("twiga_admin_audit_logs").insert({
        admin_email: user.email || "unknown", action: "business.access_days_added",
        resource_type: "business", resource_id: businessId,
        metadata: { days, paid_through: paidThrough, subscription_period_end: periodEnd },
      });
      return reply({ saved: true, client: updatedBusiness, daysAdded: days, paidThrough, periodEnd });
    }

    if (action === "set_access") {
      const businessId = String(payload.businessId || "");
      const status = String(payload.status || "").toUpperCase();
      const paidThrough = payload.paidThrough ? String(payload.paidThrough) : null;
      if (!businessId || !["ACTIVE", "SUSPENDED", "TRIAL"].includes(status))
        return reply({ error: "Choose a client and a valid access status." }, 400);
      if (paidThrough && !/^\d{4}-\d{2}-\d{2}$/.test(paidThrough))
        return reply({ error: "Invalid paid-through date." }, 400);
      const update: Record<string, unknown> = { status };
      if (paidThrough) update.paid_through = paidThrough;
      const { data, error } = await admin.from("businesses").update(update)
        .eq("id", businessId).select("id,name,status,paid_through").single();
      if (error) throw error;
      await admin.from("twiga_admin_audit_logs").insert({
        admin_email: user.email || "unknown", action: "business.access_updated",
        resource_type: "business", resource_id: businessId,
        metadata: { status, paid_through: data.paid_through || null },
      });
      return reply({ saved: true, client: data });
    }

    if (action === "save_vapi_account") {
      const name = String(payload.name || "").trim().slice(0, 80);
      const publicKey = String(payload.publicKey || "").trim().slice(0, 255);
      const assistantId = String(payload.assistantId || "").trim().slice(0, 255);
      const voiceLabel = String(payload.voiceLabel || "").trim().slice(0, 120);
      const voiceModel = String(payload.voiceModel || "").trim().slice(0, 120);
      const priority = Number.isInteger(Number(payload.priority)) ? Math.max(1, Math.min(10000, Number(payload.priority))) : 100;
      const enabled = payload.enabled !== false;
      if (name.length < 2 || publicKey.length < 8 || assistantId.length < 8)
        return reply({ error: "Enter a name, Vapi public SDK key and assistant ID." }, 400);
      const { data, error } = await admin.from("twiga_vapi_accounts").upsert({
        name, vapi_public_key: publicKey, assistant_id: assistantId,
        voice_label: voiceLabel, voice_model: voiceModel, priority, enabled, updated_at: new Date().toISOString()
      }, { onConflict: "vapi_public_key,assistant_id" })
        .select("id,name,vapi_public_key,assistant_id,voice_label,voice_model,priority,enabled,last_used_at").single();
      if (error) throw error;
      return reply({ saved: true, vapiAccount: data });
    }

    if (action === "set_vapi_account_enabled") {
      const accountId = String(payload.accountId || "");
      const enabled = payload.enabled === true;
      if (!accountId) return reply({ error: "Choose a Vapi account." }, 400);
      const { data, error } = await admin.from("twiga_vapi_accounts")
        .update({ enabled, updated_at: new Date().toISOString() }).eq("id", accountId)
        .select("id,name,enabled").single();
      if (error) throw error;
      return reply({ saved: true, vapiAccount: data });
    }

    if (action === "ticket_messages") {
      const ticketId = String(payload.ticketId || "");
      if (!ticketId) return reply({ error: "Choose a support conversation." }, 400);
      const { data: ticket, error: ticketError } = await admin
        .from("twiga_support_tickets").select("id,user_id,business_id,subject,status,contact,created_at,businesses(name)")
        .eq("id", ticketId).maybeSingle();
      if (ticketError) throw ticketError;
      if (!ticket) return reply({ error: "Support conversation not found." }, 404);
      const { data: customer } = ticket.user_id
        ? await admin.auth.admin.getUserById(ticket.user_id).catch(() => ({ data: { user: null } }))
        : { data: { user: null } };
      const { data: messages, error: messagesError } = await admin
        .from("twiga_support_messages")
        .select("id,ticket_id,sender_role,sender_user_id,message,created_at")
        .eq("ticket_id", ticketId).order("created_at", { ascending: true }).limit(200);
      if (messagesError) throw messagesError;
      return reply({ ticket: { ...ticket, customerEmail: customer?.user?.email || ticket.contact || null }, messages: messages || [] });
    }

    if (action === "reply_ticket") {
      const ticketId = String(payload.ticketId || "");
      const message = String(payload.message || "").trim().slice(0, 5000);
      if (!ticketId || !message) return reply({ error: "Choose a ticket and write a reply." }, 400);
      const { data: ticket, error: ticketError } = await admin.from("twiga_support_tickets")
        .select("id").eq("id", ticketId).maybeSingle();
      if (ticketError) throw ticketError;
      if (!ticket) return reply({ error: "Support conversation not found." }, 404);
      const { data: saved, error: saveError } = await admin.from("twiga_support_messages").insert({
        ticket_id: ticketId, sender_role: "admin", sender_user_id: user.id, message,
      }).select("id,ticket_id,sender_role,sender_user_id,message,created_at").single();
      if (saveError) throw saveError;
      const { error: updateError } = await admin.from("twiga_support_tickets")
        .update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("id", ticketId);
      if (updateError) throw updateError;
      await admin.from("twiga_admin_audit_logs").insert({
        admin_email: user.email || "unknown", action: "support.reply",
        resource_type: "support_ticket", resource_id: ticketId,
        metadata: { message_id: saved.id },
      });
      return reply({ saved: true, message: saved, status: "in_progress" });
    }

    if (action === "update_ticket") {
      const ticketId = String(payload.ticketId || "");
      const status = String(payload.status || "");
      if (!ticketId || !["open", "in_progress", "resolved"].includes(status))
        return reply({ error: "Invalid support ticket update." }, 400);
      const { data, error } = await admin.from("twiga_support_tickets")
        .update({ status, updated_at: new Date().toISOString() }).eq("id", ticketId)
        .select("id,status").single();
      if (error) throw error;
      return reply({ saved: true, ticket: data });
    }

    return reply({ error: "Unknown admin action." }, 400);
  } catch (error) {
    console.error("twiga-platform-admin", error);
    return reply({ error: "The admin request could not be completed." }, 500);
  }
});
