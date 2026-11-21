import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Provider =
  | "openai" | "openrouter" | "xai" | "groq" | "deepseek"
  | "resend" | "palpluss" | "custom";

type Integration = {
  id: string;
  provider_slug: string;
  display_name: string;
  integration_type: string;
  config: Record<string, unknown>;
  credentials_last4: Record<string, string>;
  is_primary_ai: boolean;
  status: string;
  last_test_at?: string | null;
  last_test_message?: string | null;
  updated_at: string;
};

type CustomField = { key: string; label: string; value: string };

const providerNames: Record<Provider, string> = {
  openai: "OpenAI",
  openrouter: "OpenRouter",
  xai: "xAI",
  groq: "Groq",
  deepseek: "DeepSeek",
  resend: "Resend email",
  palpluss: "PalPluss payments",
  custom: "Custom API / external tool",
};
const aiProviders: Provider[] = ["openai", "openrouter", "xai", "groq", "deepseek"];
const modelDefaults: Record<string, string> = {
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
  xai: "grok-3-mini",
  groq: "llama-3.3-70b-versatile",
  deepseek: "deepseek-chat",
};
const promptCopy: Record<Provider, string> = {
  openai: "Paste your OpenAI API key. TWIGA will test access to the model list, then store it in encrypted Vault. Choose the model you want this business to use.",
  openrouter: "Paste your OpenRouter API key and preferred model ID. TWIGA will validate the key before saving it.",
  xai: "Paste your xAI API key and preferred Grok model. The key is tested server-side and never added to the AI chat.",
  groq: "Paste your Groq API key and model ID. TWIGA checks the key before enabling it for this business.",
  deepseek: "Paste your DeepSeek API key and model ID. TWIGA validates access before saving.",
  resend: "Paste the Resend API key for this business. TWIGA tests access to your Resend domains before storing the key.",
  palpluss: "Choose one format: the raw PalPluss API key or its Base64 Basic Authorization value. This is not a Safaricom Daraja OAuth token.",
  custom: "Add between one and five labelled secret fields from the same external service. TWIGA encrypts them, but a provider-specific connector is needed before the AI can execute that service's actions.",
};

async function errorText(error: any, fallback: string) {
  const response = error?.context;
  if (response && typeof response.clone === "function") {
    try {
      const body = await response.clone().json();
      if (typeof body?.error === "string" && body.error.trim()) return body.error;
    } catch { /* use SDK error below */ }
  }
  return error?.message || fallback;
}

