import { useCallback, useEffect, useRef, useState } from "react";
import { RetellClient } from "retell-client-js-sdk";
import { supabase } from "@/lib/supabase";

type Business = { id: string; name: string; business_type?: string; status?: string; role?: string };
const voiceNotes = [
  ["Willa · Cartesia", "Female", "cartesia-Willa"],
  ["Dorothy · ElevenLabs", "Female", "11labs-Dorothy"],
  ["Amy · OpenAI", "Female", "openai-Amy"],
  ["Maren · Minimax", "Female", "minimax-Maren"],
  ["Eleanor · Inworld", "Female", "inworld-Eleanor"],
  ["Anthony · ElevenLabs", "Male", "11labs-Anthony"],
  ["Fable · OpenAI", "Male", "openai-Fable"],
  ["Duncan · Inworld", "Male", "inworld-Duncan"],
  ["Anthony · Cartesia", "Male", "cartesia-Anthony"],
  ["Anthony · OpenAI", "Male", "openai-Anthony"],
];

function loadGoogle() {
  return new Promise<void>((resolve, reject) => {
    const w = window as any;
    if (w.google?.accounts?.oauth2) return resolve();
    let script = document.getElementById("twiga-google-identity") as HTMLScriptElement | null;
    if (script) {
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("Google sign-in could not load.")), { once: true });
      return;
    }
    script = document.createElement("script");
    script.id = "twiga-google-identity";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in could not load."));
    document.head.appendChild(script);
  });
}

