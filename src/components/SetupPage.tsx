import { useEffect, useRef, useState } from "react";

const SETUP_DRAFT_PREFIX = "twiga_setup_draft_v1:";
import { supabase } from "@/lib/supabase";

type Message = { id: string; role: "ai" | "user"; text: string };

async function edgeFunctionError(error: unknown) {
  const err = error as any;
  const response = err?.context;
  if (response && typeof response.clone === "function") {
    const payload = await response.clone().json().catch(() => null);
    if (payload?.error) return String(payload.error);
    if (payload?.message) return String(payload.message);
  }
  return err?.message || "The request could not be completed.";
}

export default function SetupPage({ demo = false, onDone, onBusinessCreated, onOpenConnections }: {
  demo?: boolean;
  onDone: () => void;
  onBusinessCreated: (id: string) => void;
  onOpenConnections?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "ai", text: "Hello! I'm your TWIGA business setup helper. I help you describe your business and build its private workspace. Start with your business name, what you sell or do, and where you operate. I'll ask a few questions and organise the details. I can also draft your receptionist greeting and call-handling instructions. After your workspace is created, use Phone & AI to review them, publish your receptionist and test a call." },
  ]);
  const [input, setInput] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [profile, setProfile] = useState<any>({});
  const [missing, setMissing] = useState<string[]>(["business name", "business type", "what your business does or sells"]);
  const [ready, setReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(demo);
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restore the conversation only after the authenticated owner is known.
  useEffect(() => {
    if (demo || !supabase) return;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data.user;
      setOwnerName(String(user?.user_metadata?.full_name || user?.user_metadata?.name || ""));
      setOwnerEmail(String(user?.email || ""));
      if (!user?.id) { setDraftLoaded(true); return; }
      const key = SETUP_DRAFT_PREFIX + user.id;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved.messages) && saved.messages.length) setMessages(saved.messages);
          if (saved.profile && typeof saved.profile === "object") setProfile(saved.profile);
          if (Array.isArray(saved.missing)) setMissing(saved.missing);
          if (typeof saved.ready === "boolean") setReady(saved.ready);
          if (typeof saved.ownerName === "string" && saved.ownerName) setOwnerName(saved.ownerName);
          if (typeof saved.ownerEmail === "string" && saved.ownerEmail) setOwnerEmail(saved.ownerEmail);
          setDraftSaved(true);
        }
      } catch { /* Ignore an invalid or unavailable local draft. */ }
      setDraftKey(key);
      setDraftLoaded(true);
    });
    return () => { active = false; };
  }, [demo]);

  // Keep the latest prompts and setup progress through refreshes in this browser.
  useEffect(() => {
    if (!draftLoaded || !draftKey || demo) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        messages, profile, missing, ready, ownerName, ownerEmail,
        updatedAt: new Date().toISOString(),
      }));
    } catch { /* Browser storage can be disabled or full. */ }
  }, [draftLoaded, draftKey, demo, messages, profile, missing, ready, ownerName, ownerEmail]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
  }, [messages, thinking]);

  const send = async (value?: string) => {
    const text = (value ?? input).trim();
    if (!text || thinking) return;
    if (demo) {
      setError("Sign in to create a real business workspace. Sample business data is disabled.");
      return;
    }
    if (!supabase || !ownerName.trim() || !ownerEmail.trim()) {
      setError("Add the business owner name and contact email before starting setup.");
      return;
    }
    const next = [...messages, { id: String(Date.now()), role: "user" as const, text }];
    setMessages(next);
    setInput("");
    setThinking(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase!.functions.invoke("twiga-setup-assistant", {
        body: { messages: next.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })), ownerProfile: { name: ownerName.trim(), email: ownerEmail.trim() } },
      });
      if (invokeError) throw new Error(await edgeFunctionError(invokeError));
      if (data?.error) throw new Error(String(data.error));
      setMessages((m) => [...m, { id: String(Date.now() + 1), role: "ai", text: String(data.reply || "Tell me a little more about the business.") }]);
      setProfile(data.businessProfile || {});
      setMissing(Array.isArray(data.missingFields) ? data.missingFields : []);
      setReady(data.readyToBuild === true);
    } catch (e) {
      let setupError = "TWIGA’s setup assistant is temporarily unavailable. Please try again shortly.";
      let assistantNotice = "I’m having trouble reaching the setup assistant right now. Your details are safe — please try again shortly.";
      try {
        const { data: providerStatus, error: statusError } = await supabase!.functions.invoke("twiga-platform-secrets", { body: { action: "get_config" } });
        if (!statusError && providerStatus?.isAdmin) {
          if (providerStatus.keyConfigured !== true) {
            setupError = "The platform OpenRouter API key is missing. Open Connections to save it securely.";
            assistantNotice = "The setup assistant is waiting for TWIGA’s OpenRouter key. Your details are safe. Open Connections, use the OpenRouter card to validate and save the platform key, then return here and send your message again.";
          } else {
            setupError = "OpenRouter is configured, but its free model did not respond. Open Connections and run the setup-model test.";
            assistantNotice = "The OpenRouter key is saved, but the free setup model did not respond this time. Open Connections and choose Test free setup model, then return here and try again.";
          }
        }
      } catch {
        // Keep the safe generic message if provider status cannot be checked.
      }
      setError(setupError);
      setMessages((m) => [...m, { id: String(Date.now() + 2), role: "ai", text: assistantNotice }]);
    } finally {
      setThinking(false);
    }
  };

  const buildWorkspace = async () => {
    if (demo) { setError("Sign in to create a real business workspace. Sample business data is disabled."); return; }
    if (!supabase || !ready || !profile.business_name || !ownerName.trim() || !ownerEmail.trim()) return;
    setBuilding(true);
    setError("");
    try {
      const { data, error: createError } = await supabase.functions.invoke("twiga-business-workspaces", {
        body: {
          action: "create",
          name: profile.business_name,
          businessType: profile.business_type || "general",
          profile: { ...profile, owner_name: ownerName.trim(), owner_email: ownerEmail.trim() },
        },
      });
      if (createError) throw new Error(await edgeFunctionError(createError));
      if (data?.error) throw new Error(String(data.error));
      const businessId = String(data?.business?.id || "");
      if (!businessId) throw new Error("The workspace was not created. Please try again.");
      setMessages((m) => [...m, { id: String(Date.now()), role: "ai", text: "Your private " + profile.business_name + " workspace is ready. Its customers, appointments, business details and receptionist configuration are separated from every other business. Next, connect your Google account in Connections. TWIGA manages the technical services securely for you — no API keys or developer setup are needed." }]);
      onBusinessCreated(businessId);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the business workspace.");
    } finally {
      setBuilding(false);
    }
  };

  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">TWIGA · Business setup assistant</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950">Build your business workspace</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">Describe your business in plain language. The assistant organises your business details and drafts your first phone greeting and receptionist instructions before creating a separate workspace. TWIGA provides the AI and phone services in the background. You do not need to create accounts, find API keys or configure technical settings.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700">Business owner name<input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoComplete="name" placeholder="Your full name" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400" /></label>
        <label className="block text-sm font-medium text-neutral-700">Business contact email<input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} autoComplete="email" placeholder="you@business.co.ke" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400" /></label>
      </div>
    </header>

    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4"><div><h2 className="font-semibold text-neutral-950">Business setup chat</h2><p className="text-xs text-neutral-500">Ask questions and build the profile together</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{thinking ? "Thinking…" : ready ? "Ready to build" : "Collecting details"}</span>{draftSaved && <span className="text-[11px] font-medium text-emerald-700">Conversation restored</span>}</div></div>
        <div ref={scrollRef} className="max-h-[55vh] min-h-[360px] space-y-4 overflow-y-auto p-5">
          {!draftLoaded && <p className="rounded-xl bg-neutral-100 px-4 py-3 text-xs text-neutral-600">Restoring your saved setup conversation…</p>}
          {messages.map((m) => <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-neutral-950 px-4 py-3 text-sm leading-6 text-white" : "mr-auto max-w-[90%] rounded-2xl rounded-bl-md bg-neutral-100 px-4 py-3 text-sm leading-6 text-neutral-800"}>{m.text}</div>)}
          {thinking && <div className="rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-500">Your setup assistant is organising the business details…</div>}
        </div>
        <div className="border-t border-neutral-100 p-4">
          <p className="mb-3 text-xs text-neutral-400">Start with your business name, what you do, and where you operate.</p>
          <div className="flex items-end gap-2"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Tell me about your business…" rows={3} className="min-h-[76px] flex-1 resize-y rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-orange-400" /><button onClick={() => void send()} disabled={thinking || !input.trim()} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Send</button></div>
          <p className="mt-2 text-[11px] text-neutral-500">Enter to send · Shift + Enter for a new line · Your conversation is saved in this browser so you can continue after refreshing.</p>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-neutral-950">Business profile</h2>
          <p className="mt-1 text-xs text-neutral-500">Details gathered by the setup assistant</p>
          <div className="mt-4 space-y-3 text-sm">
            <div><p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Business name</p><p className="mt-1 font-medium text-neutral-900">{profile.business_name || "Not added yet"}</p></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Business type</p><p className="mt-1 font-medium text-neutral-900">{profile.business_type || "Not added yet"}</p></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">What it does / sells</p><p className="mt-1 text-neutral-700">{profile.business_summary || profile.what_they_do || profile.what_they_sell || "Waiting for details…"}</p></div><div><p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">First phone greeting</p><p className="mt-1 text-neutral-700">{profile.receptionist_greeting || "The assistant will draft this with you."}</p></div>
          </div>
          {missing.length > 0 && <div className="mt-4 rounded-xl bg-neutral-50 p-3"><p className="text-xs font-semibold text-neutral-700">Still useful to add</p><ul className="mt-2 list-inside list-disc space-y-1 text-xs text-neutral-500">{missing.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          <button onClick={buildWorkspace} disabled={!ready || building} className="mt-5 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{building ? "Creating workspace…" : "Create my business workspace"}</button>
          <p className="mt-2 text-[11px] leading-5 text-neutral-400">You can refine products, prices, hours and AI instructions after the workspace is created.</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold text-neutral-900">What happens next?</h3><ol className="mt-3 space-y-3 text-xs leading-5 text-neutral-500"><li><strong className="text-neutral-800">1. Create workspace</strong><br/>Your business gets its own private records.</li><li><strong className="text-neutral-800">2. Connect Google</strong><br/>Approve access to the Google services your business wants to use. TWIGA handles the rest.</li><li><strong className="text-neutral-800">3. Configure receptionist</strong><br/>Choose one of the ten SautiKit voices, set inbound/outbound instructions and test with a real phone call.</li></ol></div>
      </aside>
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p>{error}</p>
      {error.includes("OpenRouter") && onOpenConnections && <button type="button" onClick={onOpenConnections} className="mt-3 rounded-xl bg-neutral-950 px-4 py-2.5 text-xs font-semibold text-white">Open Connections</button>}
      {error.includes("temporarily unavailable") && <p className="mt-2 text-xs text-neutral-700">Your business details remain in this chat. Please retry after the service is restored.</p>}
    </div>}
  </div>;
}