export default function BringYourOwnAPI({ businessId, demo = false }: { businessId: string; demo?: boolean }) {
  const [provider, setProvider] = useState<Provider>("openai");
  const [displayName, setDisplayName] = useState("My business AI model");
  const [model, setModel] = useState(modelDefaults.openai);
  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [palplussMode, setPalplussMode] = useState<"api_key" | "basic_authorization">("api_key");
  const [palplussCredential, setPalplussCredential] = useState("");
  const [purpose, setPurpose] = useState("");
  const [customFields, setCustomFields] = useState<CustomField[]>([
    { key: "api_key", label: "API key", value: "" },
  ]);
  const [useAsPrimary, setUseAsPrimary] = useState(true);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [palplussStatus, setPalplussStatus] = useState<{ connected: boolean; last4?: string; updatedAt?: string }>({ connected: false });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!supabase || !businessId) throw new Error("Choose a business workspace and sign in again.");
    const { data, error } = await supabase.functions.invoke("twiga-business-integrations", {
      body: { action, businessId, ...extra },
    });
    if (error) throw new Error(await errorText(error, "The integration service could not respond."));
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, [businessId]);

  const refresh = useCallback(async () => {
    if (!businessId || !supabase || demo) return;
    setLoading(true);
    try {
      const data = await call("list");
      setIntegrations(Array.isArray(data.integrations) ? data.integrations : []);
      setPalplussStatus(data.palpluss || { connected: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load saved integrations.");
      setMessageTone("error");
    } finally {
      setLoading(false);
    }
  }, [businessId, call, demo]);

  useEffect(() => { void refresh(); }, [refresh]);

  const chooseProvider = (next: Provider) => {
    setProvider(next);
    setApiKey("");
    setPalplussCredential("");
    setPalplussMode("api_key");
    setPurpose("");
    setFromEmail("");
    setModel(modelDefaults[next] || "");
    setDisplayName(next === "custom" ? "My external tool" : next === "palpluss" ? "Business PalPluss account" : next === "resend" ? "Business Resend account" : "My " + providerNames[next]);
    setCustomFields([{ key: "api_key", label: "API key", value: "" }]);
    setUseAsPrimary(aiProviders.includes(next));
    setMessage("");
  };

  const updateCustomField = (index: number, patch: Partial<CustomField>) => {
    setCustomFields((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  };

  const save = async () => {
    if (demo) return;
    if (!displayName.trim()) {
      setMessage("Give this connection a name first.");
      setMessageTone("error");
      return;
    }
    let credentials: Record<string, string> = {};
    if (provider === "custom") {
      for (const field of customFields) {
        const key = field.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/^[^a-z]+/, "field_").slice(0, 48);
        if (field.value.trim()) {
          if (!key) {
            setMessage("Every custom key needs a valid field name.");
            setMessageTone("error");
            return;
          }
          credentials[key] = field.value.trim();
        }
      }
    } else if (provider === "palpluss") {
      credentials[palplussMode] = palplussCredential.trim();
    } else {
      credentials.api_key = apiKey.trim();
    }

    if (!Object.values(credentials).some(Boolean)) {
      setMessage("Enter the credential in the secure field below.");
      setMessageTone("error");
      return;
    }
    if (provider === "custom" && Object.keys(credentials).length > 5) {
      setMessage("A custom integration can contain up to five credential fields.");
      setMessageTone("error");
      return;
    }
    if (provider === "custom" && customFields.filter((field) => field.value.trim()).length !== Object.keys(credentials).length) {
      setMessage("Each custom credential needs a distinct field name.");
      setMessageTone("error");
      return;
    }

    setSaving(true);
    setMessage(provider === "custom" ? "Encrypting your tool credentials…" : "Testing the provider and securely saving its credentials…");
    setMessageTone("info");
    try {
      const data = await call("save", {
        provider,
        displayName: displayName.trim(),
        credentials,
        model: aiProviders.includes(provider) ? model.trim() : undefined,
        fromEmail: provider === "resend" ? fromEmail.trim() : undefined,
        purpose: provider === "custom" ? purpose.trim() : undefined,
        isPrimaryAI: aiProviders.includes(provider) && useAsPrimary,
      });
      setApiKey("");
      setPalplussCredential("");
      setCustomFields((current) => current.map((field) => ({ ...field, value: "" })));
      setMessage(data?.message || data?.testMessage || "Integration saved.");
      setMessageTone("success");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The integration could not be saved.");
      setMessageTone("error");
    } finally {
      setSaving(false);
    }
  };

  const makePrimary = async (item: Integration) => {
    setSaving(true);
    try {
      const result = await call("set_primary_ai", { provider: item.provider_slug });
      setMessage(result.message || "Primary AI model updated.");
      setMessageTone("success");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change the AI model.");
      setMessageTone("error");
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async (item: Integration) => {
    if (!window.confirm("Disconnect " + item.display_name + " from this business? Its encrypted credential will be deleted.")) return;
    setSaving(true);
    try {
      await call("delete", { provider: item.provider_slug });
      setMessage(item.display_name + " was disconnected.");
      setMessageTone("success");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disconnect this integration.");
      setMessageTone("error");
    } finally {
      setSaving(false);
    }
  };

  const isAI = aiProviders.includes(provider);
  const primaryPrompt = provider === "custom"
    ? "These fields are saved securely, but TWIGA needs a specific API connector before it can call this tool."
    : provider === "palpluss"
      ? "The key is validated by PalPluss and stored in the existing business-scoped encrypted payment vault."
      : provider === "resend"
        ? "Resend is checked with its domains endpoint; TWIGA does not send a test email or contact your customers."
        : "TWIGA tests model access and, when selected, uses this provider for the business setup assistant, AI operations chat and supported WhatsApp replies.";

  if (demo) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Bring your own tools</h2>
        <p className="mt-1 text-sm text-neutral-600">Connect your own AI and business services after signing in.</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 bg-neutral-50 px-5 py-5 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-orange-700 dark:text-orange-400">Business-owned connections</p>
            <h2 className="mt-1 text-xl font-bold text-neutral-950 dark:text-neutral-100">Bring your own AI & tools</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-neutral-300">Connect the external platforms your business already uses. TWIGA guides you through each provider's exact fields, tests supported credentials and stores them encrypted for this business only.</p>
          </div>
          <span className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">1–5 secure fields per tool</span>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">What are you connecting?
              <select value={provider} onChange={(event) => chooseProvider(event.target.value as Provider)} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100">
                <optgroup label="AI models">
                  <option value="openai">OpenAI</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="xai">xAI / Grok</option>
                  <option value="groq">Groq</option>
                  <option value="deepseek">DeepSeek</option>
                </optgroup>
                <optgroup label="Business services">
                  <option value="resend">Resend email</option>
                  <option value="palpluss">PalPluss payments</option>
                  <option value="custom">Custom API / external tool</option>
                </optgroup>
              </select>
            </label>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Connection name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} placeholder="e.g. Main business email" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
            </label>
          </div>

          <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-3 text-sm leading-6 text-orange-950 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-100">
            {promptCopy[provider]}
          </div>

          {isAI && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200">Model ID
                <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model name from your provider" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              </label>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200">API key
                <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="new-password" spellCheck={false} placeholder="Paste the private API key" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              </label>
              <label className="flex items-start gap-2 rounded-xl border border-neutral-200 p-3 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
                <input type="checkbox" checked={useAsPrimary} onChange={(event) => setUseAsPrimary(event.target.checked)} className="mt-0.5 accent-orange-500" />
                <span><strong>Use this as the business's primary AI model</strong><span className="mt-0.5 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">The business setup assistant, operations chat and supported AI replies will use this provider. Cloudflare Workers AI remains the fallback when no business model is selected.</span></span>
              </label>
            </div>
          )}

          {provider === "resend" && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200">Resend API key
                <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="new-password" spellCheck={false} placeholder="re_…" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              </label>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200">Default sender address (optional)
                <input value={fromEmail} onChange={(event) => setFromEmail(event.target.value)} type="email" placeholder="bookings@yourbusiness.co.ke" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              </label>
            </div>
          )}

          {provider === "palpluss" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPalplussMode("api_key")} className={"rounded-full px-3 py-2 text-xs font-semibold " + (palplussMode === "api_key" ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950" : "border border-neutral-200 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200")}>Raw API key</button>
                <button type="button" onClick={() => setPalplussMode("basic_authorization")} className={"rounded-full px-3 py-2 text-xs font-semibold " + (palplussMode === "basic_authorization" ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950" : "border border-neutral-200 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200")}>Base64 Basic Authorization</button>
              </div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200">{palplussMode === "api_key" ? "PalPluss API key" : "Base64 Basic Authorization"}
                <input value={palplussCredential} onChange={(event) => setPalplussCredential(event.target.value)} type="password" autoComplete="new-password" spellCheck={false} placeholder={palplussMode === "api_key" ? "Paste PalPluss API key" : "Paste Base64 value or complete Basic header"} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              </label>
              <p className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">PalPluss Base64 Basic credentials decode to API_KEY: (empty password). A Safaricom Daraja OAuth token is a different credential and must not be entered here.</p>
            </div>
          )}

          {provider === "custom" && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200">What should this API be used for?
                <input value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={500} placeholder="e.g. Check delivery status and create dispatch requests" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              </label>
              {customFields.map((field, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)_auto]">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Field name
                    <input value={field.label} onChange={(event) => updateCustomField(index, {label:event.target.value,key:event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,"_").replace(/^[^a-z]+/,"field_")})} maxLength={48} placeholder="API key" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
                  </label>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Private value
                    <input value={field.value} onChange={(event) => updateCustomField(index, {value:event.target.value})} type="password" autoComplete="new-password" spellCheck={false} placeholder="Enter this credential" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
                  </label>
                  <button type="button" onClick={() => setCustomFields((current) => current.filter((_, i) => i !== index))} disabled={customFields.length === 1} className="mt-5 rounded-lg border border-neutral-200 px-3 text-xs font-semibold text-neutral-600 disabled:opacity-30 dark:border-neutral-700 dark:text-neutral-300">Remove</button>
                </div>
              ))}
              <button type="button" onClick={() => setCustomFields((current) => current.length >= 5 ? current : [...current, {key:"credential_" + (current.length + 1),label:"Credential " + (current.length + 1),value:""}])} disabled={customFields.length >= 5} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 disabled:opacity-30 dark:border-neutral-700 dark:text-neutral-200">+ Add credential field ({customFields.length}/5)</button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200">{saving ? "Saving securely…" : provider === "custom" ? "Save encrypted credentials" : "Test & save connection"}</button>
            <button type="button" onClick={() => void refresh()} disabled={loading || saving} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">Refresh connections</button>
          </div>
          <p className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">Private values are sent directly to a server-side Supabase function and encrypted in Vault. TWIGA stores only each field's last four characters for display. Do not paste credentials into the AI conversation.</p>
          <p className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">{primaryPrompt}</p>
          {message && <p role="status" className={"rounded-xl border p-3 text-sm " + (messageTone === "success" ? "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-100" : messageTone === "error" ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" : "border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200")}>{message}</p>}
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">Saved for this business</h3><span className="text-xs text-neutral-500">{integrations.length + (palplussStatus.connected ? 1 : 0)} connections</span></div>
            {loading && <p className="mt-3 text-xs text-neutral-500">Loading secure connection status…</p>}
            {!loading && integrations.length === 0 && !palplussStatus.connected && <p className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-3 text-xs leading-5 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900">No business-owned API connections yet. Your default TWIGA AI continues to use Cloudflare Workers AI.</p>}
            {palplussStatus.connected && (
              <article className="mt-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">PalPluss</p><span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-semibold text-orange-800 dark:bg-orange-950/40 dark:text-orange-200">Verified</span></div>
                <p className="mt-1 text-xs text-neutral-500">Business payment credential · •••• {palplussStatus.last4 || "••••"}</p>
              </article>
            )}
            {integrations.map((item) => (
              <article key={item.id} className="mt-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{item.display_name}</p><p className="mt-0.5 text-[11px] text-neutral-500">{item.provider_slug} · {item.integration_type.replaceAll("_"," ")}</p></div>
                  <span className={"rounded-full px-2 py-1 text-[10px] font-semibold " + (item.status === "verified" ? "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200" : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200")}>{item.status === "verified" ? "Verified" : "Saved"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(item.credentials_last4 || {}).map(([key,last4]) => <span key={key} className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{key} · ••••{String(last4)}</span>)}</div>
                {item.is_primary_ai && <p className="mt-2 text-[11px] font-semibold text-orange-700 dark:text-orange-400">Primary AI model for this business</p>}
                {item.last_test_message && <p className="mt-2 text-xs leading-5 text-neutral-500">{item.last_test_message}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.integration_type === "ai_model" && !item.is_primary_ai && <button type="button" onClick={() => void makePrimary(item)} disabled={saving} className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">Use for AI</button>}
                  <button type="button" onClick={() => void disconnect(item)} disabled={saving} className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">Disconnect</button>
                </div>
              </article>
            ))}
          </div>
          <div className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">What TWIGA can use today</p>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-neutral-600 dark:text-neutral-300">
              <li>• Business AI: OpenAI, OpenRouter, xAI, Groq or DeepSeek models.</li>
              <li>• Email: Resend account validation and saved sender identity.</li>
              <li>• Payments: PalPluss key or Base64 Basic credential through the existing payment connector.</li>
              <li>• Custom tools: securely saved fields, ready for a matching provider-specific connector.</li>
            </ul>
            <p className="mt-3 text-[11px] leading-5 text-neutral-500">Custom credentials are not executed as arbitrary URLs or code. TWIGA only runs actions for a supported connector, with business permissions and approval checks.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
