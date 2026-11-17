import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const API = "https://api.sautikit.com";

type Row = Record<string, any>;

async function skRequest(key: string, path: string, method = "GET", body?: unknown) {
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: "Bearer " + key,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data: Row = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw.slice(0, 500) }; }
  if (!response.ok) {
    const message = String(data?.error?.message || data?.message || data?.error || "SautiKit request failed (HTTP " + response.status + ").");
    throw Object.assign(new Error(message), { status: response.status, details: data?.error || null });
  }
  return data;
}

function composePrompt(core: string, greeting: string, inbound: string, outbound: string) {
  const marker = "----- TWIGA FRONT DESK SETTINGS -----";
  const cleanCore = String(core || "").split(marker)[0].trim();
  return [
    cleanCore,
    marker,
    "OPENING GREETING:\n" + greeting,
    "INBOUND CALL INSTRUCTIONS:\n" + inbound,
    "OUTBOUND CALL INSTRUCTIONS:\n" + outbound,
    "GLOBAL SAFETY: Use only verified information from this business workspace. Never invent prices, stock, availability, bookings, orders, payments, or integration status. Never ask for passwords, PINs, OTPs, card numbers, or security codes. Respect requests not to be called again. If information is missing, say the team will confirm it.",
  ].filter(Boolean).join("\n\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sign in required." }, 401);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !anon || !service) return json({ error: "TWIGA server is not configured." }, 503);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const user = authData?.user;
    if (authError || !user) return json({ error: "Your sign-in has expired. Sign in again." }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "get_config");
    const businessId = String(body.businessId || "").trim();

    const { data: adminRow, error: adminError } = await admin
      .from("twiga_platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (adminError) throw adminError;
    const isPlatformAdmin = !!adminRow;

    if (action === "connect") {
      if (!isPlatformAdmin) return json({ error: "Only a TWIGA platform administrator can connect the shared SautiKit account." }, 403);
      const apiKey = String(body.apiKey || "").trim();
      if (apiKey.length < 20 || apiKey.length > 4000) return json({ error: "Enter a valid SautiKit API key." }, 400);
      const catalog = await skRequest(apiKey, "/v1/models");
      if (!Array.isArray(catalog?.data) || !catalog.data.length) return json({ error: "SautiKit returned no voice models. Check that this key has model read access." }, 400);
      const { data: last4, error: saveError } = await admin.rpc("twiga_set_platform_secret", {
        p_provider: "sautikit_platform_api_key",
        p_secret: apiKey,
        p_updated_by: user.id,
      });
      if (saveError) {
        console.error("SautiKit Vault save failed:", saveError.message);
        return json({ error: "SautiKit key validated, but could not be stored in encrypted Vault." }, 500);
      }
      return json({
        connected: true,
        keyLast4: last4,
        models: catalog.data,
        message: "SautiKit API key verified and stored securely in TWIGA Vault.",
      });
    }

    if (!businessId) return json({ error: "Choose a business workspace first." }, 400);
    const { data: membership, error: memberError } = await admin
      .from("business_members").select("role").eq("business_id", businessId).eq("user_id", user.id).maybeSingle();
    if (memberError) throw memberError;
    if (!membership && !isPlatformAdmin) return json({ error: "You are not authorised for this business." }, 403);
    const canManage = isPlatformAdmin || ["owner", "admin"].includes(String(membership?.role || ""));

    const { data: line, error: lineError } = await admin
      .from("twiga_phone_lines").select("*").eq("business_id", businessId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lineError) throw lineError;
    const settings: Row = line?.settings && typeof line.settings === "object" ? line.settings : {};
    const agentId = String(settings.inbound_agent_id || "");
    const numberId = String(line?.provider_reference || "");

    const { data: keyRef, error: keyRefError } = await admin
      .from("twiga_platform_secret_refs").select("secret_last4,updated_at")
      .eq("provider", "sautikit_platform_api_key").maybeSingle();
    if (keyRefError) throw keyRefError;
    const { data: apiKey, error: secretError } = await admin.rpc("twiga_get_platform_secret", {
      p_provider: "sautikit_platform_api_key",
    });
    if (secretError) throw secretError;
    const key = String(apiKey || "");

    if (action === "get_config") {
      if (!line) return json({ phoneLine: null, keyConfigured: !!keyRef, isPlatformAdmin });
      let models: Row[] = [];
      let agent: Row | null = null;
      let number: Row | null = null;
      let providerError = "";
      if (key) {
        const [catalogResult, agentResult, numberResult] = await Promise.allSettled([
          skRequest(key, "/v1/models"),
          agentId ? skRequest(key, "/v1/agents/" + encodeURIComponent(agentId)) : Promise.resolve(null),
          numberId ? skRequest(key, "/v1/numbers/" + encodeURIComponent(numberId)) : Promise.resolve(null),
        ]);
        if (catalogResult.status === "fulfilled") {
          models = Array.isArray(catalogResult.value?.data) ? catalogResult.value.data : [];
          if (!models.length) providerError = "SautiKit returned an empty voice/model catalogue.";
        } else {
          providerError = "Voice catalogue: " + (catalogResult.reason instanceof Error ? catalogResult.reason.message : "SautiKit catalogue request failed.");
        }
        if (agentResult.status === "fulfilled") {
          const agentData = agentResult.value;
          agent = agentData?.agent || agentData?.data?.agent || agentData?.data || agentData;
        } else {
          const message = "Receptionist agent: " + (agentResult.reason instanceof Error ? agentResult.reason.message : "agent lookup failed.");
          providerError = [providerError, message].filter(Boolean).join(" · ");
        }
        if (numberResult.status === "fulfilled") {
          const numberEnvelope = numberResult.value as any;
          number = numberEnvelope?.number || numberEnvelope?.data?.number || numberEnvelope?.data || numberEnvelope;
        } else {
          const message = "Phone number: " + (numberResult.reason instanceof Error ? numberResult.reason.message : "number lookup failed.");
          providerError = [providerError, message].filter(Boolean).join(" · ");
        }
      }
      const scripts = settings.sautikit_scripts && typeof settings.sautikit_scripts === "object" ? settings.sautikit_scripts : {};
      const liveInboundRoute = number?.routing?.inbound_agent || number?.inbound_agent || number?.routing?.inboundAgent;
      const liveInboundAgentId = liveInboundRoute?.agent_id || liveInboundRoute?.agentId;
      const liveInboundVerified = !!(liveInboundRoute?.enabled && agent?.id && liveInboundAgentId === agentId);
      return json({
        isPlatformAdmin,
        keyConfigured: !!keyRef,
        keyLast4: keyRef?.secret_last4 || "",
        keyUpdatedAt: keyRef?.updated_at || null,
        phoneLine: {
          id: line.id,
          line_number: line.line_number,
          carrier: line.carrier,
          connection_method: line.connection_method,
          inbound_enabled: line.inbound_enabled,
          inbound_status: line.inbound_status,
          outbound_enabled: line.outbound_enabled,
          outbound_status: line.outbound_status,
          provider: line.provider,
          provider_reference: line.provider_reference,
          settings,
        },
        agent,
        number,
        models,
        scripts: {
          greeting: scripts.greeting || "Hello, karibu! Thank you for calling {{business_name}}. How can I help you today?",
          inbound: scripts.inbound || "Answer in the caller's language (Kenyan English or Kiswahili). Identify why they are calling, use verified business information, and capture appointment or order requests for the team to confirm. Never claim that a booking, order or payment is complete until TWIGA confirms it was saved.",
          outbound: scripts.outbound || "Only call a person when the business has authorised the callback. Introduce yourself and the business, explain the reason for the call, ask whether it is a convenient time, keep the conversation brief, and respect requests not to be called again.",
        },
        providerError,
        inboundBound: settings.ai_agent_bound === true
          && settings.inbound_agent_provider === "sautikit-managed"
          && settings.inbound_agent_id === agentId
          && liveInboundVerified,
        inboundVerified: liveInboundVerified,
        inboundMode: liveInboundRoute?.mode || null,
        bookingToolReady: settings.sautikit_booking_tool_ready === true,
        bookingToolCount: Number(agent?.tool_count || 0),
      });
    }

    if (!key) return json({ error: "Connect the SautiKit API key in Connections before changing phone routing." }, 409);
    if (!line || !numberId) return json({ error: "This business does not yet have a SautiKit number ID linked to its phone line. Verify the number in the same SautiKit workspace first." }, 409);
    if (!canManage && ["create_agent", "bind_agent", "publish_agent", "send_call", "configure_forwarding"].includes(action)) return json({ error: "Only the business owner, admin or TWIGA platform administrator can change or call from this receptionist." }, 403);

    const callbackUrl = "https://ztyxxikkposfpxsutnfr.supabase.co/functions/v1/twiga-sautikit-callback";

    if (action === "create_agent") {
      if (agentId) return json({ error: "This business already has a SautiKit agent. Use the existing agent settings instead of creating a duplicate." }, 409);
      const [businessResult, profileResult, businessSettingsResult] = await Promise.all([
        admin.from("businesses").select("name").eq("id", businessId).maybeSingle(),
        admin.from("twiga_business_profiles").select("business_summary,what_they_sell,what_they_do,products_and_services,target_customers,unique_selling_points,service_area,opening_hours,delivery_and_payment,returns_and_refunds,frequently_asked_questions,brand_voice,reply_language,assistant_instructions").eq("business_id", businessId).maybeSingle(),
        admin.from("twiga_business_settings").select("timezone,business_hours,language_mode").eq("business_id", businessId).maybeSingle(),
      ]);
      if (businessResult.error) throw businessResult.error;
      if (profileResult.error) throw profileResult.error;
      if (businessSettingsResult.error) throw businessSettingsResult.error;
      const businessName = String(businessResult.data?.name || "Business").trim().slice(0, 120);
      const profile: Row = profileResult.data || {};
      const businessSettings: Row = businessSettingsResult.data || {};
      const modelId = String(body.model || "sautikit-flash");
      const voice = String(body.voice || "Woman");
      const catalogue = await skRequest(key, "/v1/models");
      const modelEntry = (Array.isArray(catalogue?.data) ? catalogue.data : []).find((entry: Row) => String(entry.id || "") === modelId);
      if (!modelEntry) return json({ error: "Choose a model from the live SautiKit catalogue." }, 400);
      const voices = Array.isArray(modelEntry.voices) ? modelEntry.voices.map(String) : [];
      if (!voices.includes(voice)) return json({ error: "That voice is not available for the selected SautiKit model." }, 400);

      const scripts = {
        greeting: String(body.greeting || settings.sautikit_scripts?.greeting || "Hello, karibu! Thank you for calling " + businessName + ". How can I help you today?").slice(0, 1200),
        inbound: String(body.inboundPrompt || settings.sautikit_scripts?.inbound || "Answer in the caller's preferred language. Use this business's verified profile, understand the reason for the call, and capture booking or order requests for the team to confirm. Never claim an action is complete unless TWIGA confirms it was saved.").slice(0, 5000),
        outbound: String(body.outboundPrompt || settings.sautikit_scripts?.outbound || "Only call people when this business has authorised a callback. Identify the business and reason for calling, ask whether it is convenient, keep it brief, and respect requests not to be called again.").slice(0, 5000),
      };
      const profileFacts = [
        "BUSINESS NAME: " + businessName,
        "BUSINESS SUMMARY: " + String(profile.business_summary || "").slice(0, 2500),
        "WHAT THE BUSINESS DOES: " + String(profile.what_they_do || "").slice(0, 1800),
        "WHAT THE BUSINESS SELLS: " + String(profile.what_they_sell || "").slice(0, 1800),
        "PRODUCTS AND SERVICES: " + String(profile.products_and_services || "").slice(0, 2500),
        "TARGET CUSTOMERS: " + String(profile.target_customers || "").slice(0, 1200),
        "UNIQUE SELLING POINTS: " + String(profile.unique_selling_points || "").slice(0, 1200),
        "SERVICE AREA: " + String(profile.service_area || "").slice(0, 800),
        "OPENING HOURS: " + String(profile.opening_hours || JSON.stringify(businessSettings.business_hours || {})).slice(0, 1200),
        "TIME ZONE: " + String(businessSettings.timezone || "Africa/Nairobi"),
        "PAYMENT AND DELIVERY: " + String(profile.delivery_and_payment || "").slice(0, 1200),
        "RETURNS AND REFUNDS: " + String(profile.returns_and_refunds || "").slice(0, 1200),
        "FREQUENTLY ASKED QUESTIONS: " + String(profile.frequently_asked_questions || "").slice(0, 2500),
        "BRAND VOICE: " + String(profile.brand_voice || "Warm, professional and concise").slice(0, 500),
        "REPLY LANGUAGE: " + String(profile.reply_language || businessSettings.language_mode || "Kenyan English and Kiswahili").slice(0, 300),
        "BUSINESS-SPECIFIC INSTRUCTIONS: " + String(profile.assistant_instructions || body.corePrompt || "").slice(0, 5000),
      ].filter((value) => !value.endsWith(": "));
      const corePrompt = [
        "You are the dedicated AI receptionist for " + businessName + ". You serve only this business workspace. Do not mix information with another business.",
        profileFacts.join("\n"),
        "Use only the profile and verified information for this business. If a price, stock level, booking slot, order status or payment status is not available, say the team will confirm it. Never invent a booking, order or payment. Never request passwords, PINs, OTPs, card numbers or security codes. When a caller asks to make an appointment, collect their name, phone, service and preferred date/time with timezone; ask permission to save the request; then use book_appointment. Only say the request was saved if the tool returns success, and explain that the team must confirm the final slot.",
      ].join("\n\n");
      const basePrompt = composePrompt(corePrompt, scripts.greeting, scripts.inbound, scripts.outbound);
      const agentName = businessName + " · TWIGA Receptionist";
      const createdEnvelope = await skRequest(key, "/v1/agents", "POST", {
        name: agentName,
        base_prompt: basePrompt,
        model: modelId,
        voice,
        accent: "Kenyan English and Kiswahili",
        speech_style: "Warm, clear, natural Kenyan English and Kiswahili; calm, concise turns and natural pauses.",
        max_call_minutes: 8,
      });
      const createdAgent = createdEnvelope?.agent || createdEnvelope?.data?.agent || createdEnvelope?.data || createdEnvelope;
      const createdAgentId = String(createdAgent?.id || createdAgent?.agent_id || "");
      if (!createdAgentId) throw new Error("SautiKit created a response but did not return an agent ID. Refresh before retrying.");
      const signingSecret = String(createdAgent?.tool_signing_secret || createdEnvelope?.tool_signing_secret || "");
      if (signingSecret.length >= 20) {
        const { error: secretSaveError } = await admin.rpc("twiga_set_provider_secret", {
          p_business_id: businessId,
          p_provider: "sautikit_agent_tool_signing",
          p_secret: signingSecret,
          p_updated_by: user.id,
        });
        if (secretSaveError) throw new Error("SautiKit created the agent, but TWIGA could not save its private tool-signing secret in Vault. Do not create another agent; contact TWIGA support.");
      }
      const bookingSecret = Array.from(crypto.getRandomValues(new Uint8Array(32))).map((x) => x.toString(16).padStart(2, "0")).join("");
      const { error: bookingSecretError } = await admin.rpc("twiga_set_provider_secret", {
        p_business_id: businessId, p_provider: "sautikit_booking_tool_secret", p_secret: bookingSecret, p_updated_by: user.id,
      });
      if (bookingSecretError) throw new Error("SautiKit created the agent, but TWIGA could not save its booking-tool credential in Vault. Do not create another agent; contact TWIGA support.");
      const toolId = crypto.randomUUID();
      const nextSettings: Row = {
        ...settings,
        inbound_agent_id: createdAgentId,
        inbound_agent_provider: "sautikit-managed",
        inbound_agent_name: agentName,
        inbound_agent_revision: 0,
        inbound_voice: voice,
        inbound_model_id: modelId,
        ai_agent_bound: false,
        sautikit_booking_tool_id: toolId,
        sautikit_booking_tool_ready: false,
        sautikit_scripts: scripts,
      };
      const { error: saveAgentError } = await admin.from("twiga_phone_lines")
        .update({ settings: nextSettings, inbound_enabled: true, inbound_status: "testing", updated_at: new Date().toISOString() })
        .eq("id", line.id);
      if (saveAgentError) throw saveAgentError;

      let revision = 0;
      try {
        await skRequest(key, "/v1/agents/" + encodeURIComponent(createdAgentId) + "/tools/" + encodeURIComponent(toolId), "PUT", {
          agent_id: createdAgentId,
          tool_id: toolId,
          name: "book_appointment",
          purpose: "saving this caller's appointment request to this business after the caller explicitly agrees",
          description: "Create a pending appointment request for this business. Ask the caller for their name, phone number, service and preferred date/time with timezone. Ask for explicit consent before saving. The team must confirm the final slot; never claim it is confirmed.",
          url: "https://ztyxxikkposfpxsutnfr.supabase.co/functions/v1/twiga-booking-tool",
          method: "POST",
          headers: { "x-twiga-tool-secret": bookingSecret },
          body_params: { business_id: businessId, agent_id: createdAgentId },
          timeout_ms: 12000,
          parameters: {
            type: "object",
            properties: {
              customer_name: { type: "string", description: "Caller’s full name." },
              phone: { type: "string", description: "Caller phone number in international format, preferably +254..." },
              service: { type: "string", description: "The service or appointment type requested." },
              scheduled_at: { type: "string", description: "Preferred appointment date and time in ISO 8601 format including the timezone offset, for example 2026-11-18T10:00:00+03:00." },
              duration_minutes: { type: "integer", minimum: 15, maximum: 240, description: "Requested appointment duration in minutes; default 30." },
              notes: { type: "string", description: "Optional caller notes or preferences." },
              consent_confirmed: { type: "boolean", description: "True only after the caller explicitly agrees that TWIGA may save the appointment request." },
            },
            required: ["customer_name", "phone", "service", "scheduled_at", "consent_confirmed"],
            additionalProperties: false,
          },
        });
        const publishedEnvelope = await skRequest(key, "/v1/agents/" + encodeURIComponent(createdAgentId) + "/publish", "POST", {});
        const published = publishedEnvelope?.revision || publishedEnvelope?.data?.revision || publishedEnvelope?.data || publishedEnvelope;
        revision = Number(published?.revision || published?.current_revision || published?.version || createdAgent?.current_revision || 1);
        await skRequest(key, "/v1/numbers/" + encodeURIComponent(numberId) + "/routing", "PUT", {
          voice_callback_url: callbackUrl,
          events_url: callbackUrl,
          inbound_agent: {
            enabled: true,
            agent_id: createdAgentId,
            mode: "always",
            handover_callback_url: callbackUrl,
            handover_voicemail: {
              greeting_text: "The " + businessName + " team cannot take your call live right now. Please leave your name, callback number and a short message after the tone.",
              max_length: 90,
              beep: true,
            },
          },
        });
        const boundSettings = { ...nextSettings, ai_agent_bound: true, sautikit_booking_tool_ready: true, inbound_agent_revision: revision };
        const { error: saveBoundError } = await admin.from("twiga_phone_lines")
          .update({ settings: boundSettings, inbound_enabled: true, inbound_status: "testing", updated_at: new Date().toISOString() })
          .eq("id", line.id);
        if (saveBoundError) throw saveBoundError;
        return json({
          created: true, bound: true, bookingToolReady: true, agentId: createdAgentId, revision, voice, model: modelId,
          message: "Created a dedicated " + businessName + " receptionist, published revision " + revision + " and bound it to this business's existing SautiKit number. Inbound remains in testing until a real call is answered.",
        });
      } catch (routeError) {
        const routeMessage = routeError instanceof Error ? routeError.message : "SautiKit did not confirm the inbound route.";
        return json({
          created: true, bound: false, bookingToolReady: false, agentId: createdAgentId, revision,
          error: "The dedicated agent was created, but its appointment tool or inbound binding needs to be retried: " + routeMessage,
          message: "The agent is saved for this business. Use Retry inbound binding to finish the appointment tool and phone setup; do not create another agent.",
        }, 502);
      }
    }

    if (action === "bind_agent") {
      if (!agentId) return json({ error: "Create this business's receptionist first." }, 409);
      const { data: bookingSecret, error: bookingSecretError } = await admin.rpc("twiga_get_provider_secret", {
        p_business_id: businessId, p_provider: "sautikit_booking_tool_secret",
      });
      if (bookingSecretError || !bookingSecret) return json({ error: "This business's appointment-tool credential is not saved. Recreate the business agent or contact TWIGA support." }, 409);
      const toolId = String(settings.sautikit_booking_tool_id || crypto.randomUUID());
      await skRequest(key, "/v1/agents/" + encodeURIComponent(agentId) + "/tools/" + encodeURIComponent(toolId), "PUT", {
        agent_id: agentId,
        tool_id: toolId,
        name: "book_appointment",
        purpose: "saving this caller's appointment request to this business after the caller explicitly agrees",
        description: "Create a pending appointment request for this business. Ask the caller for their name, phone number, service and preferred date/time with timezone. Ask for explicit consent before saving. The team must confirm the final slot; never claim it is confirmed.",
        url: "https://ztyxxikkposfpxsutnfr.supabase.co/functions/v1/twiga-booking-tool",
        method: "POST",
        headers: { "x-twiga-tool-secret": String(bookingSecret) },
        body_params: { business_id: businessId, agent_id: agentId },
        timeout_ms: 12000,
        parameters: {
          type: "object",
          properties: {
            customer_name: { type: "string", description: "Caller’s full name." },
            phone: { type: "string", description: "Caller phone number in international format, preferably +254..." },
            service: { type: "string", description: "The service or appointment type requested." },
            scheduled_at: { type: "string", description: "Preferred appointment date and time in ISO 8601 format including the timezone offset." },
            duration_minutes: { type: "integer", minimum: 15, maximum: 240 },
            notes: { type: "string" },
            consent_confirmed: { type: "boolean", description: "True only after the caller explicitly agrees that TWIGA may save the appointment request." },
          },
          required: ["customer_name", "phone", "service", "scheduled_at", "consent_confirmed"],
          additionalProperties: false,
        },
      });
      const agentEnvelope = await skRequest(key, "/v1/agents/" + encodeURIComponent(agentId));
      const agentData = agentEnvelope?.agent || agentEnvelope?.data?.agent || agentEnvelope?.data || agentEnvelope;
      let revision = Number(agentData?.current_revision || 0);
      if (String(agentData?.status || "").toLowerCase() !== "published" || revision < 1) {
        const publishedEnvelope = await skRequest(key, "/v1/agents/" + encodeURIComponent(agentId) + "/publish", "POST", {});
        const published = publishedEnvelope?.revision || publishedEnvelope?.data?.revision || publishedEnvelope?.data || publishedEnvelope;
        revision = Number(published?.revision || published?.current_revision || published?.version || revision || 1);
      }
      await skRequest(key, "/v1/numbers/" + encodeURIComponent(numberId) + "/routing", "PUT", {
        voice_callback_url: callbackUrl,
        events_url: callbackUrl,
        inbound_agent: {
          enabled: true,
          agent_id: agentId,
          mode: "always",
          handover_callback_url: callbackUrl,
          handover_voicemail: {
            greeting_text: "The business team cannot take your call live right now. Please leave your name, callback number and a short message after the tone.",
            max_length: 90,
            beep: true,
          },
        },
      });
      const nextSettings = {
        ...settings, ai_agent_bound: true, inbound_agent_provider: "sautikit-managed",
        sautikit_booking_tool_id: toolId, sautikit_booking_tool_ready: true, inbound_agent_revision: revision,
      };
      const { error: saveError } = await admin.from("twiga_phone_lines")
        .update({ settings: nextSettings, inbound_enabled: true, inbound_status: "testing", updated_at: new Date().toISOString() })
        .eq("id", line.id);
      if (saveError) throw saveError;
      return json({ bound: true, bookingToolReady: true, agentId, revision, message: "The business appointment tool is connected, the agent is published and SautiKit confirmed the inbound route. Keep it in testing until a real incoming call is answered." });
    }

    if (action === "configure_forwarding") {
      const mode = String(body.mode || "");
      const to = String(body.to || "").trim();
      if (!/^\+[1-9]\d{7,14}$/.test(to)) return json({ error: "Enter a forwarding destination in international format, such as +2547XXXXXXXX." }, 400);
      const sequential = body.sequential !== false;
      const ringTimeout = Math.min(60, Math.max(10, Number(body.ringTimeout || 20)));
      const forward = { destinations: [to], sequential, first_answer_wins: true, ring_timeout: ringTimeout };
      const payload: Row = {};
      let config: Row = {};
      if (mode === "always") {
        payload.forward = forward;
        config = { mode: "always", to, ringTimeout, sequential, updatedAt: new Date().toISOString() };
      } else if (mode === "after_hours") {
        const start = String(body.openingTime || "08:00");
        const end = String(body.closingTime || "18:00");
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start >= end) {
          return json({ error: "Choose a valid opening and closing time; closing must be later than opening." }, 400);
        }
        payload.hours = {
          enabled: true,
          timezone: "Africa/Nairobi",
          weekly: [{ days: [1,2,3,4,5,6], start, end }],
          closed: { mode: "forward", forward },
        };
        config = { mode: "after_hours", to, openingTime: start, closingTime: end, ringTimeout, sequential, updatedAt: new Date().toISOString() };
      } else {
        return json({ error: "Choose direct forwarding or after-hours forwarding." }, 400);
      }
      // Verify this provider number exists in the API-key's own workspace before changing it.
      await skRequest(key, "/v1/numbers/" + encodeURIComponent(numberId));
      const result = await skRequest(key, "/v1/numbers/" + encodeURIComponent(numberId) + "/routing", "PUT", payload);
      const updatedSettings = { ...settings, forwarding_config: { ...config, providerConfirmed: true } };
      const { error: saveError } = await admin.from("twiga_phone_lines")
        .update({ settings: updatedSettings, updated_at: new Date().toISOString() }).eq("id", line.id);
      if (saveError) throw saveError;
      return json({
        configured: true, mode, destination: to, provider: "sautikit",
        routing: result?.routing || result,
        message: mode === "always"
          ? "Direct forwarding was accepted by SautiKit. Calls to this number will be routed to the selected staff number."
          : "After-hours forwarding was accepted by SautiKit. Calls during the saved Nairobi business hours continue on the AI route; calls outside those hours are forwarded.",
      });
    }

    if (["publish_agent", "send_call"].includes(action) && !agentId) return json({ error: "This business has no SautiKit receptionist agent linked to its number. Link an agent in the correct SautiKit workspace first." }, 409);

    if (action === "publish_agent") {
      const [catalog, agentResponse, numberResponse] = await Promise.all([
        skRequest(key, "/v1/models"),
        skRequest(key, "/v1/agents/" + encodeURIComponent(agentId)),
        skRequest(key, "/v1/numbers/" + encodeURIComponent(numberId)),
      ]);
      const agent = agentResponse?.agent || agentResponse?.data?.agent || agentResponse?.data || agentResponse;
      const numberEnvelope = numberResponse as any;
      const number = numberEnvelope?.number || numberEnvelope?.data?.number || numberEnvelope?.data || numberEnvelope;
      const models: Row[] = Array.isArray(catalog?.data) ? catalog.data : [];
      const modelId = String(body.model || agent.model || "");
      const voice = String(body.voice || agent.voice || "");
      const selectedModel = models.find((item) => item.id === modelId);
      if (!selectedModel || !Array.isArray(selectedModel.voices) || !selectedModel.voices.includes(voice)) {
        return json({ error: "That voice is not available on the selected SautiKit model." }, 400);
      }
      const inbound = number?.routing?.inbound_agent || number?.inbound_agent || number?.routing?.inboundAgent;
      const inboundAgentId = inbound?.agent_id || inbound?.agentId;
      if (!inbound?.enabled || inboundAgentId !== agentId) {
        return json({ error: "The SautiKit number is not currently bound to this receptionist. The live inbound route was left unchanged; check number routing in SautiKit first." }, 409);
      }
      const scripts = {
        greeting: String(body.greeting || "").trim().slice(0, 1200),
        inbound: String(body.inboundPrompt || "").trim().slice(0, 5000),
        outbound: String(body.outboundPrompt || "").trim().slice(0, 5000),
      };
      if (!scripts.greeting || !scripts.inbound || !scripts.outbound) return json({ error: "Complete the greeting, inbound and outbound instructions before publishing." }, 400);
      const basePrompt = composePrompt(String(body.corePrompt || agent.base_prompt || ""), scripts.greeting, scripts.inbound, scripts.outbound);
      const updateBody = {
        name: String(agent.name || "TWIGA Product Demo Guide"),
        base_prompt: basePrompt,
        accent: String(agent.accent || "Kenyan English and Kiswahili"),
        speech_style: String(agent.speech_style || "Warm, natural, clear Kenyan English and Kiswahili. Short turns and natural pauses."),
        model: modelId,
        voice,
        max_call_minutes: Number(agent.max_call_minutes || 8),
      };
      const updated = await skRequest(key, "/v1/agents/" + encodeURIComponent(agentId), "PUT", updateBody);
      const published = await skRequest(key, "/v1/agents/" + encodeURIComponent(agentId) + "/publish", "POST");
      const nextSettings = {
        ...settings,
        inbound_agent_provider: "sautikit-managed",
        inbound_agent_id: agentId,
        inbound_agent_name: String(agent.name || "TWIGA Product Demo Guide"),
        inbound_agent_revision: Number(published.revision || (Number(settings.inbound_agent_revision || 0) + 1)),
        inbound_model_id: modelId,
        inbound_voice: voice,
        ai_agent_bound: true,
        provider_status: "active",
        prompt_profile: "twiga-dashboard-managed-v1",
        sautkit_scripts: scripts,
        last_published_at: new Date().toISOString(),
      };
      const { error: updateLineError } = await admin.from("twiga_phone_lines")
        .update({ settings: nextSettings, updated_at: new Date().toISOString() })
        .eq("id", line.id);
      if (updateLineError) throw updateLineError;
      return json({
        published: true,
        revision: published.revision,
        voice,
        model: modelId,
        aiRatePerMinute: Number(selectedModel.rate_per_minute_minor || 0) / 100,
        agent: updated,
        inboundRoutePreserved: true,
        message: "Voice and receptionist instructions published. The existing inbound number remains bound to this same agent.",
      });
    }

    if (action === "send_call") {
      const to = String(body.to || "").trim();
      const reason = String(body.reason || "").trim().slice(0, 500);
      if (!/^\+[1-9]\d{7,14}$/.test(to)) return json({ error: "Enter the destination in international format, such as +2547XXXXXXXX." }, 400);
      if (!reason) return json({ error: "Enter why this person is being called." }, 400);
      if (body.authorised !== true) return json({ error: "Confirm that the person or business has authorised this callback before placing it." }, 400);
      const scripts = settings.sautikit_scripts && typeof settings.sautikit_scripts === "object" ? settings.sautikit_scripts : {};
      const outbound = String(scripts.outbound || "Identify the business, explain the reason for calling, ask if this is a convenient time, and respect requests not to be contacted again.");
      const business = await admin.from("businesses").select("name").eq("id", businessId).maybeSingle();
      const call = await skRequest(key, "/v1/agents/" + encodeURIComponent(agentId) + "/send", "POST", {
        to,
        prompt_template: "You are calling on behalf of {{business_name}}. Reason for calling: {{call_reason}}. " + outbound,
        variables: { business_name: String(business.data?.name || "the business"), call_reason: reason },
      });
      const providerCallId = safe(call?.call_id || call?.id || call?.data?.call_id || call?.data?.id, 200);
      let callRecordId: string | null = null;
      if (providerCallId) {
        const { data: callRecord, error: callRecordError } = await admin.from("twiga_call_records").insert({
          business_id: businessId, provider: "sautikit", provider_call_id: providerCallId, channel: "pstn", direction: "outbound",
          from_number: String(line.line_number || ""), to_number: to, status: safe(call?.status || "queued", 40), started_at: new Date().toISOString(),
          duration_seconds: 0, summary: reason, structured_data: { reason, business_name: String(business.data?.name || "the business") },
          metadata: { source: "dashboard_send_call", authorised: true, agent_id: agentId, agent_revision: settings.inbound_agent_revision || null, voice: settings.inbound_voice || null, model_id: settings.inbound_model_id || null },
          created_by: user.id,
        }).select("id").maybeSingle();
        if (callRecordError) console.error("Could not record SautiKit call in TWIGA history:", callRecordError.message);
        else callRecordId = callRecord?.id || null;
      }
      let retryJobId: string | null = null;
      if (providerCallId) {
        const { data: retryJob, error: retryJobError } = await admin.from("twiga_scheduled_calls").insert({
          business_id: businessId,
          customer_name: "",
          phone_number: to,
          reason,
          scheduled_at: new Date().toISOString(),
          timezone: "Africa/Nairobi",
          consent_status: "opted_in",
          trigger_type: "manual",
          trigger_conditions: { source: "dashboard_send_call" },
          calling_window_start: "08:00",
          calling_window_end: "20:00",
          status: "submitted",
          attempt_count: 1,
          max_attempts: 2,
          retry_interval_minutes: 5,
          provider_call_id: providerCallId,
          created_by: user.id,
          metadata: {
            source: "dashboard_send_call",
            call_record_id: callRecordId,
            agent_id: agentId,
            provider_call_ids: [providerCallId],
            no_answer_retry: { enabled: true, attempts: 0, max_attempts: 2, delay_minutes: 5 },
            dispatch_status: "submitted",
          },
        }).select("id").maybeSingle();
        if (retryJobError) console.error("Could not track SautiKit callback for no-answer retry:", retryJobError.message);
        else retryJobId = retryJob?.id || null;
      }
      await admin.from("twiga_phone_lines").update({ settings: { ...settings, last_outbound_call_id: providerCallId || null, last_outbound_call_status: safe(call?.status || "queued", 40) } }).eq("id", line.id);
      return json({ submitted: true, call, callRecordId, retryJobId, noAnswerRetry: !!retryJobId, message: "Your authorised callback was submitted through SautiKit. When tracked, one no-answer retry is scheduled for five minutes later." });
    }

    return json({ error: "Unknown SautiKit action." }, 404);
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error("twiga-sautikit", err.message);
    return json({ error: err.message || "SautiKit operation failed." }, err.status && err.status >= 400 && err.status < 600 ? err.status : 500);
  }
});