export default function Profile({ userId, businessId, businesses, onBusinessChange, onRefreshBusinesses }: {
  userId?: string; businessId?: string; businesses: Business[];
  onBusinessChange: (id: string) => void; onRefreshBusinesses: () => Promise<void>;
}) {
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [sessionStart, setSessionStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [google, setGoogle] = useState<any>({ connected: false });
  const [googleTest, setGoogleTest] = useState("");
  const [retell, setRetell] = useState<any>({});
  const [retellKey, setRetellKey] = useState("");
  const [agents, setAgents] = useState<any[]>([]);
  const [agentId, setAgentId] = useState("");
  const [model, setModel] = useState("gpt-6-luna");
  const [callStatus, setCallStatus] = useState("Not started");
  const [inboundPrompt, setInboundPrompt] = useState("Greet callers warmly, understand what they need, and use only verified business information. Capture appointment and order requests for staff confirmation.");
  const [outboundPrompt, setOutboundPrompt] = useState("Only call people when the business has authorised the follow-up. Identify the business, explain the reason, ask if it is a convenient time, and respect requests not to be contacted.");
  const callSession = useRef<any>(null);

  const current = businesses.find((b) => b.id === businessId);
  const clientId = user?.id ? "TWG-" + String(user.created_at || "").slice(0, 10).replaceAll("-", "") + "-" + String(user.id).replaceAll("-", "").slice(0, 6).toUpperCase() : "";

  const googleAction = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!supabase || !businessId) throw new Error("Create or select a business workspace first.");
    const { data, error } = await supabase.functions.invoke("google-workspace", { body: { action, businessId, ...extra } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, [businessId]);

  const retellAction = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!supabase || !businessId) throw new Error("Create or select a business workspace first.");
    const { data, error } = await supabase.functions.invoke("twiga-retell", { body: { action, businessId, ...extra } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, [businessId]);

  const loadGoogleStatus = useCallback(async () => {
    if (!businessId) return;
    try { setGoogle(await googleAction("status")); } catch (e) { setMessage(e instanceof Error ? e.message : "Google status unavailable."); }
  }, [businessId, googleAction]);

  const loadRetell = useCallback(async () => {
    if (!businessId) return;
    try {
      const data = await retellAction("get_config");
      setRetell(data);
      if (data.config?.retell_model) setModel(data.config.retell_model);
      if (data.config?.retell_agent_id) setAgentId(data.config.retell_agent_id);
      if (data.keyConfigured) {
        const result = await retellAction("list_agents");
        setAgents(result.agents || []);
      } else setAgents([]);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Retell settings unavailable."); }
  }, [businessId, retellAction]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setUser(data.user);
      setName(String(data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || ""));
      setAvatar(String(data.user?.user_metadata?.avatar_url || ""));
      setSessionStart(localStorage.getItem("twiga_session_started_at") || "");
    };
    void load();
    return () => { active = false; };
  }, [userId]);

  useEffect(() => { void loadGoogleStatus(); }, [loadGoogleStatus]);
  useEffect(() => { void loadRetell(); }, [loadRetell]);

  const saveProfile = async () => {
    if (!supabase) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
      if (error) throw error;
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setMessage("Profile saved.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Profile save failed."); }
    finally { setBusy(false); }
  };

  const uploadAvatar = async (file?: File) => {
    if (!file || !supabase || !user?.id) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { setMessage("Choose an image under 5 MB."); return; }
    setBusy(true);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = user.id + "/avatar." + ext;
      const { error } = await supabase.storage.from("twiga-profile-avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const url = supabase.storage.from("twiga-profile-avatars").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
      const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: url } });
      if (updateError) throw updateError;
      setAvatar(url);
      setMessage("Profile photo updated.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Photo upload failed."); }
    finally { setBusy(false); }
  };

  const connectGoogle = async () => {
    if (!businessId || !supabase) { setMessage("Create or select a business workspace first."); return; }
    setBusy(true);
    try {
      const cfg = await googleAction("oauth.config");
      if (!cfg.serverConfigured || !cfg.clientId) throw new Error("Google OAuth credentials are not fully configured in Supabase.");
      await loadGoogle();
      const googleSdk = (window as any).google;
      const codeClient = googleSdk.accounts.oauth2.initCodeClient({
        client_id: cfg.clientId,
        scope: (cfg.scopes || []).join(" "),
        ux_mode: "popup",
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: true,
        callback: async (result: any) => {
          if (result.error || !result.code) { setMessage(result.error_description || result.error || "Google permission was not completed."); setBusy(false); return; }
          try {
            const connected = await googleAction("connect", { authorizationCode: result.code, redirectUri: "postmessage" });
            if (!connected.connected) throw new Error(connected.message || "Google did not grant all requested permissions.");
            setMessage("Google connected: " + (connected.googleEmail || "account"));
            await loadGoogleStatus();
          } catch (e) { setMessage(e instanceof Error ? e.message : "Google connection failed."); }
          finally { setBusy(false); }
        },
        error_callback: (e: any) => { setMessage(e?.message || "Google permission window closed."); setBusy(false); },
      });
      codeClient.requestCode();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Google connection failed."); setBusy(false); }
  };

  const testGoogle = async (action: string) => {
    setBusy(true);
    try {
      const result = await googleAction(action);
      if (action === "calendar.list") setGoogleTest("Calendar: " + (result.items || []).length + " events returned.");
      else if (action === "contacts.list") setGoogleTest("Contacts: " + (result.connections || []).length + " contacts returned.");
      else if (action === "drive.list") setGoogleTest("Drive: " + (result.files || []).length + " files returned.");
      else setGoogleTest(result.spreadsheetUrl ? "Sheets ready: " + result.spreadsheetUrl : "Google Sheets responded.");
      if (result.spreadsheetUrl) setGoogle((g: any) => ({ ...g, spreadsheetUrl: result.spreadsheetUrl }));
    } catch (e) { setGoogleTest(e instanceof Error ? e.message : "Google test failed."); }
    finally { setBusy(false); }
  };

  const saveRetellKey = async () => {
    setBusy(true);
    try {
      const result = await retellAction("save_key", { apiKey: retellKey });
      setRetellKey("");
      setMessage(result.message || "Retell key securely saved.");
      await loadRetell();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Retell key could not be saved."); }
    finally { setBusy(false); }
  };

  const publishSelected = async () => {
    if (!agentId) { setMessage("Choose a Retell agent first."); return; }
    setBusy(true);
    try {
      await retellAction("save_settings", { provider: "retell", voiceId: "retell-Willa", model, ambientVolume: 0.08, inboundPrompt, outboundPrompt, recordingEnabled: false, recordingNotice: "This call may be recorded to help us serve you." });
      await retellAction("link_existing_agent", { agentId });
      const result = await retellAction("provision_agent");
      setMessage(result.message || "Business-specific Retell agent published.");
      await loadRetell();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Retell setup failed."); }
    finally { setBusy(false); }
  };

  const testVoice = async () => {
    if (!supabase || !businessId || !retell.config?.retell_agent_id) return;
    if (callSession.current) { await callSession.current.end(); callSession.current = null; setCallStatus("Ended"); return; }
    setCallStatus("Connecting…");
    const proxyFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const payload = init?.body ? JSON.parse(String(init.body)) : {};
      const stop = path.includes("/v3/stop-call/");
      const callId = stop ? path.split("/").pop() || "" : "";
      const { data, error } = await supabase!.functions.invoke("twiga-retell-webcall", { body: { ...payload, action: stop ? "stop" : "create", businessId, callId } });
      return new Response(JSON.stringify(error ? { error: error.message } : data || {}), { status: error ? 502 : 200, headers: { "Content-Type": "application/json" } });
    };
    try {
      const client = new RetellClient({ key: "twiga-session-proxy", baseURL: "https://api.retellai.com", fetch: proxyFetch as typeof fetch });
      callSession.current = client.createWebCall({
        agent_id: retell.config.retell_agent_id,
        hooks: {
          onStatus: (status: string) => setCallStatus(status),
          onEnd: () => { callSession.current = null; setCallStatus("Ended"); },
          onError: (error: any) => { callSession.current = null; setCallStatus(error?.message || "Call error"); },
        },
      });
    } catch (e) { setCallStatus(e instanceof Error ? e.message : "Could not start call."); callSession.current = null; }
  };

  const selected = agents.find((a) => a.agent_id === agentId);
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); };

  return <div className="space-y-6">
    <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">Account & connections</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950">Profile</h1>
      <p className="mt-2 text-sm leading-6 text-neutral-500">Your login, business workspaces, Google services and AI Front Desk connections.</p>
    </header>

    <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <label className="relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border bg-neutral-100 text-2xl font-bold text-neutral-500">
            {avatar ? <img src={avatar} alt="Profile" className="h-full w-full object-cover" /> : (name || user?.email || "T").slice(0, 1).toUpperCase()}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => uploadAvatar(e.target.files?.[0])} />
          </label>
          <div className="min-w-0"><h2 className="font-semibold text-neutral-950">{name || user?.email || "Your profile"}</h2><p className="truncate text-sm text-neutral-500">{user?.email}</p><p className="mt-1 text-xs text-neutral-400">Tap photo to upload · max 5 MB</p></div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your display name" className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 text-sm" /><button onClick={saveProfile} disabled={busy} className="h-11 rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white disabled:opacity-50">Save profile</button></div>
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-neutral-50 p-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Client ID</p><p className="mt-1 font-mono text-sm font-bold text-neutral-900">{clientId || "Loading…"}</p><p className="mt-1 text-xs text-neutral-500">Registration date plus your account reference.</p></div><button onClick={() => clientId && navigator.clipboard?.writeText(clientId)} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold">Copy ID</button></div>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-neutral-950">Login & security</h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-3 border-b pb-3"><span className="text-neutral-500">Sign-in method</span><strong>{user?.app_metadata?.provider || "Email"}</strong></div>
          <div className="flex justify-between gap-3 border-b pb-3"><span className="text-neutral-500">Session lifetime</span><strong>7 days</strong></div>
          <div className="flex justify-between gap-3 border-b pb-3"><span className="text-neutral-500">Session started</span><strong>{sessionStart ? new Date(Number(sessionStart)).toLocaleString() : "Current sign-in"}</strong></div>
          <p className="text-xs leading-5 text-neutral-500">This device is signed out after seven days. This is a client-side limit; the current Supabase plan does not provide server-enforced session timeboxing.</p>
          <button onClick={signOut} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Sign out of this device</button>
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-neutral-950">Business workspaces</h2><p className="mt-1 text-sm text-neutral-500">Each business has separate customers, appointments, products, AI instructions and call history.</p></div>{businesses.length > 0 && <select value={businessId || ""} onChange={(e) => onBusinessChange(e.target.value)} className="h-11 min-w-52 rounded-xl border px-3 text-sm"><option value="" disabled>Select workspace</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}</div>
      {current ? <p className="mt-3 text-xs text-neutral-500">{current.business_type || "Business"} · {current.role || "owner"} · {current.status || "TRIAL"}</p> : <p className="mt-3 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-600">No workspace yet. Open AI Setup to describe your business and create your first workspace.</p>}
      <button onClick={onRefreshBusinesses} className="mt-3 text-xs font-semibold underline">Refresh workspaces</button>
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-500">AI Front Desk</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">Google Workspace</h2><p className="mt-1 text-sm text-neutral-500">Calendar, Contacts, Sheets and Drive permissions are separate from Google sign-in.</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{google.connected ? "Connected" : "Not connected"}</span></div>
      {google.connected && <p className="mt-3 text-sm text-neutral-700">Connected as <strong>{google.googleEmail || "Google account"}</strong></p>}
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={connectGoogle} disabled={busy || !businessId} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{google.connected ? "Reconnect Google" : "Connect Google"}</button>{google.connected && <><button onClick={() => testGoogle("calendar.list")} disabled={busy} className="rounded-xl border px-3 py-2.5 text-sm">Test Calendar</button><button onClick={() => testGoogle("contacts.list")} disabled={busy} className="rounded-xl border px-3 py-2.5 text-sm">Test Contacts</button><button onClick={() => testGoogle("sheets.ensure")} disabled={busy} className="rounded-xl border px-3 py-2.5 text-sm">Create Sheets</button><button onClick={() => testGoogle("drive.list")} disabled={busy} className="rounded-xl border px-3 py-2.5 text-sm">Test Drive</button></>}</div>
      {google.spreadsheetUrl && <a href={google.spreadsheetUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-orange-700 underline">Open business spreadsheet</a>}
      {googleTest && <p className="mt-3 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">{googleTest}</p>}
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-500">Voice & receptionist</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">Retell AI</h2><p className="mt-1 text-sm text-neutral-500">Each business can connect its own Retell account. API keys are stored in Supabase Vault.</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{retell.keyConfigured ? "Key saved · •••• " + (retell.keyLast4 || "") : "Not connected"}</span></div>
      {!retell.keyConfigured ? <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="off" value={retellKey} onChange={(e) => setRetellKey(e.target.value)} placeholder="Retell API key for this business" className="h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm" /><button onClick={saveRetellKey} disabled={busy || retellKey.length < 20 || !businessId} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Connect Retell</button></div> : <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Retell model</label><select value={model} onChange={(e) => setModel(e.target.value)} className="h-11 w-full rounded-xl border px-3 text-sm"><option value="gpt-6-luna">Retell GPT 6 Luna</option><option value="gpt-5.6-luna">Retell GPT 5.6 Luna</option></select></div><div><label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Choose a voice agent</label><select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="h-11 w-full rounded-xl border px-3 text-sm"><option value="">Select agent from Retell…</option>{agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name} · {a.agent_id.slice(0, 10)}</option>)}</select></div></div>
        <div className="mt-4 rounded-xl bg-neutral-50 p-4"><p className="text-sm font-semibold">10 voice candidates</p><p className="mt-1 text-xs text-neutral-500">The test agents will appear above if you connected the same Retell account. Five female and five male British-style candidates are listed here for comparison.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{voiceNotes.map((v) => <div key={v[2]} className="rounded-lg border bg-white px-3 py-2"><p className="text-xs font-semibold">{v[0]}</p><p className="text-[11px] text-neutral-500">{v[1]} · {v[2]}</p></div>)}</div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Inbound instructions</label><textarea rows={3} value={inboundPrompt} onChange={(e) => setInboundPrompt(e.target.value)} className="w-full rounded-xl border p-3 text-sm" /></div><div><label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Outbound instructions</label><textarea rows={3} value={outboundPrompt} onChange={(e) => setOutboundPrompt(e.target.value)} className="w-full rounded-xl border p-3 text-sm" /></div></div>
        <div className="mt-4 flex flex-wrap gap-2"><button onClick={async () => { setBusy(true); try { const result = await retellAction("list_agents"); setAgents(result.agents || []); setMessage((result.agents || []).length + " Retell agents found."); } catch (e) { setMessage(e instanceof Error ? e.message : "Agent list failed."); } finally { setBusy(false); } }} disabled={busy} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Refresh agents</button><button onClick={publishSelected} disabled={busy || !agentId} className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Use voice & publish receptionist</button>{retell.config?.retell_agent_id && <button onClick={testVoice} disabled={busy} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">{callStatus === "live" || callStatus === "connecting" ? "End test call" : "Test voice in browser"}</button>}</div>
        <p className="mt-2 text-xs text-neutral-500">Browser call: {callStatus}. Microphone access is requested only when you start the test.</p>
      </>}
    </section>
    {message && <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">{message}</p>}
  </div>;
}
