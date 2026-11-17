import { useCallback, useEffect, useRef, useState } from "react";
import { RetellWebClient } from "retell-client-js-sdk";
import { supabase } from "@/lib/supabase";

type Business = { id: string; name: string; business_type?: string; status?: string; role?: string };


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

export default function Profile({ userId, businessId, businesses, onBusinessChange, onRefreshBusinesses, onCreateBusiness, onOpenPhone }: {
  userId?: string; businessId?: string; businesses: Business[];
  onBusinessChange: (id: string) => void; onRefreshBusinesses: () => Promise<void>; onCreateBusiness: () => void; onOpenPhone?: () => void;
}) {
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [avatar, setAvatar] = useState("");
  const [sessionStart, setSessionStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [google, setGoogle] = useState<any>({ connected: false });
  const [googleTest, setGoogleTest] = useState("");
  const [retell, setRetell] = useState<any>({});
  const [selectedVoice, setSelectedVoice] = useState("cartesia-Willa");
  const [voiceOptions, setVoiceOptions] = useState<any[]>([]);
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [recordingNotice, setRecordingNotice] = useState("This call may be recorded to help us serve you.");
  const [retellKey, setRetellKey] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [callStatus, setCallStatus] = useState("Not started");
  const [palKey, setPalKey] = useState("");
  const [palStatus, setPalStatus] = useState<any>({ keyConfigured: false });
  const [palPhone, setPalPhone] = useState("");
  const [palAmount, setPalAmount] = useState("");
  const [palResult, setPalResult] = useState("");
  const [xaiConfig, setXaiConfig] = useState<any>({ isAdmin: false });
  const [xaiKey, setXaiKey] = useState("");
  const [xaiMessage, setXaiMessage] = useState("");
  const [googleOAuthConfig, setGoogleOAuthConfig] = useState<any>({ clientIdConfigured: false, clientSecretConfigured: false, encryptionReady: false });
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleOAuthMessage, setGoogleOAuthMessage] = useState("");
  const [retellPlatformConfig, setRetellPlatformConfig] = useState<any>({ keyConfigured: false });
  const [retellPlatformKey, setRetellPlatformKey] = useState("");
  const [retellPlatformMessage, setRetellPlatformMessage] = useState("");
  const [palPlatformConfig, setPalPlatformConfig] = useState<any>({ keyConfigured: false });
  const [palPlatformKey, setPalPlatformKey] = useState("");
  const [palPlatformMessage, setPalPlatformMessage] = useState("");
  const [inboundPrompt, setInboundPrompt] = useState("Greet callers warmly, understand what they need, and use only verified business information. Capture appointment and order requests for staff confirmation.");
  const [outboundPrompt, setOutboundPrompt] = useState("Only call people when the business has authorised the follow-up. Identify the business, explain the reason, ask if it is a convenient time, and respect requests not to be contacted.");
  const callSession = useRef<any>(null);

  const current = businesses.find((b) => b.id === businessId);
  const clientId = user?.id ? "TWG-" + String(user.created_at || "").slice(0, 10).replaceAll("-", "") + "-" + String(user.id).replaceAll("-", "").slice(0, 8).toUpperCase() : "";

  const googleAction = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!supabase || !businessId) throw new Error("Create or select a business workspace first.");
    const { data, error } = await supabase.functions.invoke("google-workspace", { body: { action, businessId, ...extra } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, [businessId]);

  const palAction = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!supabase || !businessId) throw new Error("Create or select a business workspace first.");
    const { data, error } = await supabase.functions.invoke("twiga-palpluss", { body: { action, businessId, ...extra } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, [businessId]);

  const loadPal = useCallback(async () => {
    if (!businessId) return;
    try { setPalStatus(await palAction("get_config")); } catch (e) { setPalResult(e instanceof Error ? e.message : "PalPluss status unavailable."); }
  }, [businessId, palAction]);

  const retellAction = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!supabase || !businessId) throw new Error("Create or select a business workspace first.");
    const { data, error } = await supabase.functions.invoke("twiga-retell", { body: { action, businessId, ...extra } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, [businessId]);

  const loadXaiConfig = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.functions.invoke("twiga-platform-secrets", { body: { action: "get_config" } });
    if (!error && data?.isAdmin) {
      setXaiConfig(data);
      const { data: googleData, error: googleError } = await supabase.functions.invoke("twiga-platform-secrets", { body: { action: "google.oauth.status" } });
      if (!googleError && googleData?.isAdmin) {
        setGoogleOAuthConfig(googleData);
        setGoogleClientId(String(googleData.clientId || ""));
      }
      const { data: retellPlatformData, error: retellPlatformError } = await supabase.functions.invoke("twiga-platform-secrets", { body: { action: "retell.platform.status" } });
      if (!retellPlatformError && retellPlatformData?.isAdmin) setRetellPlatformConfig(retellPlatformData);
      const { data: palPlatformData, error: palPlatformError } = await supabase.functions.invoke("twiga-platform-secrets", { body: { action: "palpluss.platform.status" } });
      if (!palPlatformError && palPlatformData?.isAdmin) setPalPlatformConfig(palPlatformData);
    }
  }, []);

  const saveRetellPlatformKey = async () => {
    if (!supabase || retellPlatformKey.trim().length < 20) return;
    setBusy(true);
    setRetellPlatformMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-platform-secrets", { body: { action: "retell.platform.save", apiKey: retellPlatformKey.trim() } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setRetellPlatformKey("");
      setRetellPlatformConfig((current: any) => ({ ...current, ...data, keyConfigured: true }));
      setRetellPlatformMessage(data.message || "Retell platform key saved.");
      await loadRetell();
    } catch (e) {
      setRetellPlatformMessage(e instanceof Error ? e.message : "Retell platform key could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const savePalPlussPlatformKey = async () => {
    if (!supabase || palPlatformKey.trim().length < 20) return;
    setBusy(true); setPalPlatformMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-platform-secrets", { body: { action: "palpluss.platform.save", apiKey: palPlatformKey.trim() } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setPalPlatformKey("");
      setPalPlatformConfig((current: any) => ({ ...current, ...data, keyConfigured: true }));
      setPalPlatformMessage(data.message || "Central PalPluss account connected.");
      await loadPal();
    } catch (error) {
      setPalPlatformMessage(error instanceof Error ? error.message : "Could not save the central PalPluss key.");
    } finally { setBusy(false); }
  };

  const saveGoogleOAuth = async () => {
    if (!supabase) return;
    setBusy(true);
    setGoogleOAuthMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-platform-secrets", { body: { action: "google.oauth.save", clientId: googleClientId.trim(), clientSecret: googleClientSecret } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setGoogleClientSecret("");
      setGoogleOAuthConfig((current: any) => ({ ...current, ...data, clientId: googleClientId.trim(), clientIdConfigured: true, clientSecretConfigured: true }));
      setGoogleOAuthMessage(data.message || "Google OAuth credentials saved.");
    } catch (e) {
      setGoogleOAuthMessage(e instanceof Error ? e.message : "Google OAuth credentials could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const loadGoogleStatus = useCallback(async () => {
    if (!businessId) return;
    try { setGoogle(await googleAction("status")); } catch (e) { setMessage(e instanceof Error ? e.message : "Google status unavailable."); }
  }, [businessId, googleAction]);

  const loadRetell = useCallback(async () => {
    if (!businessId) return;
    try {
      const data = await retellAction("get_config");
      setRetell(data);
      const savedVoice = String(data.config?.retell_voice_id || "");
      if (data.keyConfigured) {
        const catalogue = await retellAction("list_voices");
        const voices = Array.isArray(catalogue.voices) ? catalogue.voices : [];
        setVoiceOptions(voices);
        const savedExists = voices.some((voice: any) => voice.voiceId === savedVoice);
        const preferred = voices.find((voice: any) => voice.gender === "female" && /british|african|kenyan|south african/i.test(voice.accent || ""));
        setSelectedVoice(savedExists ? savedVoice : String(preferred?.voiceId || voices[0]?.voiceId || ""));
      } else {
        setVoiceOptions([]);
        setSelectedVoice(savedVoice || "cartesia-Willa");
      }
      if (data.config?.retell_model) setModel(data.config.retell_model);
      setRecordingEnabled(data.recordingEnabled === true);
      setRecordingNotice(data.recordingNotice || "This call may be recorded to help us serve you.");
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
      setAvatar(String(data.user?.user_metadata?.avatar_url || data.user?.user_metadata?.picture || data.user?.user_metadata?.photo_url || ""));
      setSessionStart(localStorage.getItem("twiga_session_started_at") || "");
    };
    void load();
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!supabase || !businessId) {
      setOwnerName(name);
      setOwnerEmail(String(user?.email || ""));
      return;
    }
    let active = true;
    void supabase.from("twiga_business_profiles").select("owner_name,owner_email").eq("business_id", businessId).maybeSingle().then(({ data, error }) => {
      if (!active || error) return;
      setOwnerName(String(data?.owner_name || name || ""));
      setOwnerEmail(String(data?.owner_email || user?.email || ""));
    });
    return () => { active = false; };
  }, [businessId, user?.email, name]);

  const saveOwnerProfile = async () => {
    if (!supabase || !businessId || !ownerName.trim() || !ownerEmail.trim()) {
      setMessage("Choose a business and enter the owner's name and contact email.");
      return;
    }
    setOwnerSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("twiga-business-workspaces", { body: { action: "update_owner_profile", businessId, ownerName: ownerName.trim(), ownerEmail: ownerEmail.trim() } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      const { error: profileError } = await supabase.auth.updateUser({ data: { full_name: ownerName.trim() } });
      if (profileError) throw profileError;
      setName(ownerName.trim());
      setMessage("AI Front Desk owner profile saved for this business.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Owner profile could not be saved.");
    } finally {
      setOwnerSaving(false);
    }
  };

  useEffect(() => { void loadGoogleStatus(); }, [loadGoogleStatus]);
  useEffect(() => { void loadXaiConfig(); }, [loadXaiConfig]);
  useEffect(() => { void loadPal(); }, [loadPal]);

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
    if (!selectedVoice) { setMessage("Choose a receptionist voice first."); return; }
    setBusy(true);
    try {
      await retellAction("save_settings", { provider: "retell", voiceId: selectedVoice, voiceModel: null, model, ambientVolume: 0.08, inboundPrompt, outboundPrompt, recordingEnabled, recordingNotice });
      const result = await retellAction("provision_agent");
      const { data: style, error: styleError } = await supabase!.functions.invoke("twiga-retell-voice-style", { body: { businessId } });
      if (styleError) throw new Error(styleError.message);
      if (style?.error) throw new Error(String(style.error));
      setMessage(style?.message || result.message || "The selected receptionist voice was published for this business.");
      await loadRetell();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Retell setup failed."); }
    finally { setBusy(false); }
  };

  const testVoice = async () => {
    if (!supabase || !businessId || !retell.config?.retell_agent_id) return;
    if (callSession.current) {
      try { callSession.current.stopCall(); } catch {}
      callSession.current = null;
      setCallStatus("Ended");
      return;
    }
    setCallStatus("Connecting…");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-retell-webcall", { body: { action: "create", businessId } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      const client = new RetellWebClient();
      client.on("call_started", () => setCallStatus("Live"));
      client.on("call_ended", () => { callSession.current = null; setCallStatus("Ended"); });
      client.on("error", (error: any) => { callSession.current = null; setCallStatus(error?.message || "Call error"); });
      callSession.current = client;
      await client.startCall({ accessToken: data.access_token });
    } catch (e) {
      callSession.current = null;
      setCallStatus(e instanceof Error ? e.message : "Could not start browser call.");
    }
  };

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

    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-orange-500">Payments</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">Payments are managed by TWIGA</h2><p className="mt-2 text-sm leading-6 text-neutral-600">Your payment provider connection is managed centrally. Add your business Till or Paybill and choose customer payment options in the Payments section. You do not need a separate provider login or API key.</p></section>


    {xaiConfig.isAdmin && <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-500">Platform administrator</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">Grok business setup helper</h2><p className="mt-1 text-sm text-neutral-500">One shared Grok API key powers account onboarding only. It is not sent to Retell or exposed to customers. <a className="ml-1 inline-flex font-semibold text-orange-700 underline" href="https://console.x.ai/" target="_blank" rel="noreferrer">Get an xAI API key</a></p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{xaiConfig.keyConfigured ? "Key saved · •••• " + xaiConfig.keyLast4 : "Key not configured"}</span></div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="off" value={xaiKey} onChange={(e) => setXaiKey(e.target.value)} placeholder={xaiConfig.keyConfigured ? "Enter rotated xAI API key to replace current key" : "xAI API key"} className="h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm" /><button onClick={async () => { setBusy(true); setXaiMessage(""); try { const { data, error } = await supabase!.functions.invoke("twiga-platform-secrets", { body: { action: "save_xai_key", apiKey: xaiKey } }); if (error) throw new Error(error.message); if (data?.error) throw new Error(data.error); setXaiKey(""); setXaiConfig(data); setXaiMessage(data.message || "Grok key saved."); } catch (e) { setXaiMessage(e instanceof Error ? e.message : "Grok key could not be saved."); } finally { setBusy(false); } }} disabled={busy || xaiKey.length < 20} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Validate & save Grok key</button></div>
      {xaiConfig.keyConfigured && <p className="mt-3 text-sm text-neutral-600">Grok key is stored in encrypted Vault (•••• {xaiConfig.keyLast4}). Enter a newly rotated key above to replace it.</p>}
      {xaiMessage && <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">{xaiMessage}</p>}
    </section>}
    {xaiConfig.isAdmin && <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-500">Platform administrator</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">Legacy Retell browser-call connection</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">This is a legacy browser-call test provider. It is not the assigned TWIGA phone-line provider. Actual TWIGA PSTN inbound and outbound calls use TWIGA voice service, as shown under Phone & AI. Keep this Retell connection separate from the business phone number. <a className="ml-1 inline-flex font-semibold text-orange-700 underline" href="https://dashboard.retellai.com/" target="_blank" rel="noreferrer">Open Retell dashboard</a></p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{retellPlatformConfig.keyConfigured ? "Connected" : "Needs API key"}</span></div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="new-password" value={retellPlatformKey} onChange={(e) => setRetellPlatformKey(e.target.value)} placeholder={retellPlatformConfig.keyConfigured ? "Enter a rotated Retell API key to replace it" : "Retell API key from your connected workspace"} className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 text-sm" /><button onClick={saveRetellPlatformKey} disabled={busy || retellPlatformKey.trim().length < 20} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Validate & save Retell key</button></div>
      {retellPlatformConfig.keyConfigured && <p className="mt-2 text-xs text-neutral-500">Stored in encrypted Vault · •••• {retellPlatformConfig.keyLast4}</p>}
      {retellPlatformMessage && <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">{retellPlatformMessage}</p>}
    </section>}
    {xaiConfig.isAdmin && <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-500">Platform administrator</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">Central PalPluss collections</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">Connect one TWIGA PalPluss account here. Each business then registers its own Safaricom Buy Goods Till or Paybill, and payment prompts route to that business's shortcode.</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{palPlatformConfig.keyConfigured ? "Connected · •••• " + palPlatformConfig.keyLast4 : "Needs API key"}</span></div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="new-password" value={palPlatformKey} onChange={(e) => setPalPlatformKey(e.target.value)} placeholder={palPlatformConfig.keyConfigured ? "Enter rotated PalPluss key to replace it" : "PalPluss platform API key"} className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 text-sm" /><button onClick={savePalPlussPlatformKey} disabled={busy || palPlatformKey.trim().length < 20} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Validate & save PalPluss</button></div>
      <p className="mt-2 text-xs text-neutral-500">The central key is stored in encrypted Supabase Vault. It is never sent to the browser's payment requests.</p>
      {palPlatformMessage && <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">{palPlatformMessage}</p>}
    </section>}
    {xaiConfig.isAdmin && <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-500">Platform administrator</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">Google Workspace OAuth</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">These are TWIGA's shared OAuth application credentials. Each business owner still authorizes their own Calendar, Contacts, Drive and Sheets account separately. <a className="ml-1 inline-flex font-semibold text-orange-700 underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Open Google Cloud OAuth credentials</a></p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{googleOAuthConfig.clientIdConfigured && googleOAuthConfig.clientSecretConfigured && googleOAuthConfig.encryptionReady ? "Server ready" : "Needs credentials"}</span></div>
      <div className="mt-4 grid gap-3">
        <label className="block text-xs font-semibold uppercase text-neutral-500">Google OAuth web client ID<input value={googleClientId} onChange={(e) => setGoogleClientId(e.target.value)} autoComplete="off" placeholder="xxxx.apps.googleusercontent.com" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm font-normal normal-case" /></label>
        <label className="block text-xs font-semibold uppercase text-neutral-500">New Google OAuth client secret<input type="password" value={googleClientSecret} onChange={(e) => setGoogleClientSecret(e.target.value)} autoComplete="new-password" placeholder="Paste the newly rotated Google OAuth client secret" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm font-normal normal-case" /></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-neutral-500">Encryption key: {googleOAuthConfig.encryptionReady ? "ready" : "not configured"} · Client ID: {googleOAuthConfig.clientIdConfigured ? "saved" : "missing"} · Client secret: {googleOAuthConfig.clientSecretConfigured ? "saved" : "missing"}</p><button onClick={saveGoogleOAuth} disabled={busy || googleClientId.length < 40 || googleClientSecret.length < 20} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Save Google OAuth credentials</button></div>
      {googleOAuthMessage && <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">{googleOAuthMessage}</p>}
    </section>}
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-500">Google Workspace</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">Connect your Google account</h2><p className="mt-1 text-sm text-neutral-500">One secure button connects the services you approve. TWIGA handles the technical setup.</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{google.connected ? "Connected" : "Not connected"}</span></div>
      {google.connected && <p className="mt-3 text-sm text-neutral-700">Connected as <strong>{google.googleEmail || "Google account"}</strong></p>}
      <div className="mt-4"><button onClick={connectGoogle} disabled={busy || !businessId} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Please wait…" : google.connected ? "Review Google access" : "Connect Google"}</button></div>
      {googleTest && <p className="mt-3 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">{googleTest}</p>}
    </section>


    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-orange-500">Payments</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">Payments are managed by TWIGA</h2><p className="mt-2 text-sm leading-6 text-neutral-600">Your payment provider connection is managed centrally. Add your business Till or Paybill and choose customer payment options in Payments. You do not need a separate provider login or API key.</p>


    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-orange-500">AI Front Desk profile</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">Business owner details</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">These details appear in your workspace and are saved separately for the selected business. Your sign-in email is not changed.</p></div>
        {avatar && <img src={avatar} alt="Owner profile" className="h-12 w-12 rounded-xl object-cover" />}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold uppercase text-neutral-500">Owner full name<input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoComplete="name" placeholder="Business owner's full name" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm font-normal normal-case" /></label>
        <label className="block text-xs font-semibold uppercase text-neutral-500">Business contact email<input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} autoComplete="email" placeholder="owner@business.co.ke" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm font-normal normal-case" /></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-neutral-500">Used for the business profile and AI receptionist setup context.</p><button onClick={saveOwnerProfile} disabled={ownerSaving || !businessId || !ownerName.trim() || !ownerEmail.trim()} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{ownerSaving ? "Saving…" : "Save owner profile"}</button></div>
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-500">Voice & receptionist</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">TWIGA AI receptionist</h2><p className="mt-1 text-sm leading-6 text-neutral-500">The live receptionist, preferred Woman voice, male voice options, inbound instructions, outbound calls and scheduled callbacks are managed together in Phone & AI. Provider keys are managed securely in Connections.</p></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">TWIGA voice service</span></div>
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={onOpenPhone} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white">Open Phone & AI</button></div>
    </section>
    {message && <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">{message}</p>}
  </div>;
}
