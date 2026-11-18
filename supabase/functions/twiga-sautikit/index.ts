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

const COMPOSIO_PROXY_API = "https://backend.composio.dev/api/v3.1/tools/execute/proxy";
const COMPOSIO_SAUTIKIT_CONNECTED_ACCOUNT_ID = "custom_sauti_kit_primly-telyn";

async function skRequest(key: string, path: string, method = "GET", body?: unknown) {
  const response = await fetch(COMPOSIO_PROXY_API, {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      connected_account_id: COMPOSIO_SAUTIKIT_CONNECTED_ACCOUNT_ID,
      endpoint: path,
      method,
      ...(body === undefined ? {} : { body }),
    }),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let envelope: Row = {};
  try { envelope = raw ? JSON.parse(raw) : {}; } catch { envelope = { message: raw.slice(0, 500) }; }
  const upstreamStatus = Number(envelope.status ?? response.status);
  const data = envelope.data ?? envelope;
  if (!response.ok || (Number.isFinite(upstreamStatus) && upstreamStatus >= 400)) {
    const details = data?.error || envelope?.error || data;
    const message = String(details?.message || details?.detail || details?.error_description || (typeof details === "string" ? details : "") || envelope?.message || "Composio could not proxy the SautiKit request.");
    throw Object.assign(new Error(message), { status: response.status >= 400 ? response.status : (Number.isFinite(upstreamStatus) ? upstreamStatus : 502), details });
  }
  return data as Row;
}

function resolveProviderVoice(voices: unknown[], requested: string): string {
  const values = voices.map((value) => String(value || "")).filter(Boolean);
  const exact = values.find((value) => value.toLowerCase() === requested.toLowerCase());
  if (exact) return exact;
  const isMale = requested === "Man";
  const matches = values.filter((value) => {
    const name = value.toLowerCase().replace(/[^a-z]/g, "");
    return isMale
      ? name === "man" || name.startsWith("man") || name === "male" || name.startsWith("male") || name.includes("masculine")
      : name === "woman" || name.startsWith("woman") || name === "female" || name.startsWith("female") || name.includes("feminine");
  });
  return matches[0] || "";
}

