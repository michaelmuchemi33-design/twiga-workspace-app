import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twiga-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const AI_PROVIDERS: Record<string, { name: string; baseUrl: string; defaultModel: string }> = {
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4o-mini" },
  xai: { name: "xAI", baseUrl: "https://api.x.ai/v1", defaultModel: "grok-3-mini" },
  groq: { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile" },
  deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-chat" },
};

const clean = (value: unknown, max = 180) => String(value ?? "").trim().slice(0, max);
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

async function authorisedBusiness(admin: any, userId: string, businessId: string) {
  const { data, error } = await admin.from("business_members")
    .select("role").eq("business_id", businessId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data || !["owner", "admin"].includes(String(data.role))) return false;
  return true;
}

async function validateAiKey(baseUrl: string, key: string, model: string) {
  const response = await fetch(baseUrl.replace(/\/+$/, "") + "/models", {
    method: "GET",
    headers: { Authorization: "Bearer " + key, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const status = response.status;
    throw new Error(status === 401 ? "The AI provider rejected this API key. Check that you copied the correct key." :
      status === 403 ? "The AI provider accepted the account but denied model-list access. Check the key permissions." :
      "The AI provider connection test failed (HTTP " + status + ").");
  }
  const catalog = await response.json().catch(() => ({}));
  const models = Array.isArray(catalog?.data) ? catalog.data : Array.isArray(catalog?.models) ? catalog.models : [];
  if (models.length && !models.some((item: any) => String(item?.id || item?.name || "") === model)) {
    throw new Error("The API key is valid, but model '" + model + "' was not returned by this account's model list. Choose an available model ID from your provider.");
  }
  return "The API key and model access were validated. TWIGA can use " + model + " for this business.";
}

async function validateResendKey(key: string) {
  const response = await fetch("https://api.resend.com/domains?limit=1", {
    method: "GET",
    headers: { Authorization: "Bearer " + key, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(response.status === 401
      ? "Resend rejected this API key. Check the key and its sending access."
      : "Resend connection test failed (HTTP " + response.status + ").");
  }
  return "Resend API key validated. The connected account's domain list was reachable.";
}

async function validatePalPlussCredential(apiKey: string) {
  const response = await fetch("https://api.palpluss.com/v1/wallets/service/balance", {
    method: "GET",
    headers: { Authorization: "Basic " + btoa(apiKey + ":"), Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(response.status === 401
      ? "PalPluss rejected this API key or Basic credential. Check the PalPluss account."
      : "PalPluss credential test failed (HTTP " + response.status + ").");
  }
  return "PalPluss credential validated against the account balance endpoint.";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return reply({ error: "TWIGA integration service is not configured." }, 503);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const payload = await req.json().catch(() => ({}));
  const action = clean(payload.action || "list", 40);

  // The Cloudflare Worker can fetch the primary AI configuration only through
  // this server-to-server secret. Normal dashboard actions still require a user JWT below.
  if (action === "runtime") {
    const supplied = req.headers.get("x-twiga-worker-secret") || "";
    const { data: expected, error: secretError } = await admin.rpc("twiga_get_worker_internal_secret");
    if (secretError || !expected || !supplied || supplied.length !== String(expected).length) {
      return reply({ error: "Internal AI configuration access denied." }, 401);
    }
    let mismatch = 0;
    const left = new TextEncoder().encode(supplied);
    const right = new TextEncoder().encode(String(expected));
    for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
    if (mismatch !== 0) return reply({ error: "Internal AI configuration access denied." }, 401);
    const businessId = clean(payload.businessId, 80);
    if (!/^[0-9a-f-]{36}$/i.test(businessId)) return reply({ error: "Invalid business workspace." }, 400);
    const { data, error } = await admin.rpc("twiga_get_primary_business_ai_integration", { p_business_id: businessId });
    if (error) {
      console.error("TWIGA internal AI config lookup failed", error.message);
      return reply({ error: "Business AI configuration could not be loaded." }, 500);
    }
    return reply(data || {});
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply({ error: "Sign in to manage business integrations." }, 401);
  const { data: authData, error: authError } = await admin.auth.getUser(authorization.slice(7).trim());
  if (authError || !authData.user) return reply({ error: "Your sign-in has expired. Sign in again." }, 401);
  const user = authData.user;

  try {
    const businessId = clean(payload.businessId, 80);
    if (!/^[0-9a-f-]{36}$/i.test(businessId)) return reply({ error: "Choose a valid business workspace." }, 400);

    const isOwner = await authorisedBusiness(admin, user.id, businessId);
    if (!isOwner) return reply({ error: "Only this business's owner or administrator can manage API integrations." }, 403);

    if (action === "list") {
      const [{ data: rows, error }, { data: palpluss, error: palError }] = await Promise.all([
        admin.from("twiga_business_integrations")
          .select("id,provider_slug,display_name,integration_type,config,credentials_last4,is_primary_ai,status,last_test_at,last_test_message,updated_at")
          .eq("business_id", businessId).order("updated_at", { ascending: false }),
        admin.from("twiga_provider_secret_refs")
          .select("secret_last4,updated_at").eq("business_id", businessId).eq("provider", "palpluss").maybeSingle(),
      ]);
      if (error) throw error;
      if (palError) throw palError;
      return reply({
        integrations: rows || [],
        palpluss: palpluss ? { connected: true, last4: palpluss.secret_last4, updatedAt: palpluss.updated_at } : { connected: false },
      });
    }

    if (action === "set_primary_ai") {
      const provider = clean(payload.provider, 48);
      const { data: existing, error: readError } = await admin.from("twiga_business_integrations")
        .select("id,integration_type").eq("business_id", businessId).eq("provider_slug", provider).maybeSingle();
      if (readError) throw readError;
      if (!existing || existing.integration_type !== "ai_model") return reply({ error: "Choose a saved AI model connection." }, 404);
      const { error: clearError } = await admin.from("twiga_business_integrations")
        .update({ is_primary_ai: false, updated_at: new Date().toISOString() }).eq("business_id", businessId);
      if (clearError) throw clearError;
      const { error: setError } = await admin.from("twiga_business_integrations")
        .update({ is_primary_ai: true, updated_at: new Date().toISOString() }).eq("business_id", businessId).eq("provider_slug", provider);
      if (setError) throw setError;
      return reply({ saved: true, primaryAiProvider: provider, message: "This AI model is now the primary model for this business." });
    }

    if (action === "delete") {
      const provider = clean(payload.provider, 48);
      if (!/^[a-z][a-z0-9_-]{1,47}$/.test(provider)) return reply({ error: "Choose a valid integration." }, 400);
      const { data, error } = await admin.rpc("twiga_delete_business_integration", {
        p_business_id: businessId, p_provider_slug: provider, p_updated_by: user.id,
      });
      if (error) throw error;
      if (!data) return reply({ error: "That integration was not found." }, 404);
      return reply({ deleted: true, provider });
    }

    if (action !== "save") return reply({ error: "Unknown business integration action." }, 400);

    const provider = clean(payload.provider, 48).toLowerCase();
    const displayName = clean(payload.displayName, 100);
    const providerSlug = provider === "custom"
      ? "custom_" + (displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "external_tool")
      : provider;
    const credentials = payload.credentials;
    if (!isObject(credentials)) return reply({ error: "Enter the provider credentials in the secure fields." }, 400);
    const credentialEntries = Object.entries(credentials).filter(([key, value]) =>
      /^[a-z][a-z0-9_-]{0,47}$/.test(key) && typeof value === "string" && String(value).trim().length > 0
    );
    if (credentialEntries.length < 1 || credentialEntries.length > 5) {
      return reply({ error: "Enter between one and five credential fields. Blank fields are ignored." }, 400);
    }
    const credentialObject: Record<string, string> = {};
    for (const [key, value] of credentialEntries) {
      const text = String(value).trim();
      if (text.length < 3 || text.length > 4000) return reply({ error: "A credential field is too short or too long." }, 400);
      credentialObject[key] = text;
    }

    if (displayName.length < 2) return reply({ error: "Enter a name for this connection." }, 400);
    if (!/^[a-z][a-z0-9_-]{1,47}$/.test(providerSlug)) return reply({ error: "Choose a connection name with at least two letters or numbers." }, 400);

    if (provider === "palpluss") {
      const apiKeyInput = credentialObject.api_key || "";
      const basicInput = credentialObject.basic_authorization || "";
      if (Boolean(apiKeyInput) === Boolean(basicInput)) {
        return reply({ error: "Enter either the PalPluss API key or the Base64 Basic Authorization value, not both." }, 400);
      }
      let apiKey = apiKeyInput;
      if (basicInput) {
        const encoded = basicInput.replace(/^Basic\s+/i, "").replace(/\s+/g, "");
        try {
          const decoded = atob(encoded);
          if (!decoded.endsWith(":") || decoded.length < 22) {
            return reply({ error: "This is not a PalPluss Basic credential. It must decode to API_KEY: with an empty password. Do not paste a Safaricom Daraja OAuth token here." }, 400);
          }
          apiKey = decoded.slice(0, -1);
        } catch {
          return reply({ error: "The Base64 value is invalid. Paste the Base64 part of the PalPluss Basic header or the complete 'Basic …' header." }, 400);
        }
      }
      if (apiKey.length < 20 || apiKey.length > 500) return reply({ error: "Enter a valid PalPluss API key or Basic Authorization value." }, 400);
      const testMessage = await validatePalPlussCredential(apiKey);
      const { data: last4, error } = await admin.rpc("twiga_set_palpluss_secret", {
        p_business_id: businessId, p_secret: apiKey, p_updated_by: user.id,
      });
      if (error) throw error;
      return reply({
        saved: true, provider: "palpluss", status: "verified", last4,
        message: testMessage + " Saved in encrypted Supabase Vault for this business.",
      });
    }

    let integrationType: "ai_model" | "email" | "custom_api";
    let config: Record<string, unknown>;
    let testMessage = "Saved securely. A supported connector must be enabled before TWIGA can call this custom API.";
    let status: "saved" | "verified" = "saved";

    if (Object.prototype.hasOwnProperty.call(AI_PROVIDERS, provider)) {
      if (Object.keys(credentialObject).length !== 1 || !credentialObject.api_key) {
        return reply({ error: "This AI provider requires one API key." }, 400);
      }
      const spec = AI_PROVIDERS[provider];
      const model = clean(payload.model || spec.defaultModel, 160);
      if (!model) return reply({ error: "Enter the model name from your AI provider." }, 400);
      integrationType = "ai_model";
      config = { provider, base_url: spec.baseUrl, model };
      testMessage = await validateAiKey(spec.baseUrl, credentialObject.api_key, model);
      status = "verified";
    } else if (provider === "resend") {
      if (Object.keys(credentialObject).length !== 1 || !credentialObject.api_key) {
        return reply({ error: "Resend requires one API key." }, 400);
      }
      integrationType = "email";
      config = { from_email: clean(payload.fromEmail, 180) };
      testMessage = await validateResendKey(credentialObject.api_key);
      status = "verified";
    } else if (provider === "custom") {
      integrationType = "custom_api";
      config = { purpose: clean(payload.purpose, 500) };
      if (credentialEntries.length > 5) return reply({ error: "A custom connection can store up to five fields." }, 400);
    } else {
      return reply({ error: "Choose a supported connection template." }, 400);
    }

    const { data: saved, error: saveError } = await admin.rpc("twiga_save_business_integration", {
      p_business_id: businessId,
      p_provider_slug: providerSlug,
      p_display_name: displayName,
      p_integration_type: integrationType,
      p_config: config,
      p_credentials: credentialObject,
      p_is_primary_ai: payload.isPrimaryAI === true && integrationType === "ai_model",
      p_updated_by: user.id,
    });
    if (saveError) throw saveError;

    const now = new Date().toISOString();
    const { error: statusError } = await admin.from("twiga_business_integrations")
      .update({ status, last_test_at: status === "verified" ? now : null, last_test_message: testMessage, updated_at: now })
      .eq("business_id", businessId).eq("provider_slug", providerSlug);
    if (statusError) throw statusError;

    return reply({
      saved: true, integration: saved, providerSlug, status, testMessage,
      message: status === "verified" ? testMessage + " Credentials are encrypted in Supabase Vault and masked in TWIGA." : testMessage,
    });
  } catch (error) {
    console.error("twiga-business-integrations", error);
    const message = error instanceof Error ? error.message : "The integration could not be saved.";
    return reply({ error: message.slice(0, 360) }, 500);
  }
});