function setupDetailLines(value: unknown) {
  const details: Row = value && typeof value === "object" ? value as Row : {};
  const labels: Record<string, string> = {
    business_location: "BUSINESS LOCATION", service_catalogue: "SERVICE CATALOGUE AND PRICES",
    booking_policy: "BOOKING POLICY", order_handling: "ORDER HANDLING",
    payment_channels: "ACCEPTED PAYMENT METHODS", support_escalation: "SUPPORT ESCALATION",
    staff_handover: "STAFF HANDOVER", call_transfer_number: "CALL TRANSFER NUMBER",
    whatsapp_number: "WHATSAPP NUMBER", contact_email: "BUSINESS CONTACT EMAIL",
    social_links: "SOCIAL LINKS", languages: "SUPPORTED LANGUAGES",
    special_instructions: "SPECIAL INSTRUCTIONS", outbound_call_rules: "OUTBOUND CALL RULES",
  };
  return Object.entries(labels).map(([key,label]) => {
    const v = details[key];
    const rendered = Array.isArray(v) || (v && typeof v === "object") ? JSON.stringify(v) : String(v || "");
    return rendered.trim() ? label + ": " + rendered.slice(0, 3000) : "";
  }).filter(Boolean).join("\n");
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

    if (action === "admin_list_numbers") {
      if (!isPlatformAdmin) return json({ error: "Only a TWIGA platform administrator can view the shared SautiKit number inventory." }, 403);
      const { data: apiKey, error: secretError } = await admin.rpc("twiga_get_platform_secret", { p_provider: "composio_sautikit_api_key" });
      if (secretError) throw secretError;
      if (!apiKey) return json({ error: "Connect the Composio Project API key in TWIGA Connections before listing numbers." }, 409);
      const inventory = await skRequest(String(apiKey), "/v1/numbers");
      const numbers = Array.isArray(inventory?.data) ? inventory.data : [];
      const { data: assignedRows, error: assignedError } = await admin.from("twiga_phone_lines")
        .select("business_id,line_number,provider_reference").eq("provider", "sautikit");
      if (assignedError) throw assignedError;
      const assigned = new Map((assignedRows || []).map((row: Row) => [String(row.provider_reference || ""), row]));
      const assignedBusinessIds = [...new Set((assignedRows || []).map((row: Row) => String(row.business_id || "")).filter(Boolean))];
      const businessNames = new Map<string, string>();
      if (assignedBusinessIds.length) {
        const { data: assignedBusinesses, error: businessNamesError } = await admin.from("businesses")
          .select("id,name").in("id", assignedBusinessIds);
        if (businessNamesError) throw businessNamesError;
        for (const business of assignedBusinesses || []) businessNames.set(String(business.id), String(business.name || ""));
      }
      return json({
        numbers: numbers.map((number: Row) => {
          const id = String(number.id || number.number_id || "");
          const line = assigned.get(id);
          return {
            id, phoneNumber: String(number.e164 || number.phone_number || number.number_e164 || ""),
            status: String(number.status || "unknown"), country: String(number.country_iso2 || ""),
            capabilities: Array.isArray(number.capabilities) ? number.capabilities : [],
            monthlyRetailMinor: Number(number.monthly_retail_total_minor ?? number.monthly_retail_minor ?? 0),
            currency: String(number.currency || "KES"),
            assignedBusinessId: line?.business_id || null,
            assignedBusinessName: line ? (businessNames.get(String(line.business_id)) || null) : null,
            assignedLineNumber: line?.line_number || null,
          };
        }),
      });
    }

    if (action === "admin_assign_number") {
      if (!isPlatformAdmin) return json({ error: "Only a TWIGA platform administrator can assign provider numbers." }, 403);
      const targetBusinessId = String(body.businessId || "").trim();
      const providerNumberId = String(body.numberId || "").trim();
      if (!targetBusinessId || !providerNumberId) return json({ error: "Choose a business and a SautiKit number." }, 400);
      const { data: apiKey, error: secretError } = await admin.rpc("twiga_get_platform_secret", { p_provider: "composio_sautikit_api_key" });
      if (secretError) throw secretError;
      if (!apiKey) return json({ error: "Connect the shared SautiKit API key in Admin before assigning numbers." }, 409);
      const [inventory, businessResult, assignedResult] = await Promise.all([
        skRequest(String(apiKey), "/v1/numbers"),
        admin.from("businesses").select("id,name").eq("id", targetBusinessId).maybeSingle(),
        admin.from("twiga_phone_lines").select("id,business_id,line_number,provider_reference").eq("provider", "sautikit").eq("provider_reference", providerNumberId).maybeSingle(),
      ]);
      if (businessResult.error) throw businessResult.error;
      if (!businessResult.data) return json({ error: "The selected TWIGA business was not found." }, 404);
      if (assignedResult.error) throw assignedResult.error;
      if (assignedResult.data && assignedResult.data.business_id !== targetBusinessId) {
        const { data: currentOwner } = await admin.from("businesses").select("name").eq("id", assignedResult.data.business_id).maybeSingle();
        return json({ error: "This number is already assigned to " + String(currentOwner?.name || "another business") + ". Unassign it from that business before reassigning." }, 409);
      }
      const numbers = Array.isArray(inventory?.data) ? inventory.data : [];
      const number = numbers.find((entry: Row) => String(entry.id || entry.number_id || "") === providerNumberId);
      if (!number) return json({ error: "That number is not present in the connected SautiKit workspace." }, 404);
      if (String(number.status || "").toLowerCase() !== "active") return json({ error: "Only active SautiKit numbers can be assigned to a business." }, 409);
      const phone = String(number.e164 || number.phone_number || number.number_e164 || "").trim();
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) return json({ error: "SautiKit returned an invalid E.164 phone number." }, 502);
      const { data: currentLine, error: currentLineError } = await admin.from("twiga_phone_lines")
        .select("id,settings").eq("business_id", targetBusinessId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (currentLineError) throw currentLineError;
      const oldSettings: Row = currentLine?.settings && typeof currentLine.settings === "object" ? currentLine.settings : {};
      const nextSettings = {
        ...oldSettings,
        number_assigned_by: user.email || user.id,
        number_assigned_at: new Date().toISOString(),
        provider_status: "active",
        ai_agent_bound: false,
        inbound_agent_id: null,
        inbound_agent_provider: null,
        inbound_agent_name: null,
        inbound_agent_revision: null,
        inbound_route_verified_at: null,
      };
      const linePayload = {
        business_id: targetBusinessId, line_number: phone, carrier: "sautikit",
        connection_method: "sautikit_managed", provider: "sautikit",
        provider_reference: providerNumberId,
        inbound_enabled: false, outbound_enabled: false,
        inbound_status: "not_configured", outbound_status: "not_configured",
        settings: nextSettings, updated_at: new Date().toISOString(),
      };
      const saved = currentLine
        ? await admin.from("twiga_phone_lines").update(linePayload).eq("id", currentLine.id).select("*").single()
        : await admin.from("twiga_phone_lines").insert(linePayload).select("*").single();
      if (saved.error) throw saved.error;
      await admin.from("twiga_admin_audit_logs").insert({
        admin_email: user.email || "unknown", action: "phone_number.assigned",
        resource_type: "business", resource_id: targetBusinessId,
        metadata: { business_name: businessResult.data.name, phone_number: phone, provider_number_id: providerNumberId },
      });
      return json({ assigned: true, business: businessResult.data, phoneLine: saved.data, message: phone + " assigned to " + businessResult.data.name + ". Voice routing remains disabled until its receptionist agent is configured and verified." });
    }

    if (action === "connect") {
      if (!isPlatformAdmin) return json({ error: "Only a TWIGA platform administrator can connect the shared SautiKit account." }, 403);
      const apiKey = String(body.apiKey || "").trim();
      if (apiKey.length < 20 || apiKey.length > 4000) return json({ error: "Enter a valid SautiKit API key." }, 400);
      const catalog = await skRequest(apiKey, "/v1/models");
      if (!Array.isArray(catalog?.data) || !catalog.data.length) return json({ error: "SautiKit returned no voice models. Check that this key has model read access." }, 400);

      let workspaceId: string | null = null;
      try {
        const encoded = apiKey.split(".")[1] || "";
        const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
        workspaceId = JSON.parse(atob(normalized)).workspace_id || null;
      } catch { /* Some provider keys are opaque rather than JWTs. */ }

      let numberCount: number | null = null;
      let agentCount: number | null = null;
      let numberCheckError: string | null = null;
      let agentCheckError: string | null = null;
      let matchedLines: Array<{ lineNumber: string; providerReference: string }> = [];
      try {
        const numberResult = await skRequest(apiKey, "/v1/numbers");
        const numbers = Array.isArray(numberResult?.data) ? numberResult.data : [];
        numberCount = numbers.length;
        const availableIds = new Set(numbers.map((n: any) => String(n.id || n.number_id || "")));
        const { data: savedLines, error: linesError } = await admin.from("twiga_phone_lines")
          .select("line_number,provider_reference").eq("provider", "sautikit");
        if (linesError) throw linesError;
        matchedLines = (savedLines || []).filter((line: any) => availableIds.has(String(line.provider_reference)))
          .map((line: any) => ({ lineNumber: line.line_number, providerReference: line.provider_reference }));
      } catch (error) {
        numberCheckError = String((error as Error)?.message || "Could not list SautiKit numbers.").slice(0, 240);
      }
      try {
        const agentResult = await skRequest(apiKey, "/v1/agents");
        agentCount = Array.isArray(agentResult?.data) ? agentResult.data.length : 0;
      } catch (error) {
        agentCheckError = String((error as Error)?.message || "Could not list SautiKit agents.").slice(0, 240);
      }

      const { data: last4, error: saveError } = await admin.rpc("twiga_set_platform_secret", {
        p_provider: "composio_sautikit_api_key",
        p_secret: apiKey,
        p_updated_by: user.id,
      });
      if (saveError) {
        console.error("SautiKit Vault save failed:", saveError.message);
        return json({ error: "Composio connection validated, but could not be stored in encrypted Vault." }, 500);
      }
      return json({
        connected: true,
        keyLast4: last4,
        workspaceId,
        modelCount: catalog.data.length,
        numberCount,
        agentCount,
        matchedLines,
        numberCheckError,
        agentCheckError,
        models: catalog.data,
        message: numberCount === 0
          ? "Composio connection is stored securely, but this workspace has no claimed phone numbers yet."
          : matchedLines.length
            ? "Composio connection is stored securely and a saved TWIGA line matches a number in this workspace."
            : "Composio connection is stored securely, but no saved TWIGA phone-line reference matches a number in this workspace.",
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
      .eq("provider", "composio_sautikit_api_key").maybeSingle();
    if (keyRefError) throw keyRefError;
    const { data: apiKey, error: secretError } = await admin.rpc("twiga_get_platform_secret", {
      p_provider: "composio_sautikit_api_key",
    });
    if (secretError) throw secretError;
    const key = String(apiKey || "");

    if (action === "get_config") {
      const { data: businessProfile } = await admin.from("twiga_business_profiles")
        .select("setup_details").eq("business_id", businessId).maybeSingle();
      const profileSetup: Row = businessProfile?.setup_details && typeof businessProfile.setup_details === "object" ? businessProfile.setup_details : {};
      const savedVoicePreference: Row = profileSetup.voice_preference && typeof profileSetup.voice_preference === "object" ? profileSetup.voice_preference : {};
      if (!line) return json({
        phoneLine: null, keyConfigured: !!key, isPlatformAdmin,
        voicePreference: { voice: savedVoicePreference.voice || "Woman", gender: savedVoicePreference.gender || (savedVoicePreference.voice === "Man" ? "male" : "female"), model: savedVoicePreference.model || "sautikit-flash" },
      });
      const verificationAt = String(settings.provider_verified_at || "");
      const verificationEpoch = Date.parse(verificationAt);
      const verificationFresh = Number.isFinite(verificationEpoch)
        && verificationEpoch > 0
        && Date.now() - verificationEpoch >= 0
        && Date.now() - verificationEpoch <= 7 * 24 * 60 * 60 * 1000;
      const savedProviderVerification = verificationFresh
        && settings.provider_verified_via === "composio_sautikit"
        && String(line.provider || "") === "sautikit"
        && !!numberId
        && !!line.provider_reference
        && !!agentId
        && settings.inbound_agent_provider === "sautikit-managed"
        && settings.inbound_agent_id === agentId
        && settings.ai_agent_bound === true
        && !!settings.inbound_route_verified_at;

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

      const savedAgent: Row | null = savedProviderVerification ? {
        id: agentId,
        name: String(settings.inbound_agent_name || "TWIGA AI Receptionist"),
        status: "published",
        current_revision: Number(settings.inbound_agent_revision || 0),
        revision: Number(settings.inbound_agent_revision || 0),
        model: String(settings.inbound_model_id || "sautikit-flash"),
        voice: String(settings.inbound_published_voice || "Woman"),
        tool_count: Number(settings.sautikit_booking_tool_count || 0),
      } : null;
      const savedNumber: Row | null = savedProviderVerification ? {
        id: numberId,
        phone_number: String(line.line_number || ""),
        number_e164: String(line.line_number || ""),
        e164: String(line.line_number || ""),
        status: String(settings.provider_status || "active"),
        routing: {
          inbound_agent: {
            agent_id: agentId,
            enabled: true,
            mode: "always",
          },
        },
      } : null;
      const verifiedAgent = agent || savedAgent;
      const verifiedNumber = number || savedNumber;
      const liveInboundRoute = verifiedNumber?.routing?.inbound_agent || verifiedNumber?.inbound_agent || verifiedNumber?.routing?.inboundAgent;
      const liveInboundAgentId = liveInboundRoute?.agent_id || liveInboundRoute?.agentId;
      const liveInboundVerified = !!(liveInboundRoute?.enabled && verifiedAgent?.id && liveInboundAgentId === agentId);
      const providerConnected = !!((number && verifiedAgent?.id === agentId) || savedProviderVerification);
      if (!key && savedProviderVerification) {
        providerError = "SautiKit, the assigned number and receptionist agent were verified through Composio at " + verificationAt + ". TWIGA's server-side Composio Project API key is not saved yet, so live calls remain paused.";
      } else if (!key) {
        providerError = "TWIGA's deployed server is missing its Composio Project API key. The SautiKit account and assigned line cannot be refreshed until the platform credential is saved.";
      }

      const scripts = settings.sautikit_scripts && typeof settings.sautikit_scripts === "object" ? settings.sautikit_scripts : {};
      return json({
        isPlatformAdmin,
        keyConfigured: !!key,
        serverProxyReady: !!key,
        providerConnected,
        providerConnectionSource: number && verifiedAgent ? "live_composio_lookup" : savedProviderVerification ? "saved_composio_verification" : null,
        providerVerificationAt: verificationAt || null,
        keyLast4: keyRef?.secret_last4 || "",
        keyUpdatedAt: keyRef?.updated_at || null,
        numberVerified: !!number || savedProviderVerification,
        providerNumber: String(verifiedNumber?.phone_number || verifiedNumber?.number_e164 || verifiedNumber?.phoneNumber || verifiedNumber?.number || line?.line_number || ""),
        voicePreference: {
          voice: settings.inbound_voice || savedVoicePreference.voice || verifiedAgent?.voice || "Woman",
          gender: settings.voice_gender || savedVoicePreference.gender || ((settings.inbound_voice || savedVoicePreference.voice || verifiedAgent?.voice) === "Man" ? "male" : "female"),
          model: settings.inbound_model_id || savedVoicePreference.model || verifiedAgent?.model || "sautikit-flash",
        },
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
        agent: verifiedAgent,
        number: verifiedNumber,
        models,
        scripts: {
          greeting: scripts.greeting || "Hello, karibu! Thank you for calling {{business_name}}. How can I help you today?",
          inbound: scripts.inbound || "Answer in the caller's language (Kenyan English or Kiswahili). Identify why they are calling, use verified business information, and capture appointment or order requests for the team to confirm. Never claim that a booking, order or payment is complete until TWIGA confirms it was saved.",
          outbound: scripts.outbound || "Only call a person when the business has authorised the callback. Introduce yourself and the business, explain the reason for the call, ask whether it is a convenient time, keep the conversation brief, and respect requests not to be called again.",
        },
        providerError,
        inboundBound: liveInboundVerified || savedProviderVerification,
        inboundVerified: liveInboundVerified || savedProviderVerification,
        inboundMode: liveInboundRoute?.mode || (savedProviderVerification ? "always" : null),
        bookingToolReady: settings.sautikit_booking_tool_ready === true,
        bookingToolCount: Number(verifiedAgent?.tool_count || 0),
      });
    }

    if (action === "save_voice_preference") {
      if (!canManage) return json({ error: "Only the business owner, admin or TWIGA platform administrator can save the receptionist voice." }, 403);
      const selectedVoice = String(body.voice || "").trim();
      const selectedModel = String(body.model || "sautikit-flash").trim();
      if (!["Woman", "Man"].includes(selectedVoice)) return json({ error: "Choose Woman or Man." }, 400);
      let providerVoice = selectedVoice;
      if (key) {
        const catalog = await skRequest(key, "/v1/models");
        const model = (Array.isArray(catalog?.data) ? catalog.data : []).find((entry: Row) => String(entry.id || "") === selectedModel);
        if (!model) return json({ error: "The selected voice model is not available in the connected SautiKit workspace." }, 400);
        providerVoice = resolveProviderVoice(Array.isArray(model.voices) ? model.voices : [], selectedVoice);
        if (!providerVoice) return json({ error: "SautiKit does not currently list a " + (selectedVoice === "Man" ? "male" : "female") + " voice for this model. Choose another model or reconnect the provider catalogue." }, 400);
      }
      const savedAt = new Date().toISOString();
      let savedLine: Row | null = null;
      if (line) {
        const nextSettings = { ...settings, inbound_voice: providerVoice, voice_gender: selectedVoice === "Man" ? "male" : "female", inbound_model_id: selectedModel, voice_preference_saved_at: savedAt };
        const { data, error: saveError } = await admin.from("twiga_phone_lines")
          .update({ settings: nextSettings, updated_at: savedAt }).eq("id", line.id).select("*").single();
        if (saveError) throw saveError;
        savedLine = data;
      }
      const { data: profileRow, error: profileReadError } = await admin.from("twiga_business_profiles")
        .select("setup_details").eq("business_id", businessId).maybeSingle();
      if (profileReadError) throw profileReadError;
      if (profileRow) {
        const details: Row = profileRow.setup_details && typeof profileRow.setup_details === "object" ? profileRow.setup_details : {};
        const { error: profileSaveError } = await admin.from("twiga_business_profiles")
          .update({ setup_details: { ...details, voice_preference: { voice: providerVoice, gender: selectedVoice === "Man" ? "male" : "female", model: selectedModel, saved_at: savedAt } }, updated_at: savedAt, updated_by: user.id })
          .eq("business_id", businessId);
        if (profileSaveError) throw profileSaveError;
      }
      return json({ saved: true, voice: providerVoice, gender: selectedVoice === "Man" ? "male" : "female", model: selectedModel, phoneLine: savedLine, message: "Your " + (selectedVoice === "Man" ? "male" : "female") + " voice preference has been saved." });
    }

    if (!key) return json({ error: "TWIGA's central SautiKit server connection still needs its one-time platform credential. No customer API key is required. Live calls are safely paused until the platform connection is completed." }, 503);
    if (!line || !numberId) return json({ error: "This receptionist does not have a linked SautiKit phone number yet. Live calls are safely paused until the line is assigned." }, 409);
    if (!canManage && ["create_agent", "bind_agent", "publish_agent", "send_call", "configure_forwarding"].includes(action)) return json({ error: "Only the business owner, admin or TWIGA platform administrator can change or call from this receptionist." }, 403);

    const callbackUrl = "https://ztyxxikkposfpxsutnfr.supabase.co/functions/v1/twiga-sautikit-callback";

    if (action === "create_agent") {
      if (agentId) return json({ error: "This business already has a SautiKit agent. Use the existing agent settings instead of creating a duplicate." }, 409);
      const [businessResult, profileResult, businessSettingsResult] = await Promise.all([
        admin.from("businesses").select("name").eq("id", businessId).maybeSingle(),
        admin.from("twiga_business_profiles").select("business_summary,what_they_sell,what_they_do,products_and_services,target_customers,unique_selling_points,service_area,opening_hours,delivery_and_payment,returns_and_refunds,frequently_asked_questions,brand_voice,reply_language,assistant_instructions,setup_details").eq("business_id", businessId).maybeSingle(),
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
        "ADDITIONAL SETUP DETAILS:\n" + setupDetailLines(profile.setup_details),
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
          // Keep lifecycle events and human handover callbacks separate from voice actions.
          // SautiKit's managed agent handles the live conversation.
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
        // Do not reuse the call-events URL as a voice-actions endpoint.
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
      const providerVoice = selectedModel && Array.isArray(selectedModel.voices)
        ? resolveProviderVoice(selectedModel.voices, voice) : "";
      if (!selectedModel || !providerVoice) {
        return json({ error: "SautiKit does not list a matching " + (voice === "Man" ? "male" : "female") + " voice for the selected model." }, 400);
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
      const { data: businessProfile, error: businessProfileError } = await admin.from("twiga_business_profiles")
        .select("business_summary,what_they_sell,what_they_do,products_and_services,target_customers,unique_selling_points,service_area,opening_hours,delivery_and_payment,returns_and_refunds,frequently_asked_questions,brand_voice,reply_language,assistant_instructions,setup_details")
        .eq("business_id", businessId).maybeSingle();
      if (businessProfileError) throw businessProfileError;
      const profileFacts = [
        "BUSINESS SUMMARY: " + String(businessProfile?.business_summary || "").slice(0, 2500),
        "WHAT THE BUSINESS DOES: " + String(businessProfile?.what_they_do || "").slice(0, 1800),
        "WHAT THE BUSINESS SELLS: " + String(businessProfile?.what_they_sell || "").slice(0, 1800),
        "PRODUCTS AND SERVICES: " + String(businessProfile?.products_and_services || "").slice(0, 2500),
        "TARGET CUSTOMERS: " + String(businessProfile?.target_customers || "").slice(0, 1200),
        "UNIQUE SELLING POINTS: " + String(businessProfile?.unique_selling_points || "").slice(0, 1200),
        "SERVICE AREA: " + String(businessProfile?.service_area || "").slice(0, 800),
        "OPENING HOURS: " + String(businessProfile?.opening_hours || "").slice(0, 1200),
        "PAYMENT AND DELIVERY: " + String(businessProfile?.delivery_and_payment || "").slice(0, 1200),
        "RETURNS AND REFUNDS: " + String(businessProfile?.returns_and_refunds || "").slice(0, 1200),
        "FREQUENTLY ASKED QUESTIONS: " + String(businessProfile?.frequently_asked_questions || "").slice(0, 2500),
        "BRAND VOICE: " + String(businessProfile?.brand_voice || "").slice(0, 500),
        "REPLY LANGUAGE: " + String(businessProfile?.reply_language || "").slice(0, 300),
        "BUSINESS-SPECIFIC INSTRUCTIONS: " + String(businessProfile?.assistant_instructions || "").slice(0, 5000),
        "ADDITIONAL SETUP DETAILS:\n" + setupDetailLines(businessProfile?.setup_details),
      ].filter((value) => !value.endsWith(": "));
      const corePrompt = [String(body.corePrompt || agent.base_prompt || ""), profileFacts.join("\n")].filter(Boolean).join("\n\n");
      const basePrompt = composePrompt(corePrompt, scripts.greeting, scripts.inbound, scripts.outbound);
      const updateBody = {
        name: String(agent.name || "TWIGA Product Demo Guide"),
        base_prompt: basePrompt,
        accent: String(agent.accent || "Kenyan English and Kiswahili"),
        speech_style: String(agent.speech_style || "Warm, natural, clear Kenyan English and Kiswahili. Short turns and natural pauses."),
        model: modelId,
        voice: providerVoice,
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
        inbound_voice: providerVoice,
        voice_gender: voice === "Man" ? "male" : "female",
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
        voice: providerVoice,
        gender: voice === "Man" ? "male" : "female",
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
      const requestedGender = String(body.voice || "").toLowerCase();
      if (requestedGender === "woman" || requestedGender === "man") {
        const [catalog, agentResponse] = await Promise.all([
          skRequest(key, "/v1/models"),
          skRequest(key, "/v1/agents/" + encodeURIComponent(agentId)),
        ]);
        const currentAgent = agentResponse?.agent || agentResponse?.data?.agent || agentResponse?.data || agentResponse;
        const selectedModelId = String(body.model || currentAgent.model || "sautikit-flash");
        const selectedModel = (Array.isArray(catalog?.data) ? catalog.data : []).find((item: any) => item.id === selectedModelId);
        const selectedVoice = selectedModel && Array.isArray(selectedModel.voices)
          ? resolveProviderVoice(selectedModel.voices, requestedGender === "man" ? "Man" : "Woman") : "";
        if (!selectedVoice) return json({ error: "The selected SautiKit model does not offer that voice. Choose another voice and try again." }, 400);
        if (String(currentAgent.voice || "") !== selectedVoice || String(currentAgent.model || "") !== selectedModelId) {
          await skRequest(key, "/v1/agents/" + encodeURIComponent(agentId), "PUT", {
            name: String(currentAgent.name || "TWIGA AI Receptionist"),
            base_prompt: String(currentAgent.base_prompt || ""),
            accent: String(currentAgent.accent || "Kenyan English"),
            speech_style: String(currentAgent.speech_style || "Warm, natural and clear."),
            model: selectedModelId,
            voice: selectedVoice,
            max_call_minutes: Number(currentAgent.max_call_minutes || 8),
          });
          const published = await skRequest(key, "/v1/agents/" + encodeURIComponent(agentId) + "/publish", "POST");
          await admin.from("twiga_phone_lines").update({
            settings: { ...settings, inbound_model_id: selectedModelId, inbound_voice: selectedVoice, voice_gender: requestedGender === "man" ? "male" : "female", inbound_agent_revision: Number(published.revision || settings.inbound_agent_revision || 0), last_published_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          }).eq("id", line.id);
        }
      }
      const call = await skRequest(key, "/v1/agents/" + encodeURIComponent(agentId) + "/send", "POST", {
        to,
        prompt_template: "You are calling on behalf of {{business_name}} to run a receptionist test. Identify yourself as the AI receptionist, explain that this is a short test, invite the person to ask about the business, and demonstrate how you handle a normal customer enquiry. Do not claim any booking or action has been completed. " + outbound,
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