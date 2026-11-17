import { useEffect, useRef, useState } from "react";
import { RetellWebClient } from "retell-client-js-sdk";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useStore, type Settings as SettingsType } from "@/lib/store";
import {
  IconGear,
  IconCoin,
  IconCalendar,
  IconClock,
  IconSparkle,
  IconMic,
  IconChat,
  IconPhone,
  IconSwap,
  IconBell,
  IconFile,
  IconCheck,
  IconBulb,
  IconUsers,
} from "@/components/Icons";

type Tab = "basic" | "advanced";

export default function Settings({ businessId, demo = false, onOpenProfile }: { businessId?: string; demo?: boolean; onOpenProfile: () => void }) {
  const { settings, updateSettings } = useStore();
  const [retellAgentId, setRetellAgentId] = useState("");
  const [callStatus, setCallStatus] = useState("Not started");
  const [callBusy, setCallBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState("");
  const callSession = useRef<any>(null);
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageFiles, setStorageFiles] = useState<any[]>([]);
  const [storageBusy, setStorageBusy] = useState(false);
  const [storageError, setStorageError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const filesApi = String(import.meta.env.VITE_TWIGA_FILES_API_URL || "https://twiga-business-files.twiga-ke.workers.dev").replace(/\/$/, "");
  const [tab, setTab] = useState<Tab>("basic");
  const [saved, setSaved] = useState(false);

  const patch = (group: keyof SettingsType, values: Record<string, unknown>) => {
    updateSettings({ [group]: { ...settings[group], ...values } } as Partial<SettingsType>);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const getAccessToken = async () => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Please sign in again.");
    return data.session.access_token;
  };

  const refreshStorage = async () => {
    if (!businessId || demo || !supabase) return;
    setStorageBusy(true);
    setStorageError("");
    try {
      const token = await getAccessToken();
      const response = await fetch(filesApi + "/v1/files/" + encodeURIComponent(businessId), { headers: { Authorization: "Bearer " + token } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Business file storage could not be loaded.");
      setStorageFiles(Array.isArray(data.files) ? data.files : []);
      setStorageUsed(Number(data.usedBytes || 0));
    } catch (e) {
      setStorageError(e instanceof Error ? e.message : "Business file storage could not be loaded.");
    } finally {
      setStorageBusy(false);
    }
  };

  useEffect(() => {
    if (!businessId || demo || !supabase) { setRetellAgentId(""); return; }
    let active = true;
    void supabase.from("twiga_business_voice_configs").select("retell_agent_id").eq("business_id", businessId).maybeSingle().then(({ data }) => {
      if (active) setRetellAgentId(String(data?.retell_agent_id || ""));
    });
    return () => { active = false; };
  }, [businessId, demo]);

  useEffect(() => {
    void refreshStorage();
  }, [businessId, demo]);

  const testApiConnections = async () => {
    if (demo) { setApiStatus("Sign in to test live API connections."); return; }
    if (!supabase || !businessId) { setApiStatus("Select a live business workspace first."); return; }
    setApiStatus("Testing Supabase, Cloudflare and SautiKit…");
    try {
      await getAccessToken();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Supabase authentication check failed.");
      const { data: membership, error: membershipError } = await supabase.from("business_members").select("business_id").eq("business_id", businessId).eq("user_id", userData.user.id).maybeSingle();
      if (membershipError || !membership) throw new Error("Supabase business access check failed.");
      const response = await fetch(filesApi + "/health");
      const health = await response.json().catch(() => ({}));
      if (!response.ok || health.ok !== true) throw new Error("Cloudflare file API health check failed.");
      const { data: voiceConfig, error: voiceError } = await supabase.functions.invoke("twiga-sautikit", { body: { action: "get_config", businessId } });
      if (voiceError) throw new Error("SautiKit configuration check failed: " + voiceError.message);
      if (voiceConfig?.error) throw new Error(String(voiceConfig.error));
      if (!voiceConfig?.keyConfigured) { setApiStatus("Supabase authentication and business access: OK · Cloudflare storage API: OK · SautiKit API key still needs to be saved in Connections."); return; }
      if (!voiceConfig?.phoneLine) { setApiStatus("Supabase: OK · Cloudflare storage: OK · SautiKit key: OK · This business still needs an assigned AI phone line."); return; }
      const inbound = voiceConfig.inboundVerified ? "provider route confirmed; physical call test pending" : "inbound route needs attention";
      setApiStatus("Supabase: OK · Cloudflare storage: OK · SautiKit key: OK · AI line " + (voiceConfig.phoneLine.line_number || "assigned") + " · inbound " + inbound + " · outbound " + (voiceConfig.phoneLine.outbound_status || "unknown"));
    } catch (e) { setApiStatus(e instanceof Error ? e.message : "API connection test failed."); }
  };

  const testReceptionist = async () => {
    if (callSession.current) {
      try { callSession.current.stopCall(); } catch {}
      callSession.current = null;
      setCallStatus("Ended");
      return;
    }
    if (!supabase || !businessId || !retellAgentId || demo) return;
    setCallBusy(true);
    setCallStatus("Connecting…");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-retell-webcall", { body: { action: "create", businessId } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      if (!data?.access_token) throw new Error("Retell did not return a browser call token.");
      const client = new RetellWebClient();
      client.on("call_started", () => setCallStatus("Live"));
      client.on("call_ended", () => { callSession.current = null; setCallStatus("Ended"); });
      client.on("error", (error: any) => { callSession.current = null; setCallStatus(error?.message || "Call error"); });
      callSession.current = client;
      await client.startCall({ accessToken: data.access_token });
    } catch (e) {
      callSession.current = null;
      setCallStatus(e instanceof Error ? e.message : "Could not start the browser call.");
    } finally {
      setCallBusy(false);
    }
  };

  const uploadBusinessFile = async (file?: File) => {
    if (!file || !businessId || demo || !supabase) return;
    setStorageBusy(true);
    setStorageError("");
    try {
      const token = await getAccessToken();
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(filesApi + "/v1/files/" + encodeURIComponent(businessId), { method: "POST", headers: { Authorization: "Bearer " + token }, body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "File upload failed.");
      await refreshStorage();
    } catch (e) {
      setStorageError(e instanceof Error ? e.message : "File upload failed.");
    } finally {
      setStorageBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const downloadBusinessFile = async (file: any) => {
    if (!businessId || !supabase) return;
    try {
      const token = await getAccessToken();
      const response = await fetch(filesApi + "/v1/files/" + encodeURIComponent(businessId) + "/" + encodeURIComponent(file.file_id), { headers: { Authorization: "Bearer " + token } });
      if (!response.ok) throw new Error("File download failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = String(file.name || "business-file");
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setStorageError(e instanceof Error ? e.message : "File download failed.");
    }
  };

  const deleteBusinessFile = async (fileId: string) => {
    if (!businessId || !supabase) return;
    setStorageBusy(true);
    setStorageError("");
    try {
      const token = await getAccessToken();
      const response = await fetch(filesApi + "/v1/files/" + encodeURIComponent(businessId) + "/" + encodeURIComponent(fileId), { method: "DELETE", headers: { Authorization: "Bearer " + token } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "File could not be deleted.");
      await refreshStorage();
    } catch (e) {
      setStorageError(e instanceof Error ? e.message : "File could not be deleted.");
    } finally {
      setStorageBusy(false);
    }
  };

  const formatBytes = (bytes: number) => bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + " MB" : (bytes / 1024).toFixed(0) + " KB";

  const b = settings.business;
  const p = settings.persona;
  const r = settings.routing;
  const s = settings.scheduling;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
            Configuration
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            Settings
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Tune how your AI receptionist runs the front desk
          </p>\n          <p className="mt-3 max-w-3xl text-xs leading-5 text-neutral-500">Live SautiKit voice, model and receptionist instructions are configured in Phone & AI. The settings below are saved as workspace defaults; they do not silently change a published voice.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-600">
              <IconCheck className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-1">
            <TabButton active={tab === "basic"} onClick={() => setTab("basic")}>
              Basic Setup
            </TabButton>
            <TabButton active={tab === "advanced"} onClick={() => setTab("advanced")}>
              Advanced
            </TabButton>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-500">SautiKit phone controls</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">Voice, inbound & scheduled calls</h2><p className="mt-1 text-sm leading-6 text-neutral-500">Manage the proven female voice, choose provider-listed male voices, edit receptionist instructions, test a real phone call and schedule customer callbacks in Phone & AI.</p></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">SautiKit</span></div>
          <div className="mt-4 flex flex-wrap items-center gap-2"><button onClick={onOpenProfile} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white">Open Phone & AI</button><button onClick={testApiConnections} disabled={callBusy} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700">Test API connections</button>{apiStatus && <span className="text-xs text-neutral-500">{apiStatus}</span>}</div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-500">Cloudflare R2 + D1</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">Business file storage</h2><p className="mt-1 text-sm leading-6 text-neutral-500">Private files are stored under this business only. The allowance is 500 MB per business.</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{demo ? "Sample" : formatBytes(storageUsed) + " / 500 MB"}</span></div>
          {!demo && <><div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: Math.min(100, storageUsed / (500 * 1024 * 1024) * 100) + "%" }} /></div>
          <div className="mt-4 flex flex-wrap items-center gap-2"><input ref={fileInput} type="file" accept="image/*,.pdf,.csv,.txt,.docx,.xlsx,.pptx" onChange={(e) => void uploadBusinessFile(e.target.files?.[0])} className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-xs file:font-semibold" /><span className="text-xs text-neutral-500">25 MB max per file</span></div>
          <div className="mt-4 space-y-2">{storageFiles.length ? storageFiles.map((file) => <div key={file.file_id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2"><button onClick={() => void downloadBusinessFile(file)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium text-neutral-800">{file.name}</span><span className="text-xs text-neutral-500">{formatBytes(Number(file.size_bytes || 0))} · {file.content_type}</span></button><button onClick={() => void deleteBusinessFile(file.file_id)} disabled={storageBusy} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">Delete</button></div>) : <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-500">{storageBusy ? "Loading business files…" : "No files uploaded for this business yet."}</p>}</div></>}
          {storageError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{storageError}</p>}
          {demo && <p className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">Sign in to upload private files to your business workspace.</p>}
        </section>
      </div>

      {tab === "basic" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section icon={IconCoin} title="Business & Localization" desc="Currency, time and how the AI reads dates">
            <Field label="Business name">
              <Input value={b.name} onChange={(e) => patch("business", { name: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <Select value={b.currency} onValueChange={(v) => patch("business", { currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["KSh", "USD", "EUR", "GBP", "ZAR"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Date format">
                <Select value={b.dateFormat} onValueChange={(v) => patch("business", { dateFormat: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Time zone">
              <Select value={b.timezone} onValueChange={(v) => patch("business", { timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Africa/Nairobi (GMT+3)", "Africa/Lagos (GMT+1)", "Europe/London (GMT+0)", "America/New_York (GMT-5)"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </Section>

          <Section icon={IconClock} title="Business Hours & Holidays" desc="When the AI says you are open or closed">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Opens at">
                <Input type="time" value={b.openTime} onChange={(e) => patch("business", { openTime: e.target.value })} />
              </Field>
              <Field label="Closes at">
                <Input type="time" value={b.closeTime} onChange={(e) => patch("business", { closeTime: e.target.value })} />
              </Field>
            </div>
            <ToggleRow
              label="Holiday override"
              desc="Use special hours on public holidays"
              checked={b.holidayOverride}
              onChange={(v) => patch("business", { holidayOverride: v })}
            />
          </Section>

          <Section icon={IconFile} title="Business Profile & Knowledge Base" desc="Facts the AI uses to answer without guessing">
            <Field label="Address">
              <Input value={b.address} onChange={(e) => patch("business", { address: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Parking info">
                <Input value={b.parking} onChange={(e) => patch("business", { parking: e.target.value })} />
              </Field>
              <Field label="Website">
                <Input value={b.website} onChange={(e) => patch("business", { website: e.target.value })} />
              </Field>
            </div>
            <Field label="FAQs">
              <Textarea rows={3} value={b.faqs} onChange={(e) => patch("business", { faqs: e.target.value })} />
            </Field>
          </Section>

          <Section icon={IconMic} title="SautiKit voice & call settings" desc="Manage the published phone receptionist in Phone & AI">
            <p className="text-sm leading-6 text-neutral-600">Choose from the live SautiKit catalogue, including the preferred Woman voice and available male options. Publish greetings and inbound/outbound instructions, test a real phone call, and schedule consent-based callbacks from Phone & AI.</p>
            <button onClick={onOpenProfile} className="mt-3 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white">Open Phone & AI</button>
          </Section>

          <Section icon={IconChat} title="Greeting & Closing Scripts" desc="The first and last thing callers hear">
            <Field label="Greeting">
              <Textarea rows={2} value={p.greeting} onChange={(e) => patch("persona", { greeting: e.target.value })} />
            </Field>
            <Field label="Closing">
              <Textarea rows={2} value={p.closing} onChange={(e) => patch("persona", { closing: e.target.value })} />
            </Field>
          </Section>

          <Section icon={IconSparkle} title="Tone & Personality" desc="Adjust how the AI comes across">
            <div className="flex flex-wrap gap-2">
              {["Formal", "Friendly", "Concise", "Empathetic"].map((t) => (
                <button
                  key={t}
                  onClick={() => patch("persona", { tone: t })}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                    p.tone === t
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary language">
                <Select value={p.primaryLang} onValueChange={(v) => patch("persona", { primaryLang: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["English", "Swahili", "French", "Arabic"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Fallback language">
                <Select value={p.fallbackLang} onValueChange={(v) => patch("persona", { fallbackLang: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Swahili", "English", "French", "None"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section icon={IconCalendar} title="Calendar Sync & Booking Rules" desc="Where bookings land and how they are spaced" className="lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Calendar provider">
                <Select value={s.calendar} onValueChange={(v) => patch("scheduling", { calendar: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Google Calendar", "Outlook", "Calendly", "None"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={`Buffer — ${s.bufferMinutes} min`}>
                <Slider value={[s.bufferMinutes]} min={0} max={60} step={5} onValueChange={([v]) => patch("scheduling", { bufferMinutes: v })} />
              </Field>
              <Field label={`Min notice — ${s.minNotice} hrs`}>
                <Slider value={[s.minNotice]} min={0} max={48} step={1} onValueChange={([v]) => patch("scheduling", { minNotice: v })} />
              </Field>
            </div>
            <Field label="Cancellation policy">
              <Input value={s.cancellationPolicy} onChange={(e) => patch("scheduling", { cancellationPolicy: e.target.value })} />
            </Field>
          </Section>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section icon={IconPhone} title="Call Forwarding & Escalation" desc="When the AI hands a call to a human">
            <ToggleRow label="Caller sounds angry" desc="Detect frustration and transfer" checked={r.forwardOnAngry} onChange={(v) => patch("routing", { forwardOnAngry: v })} />
            <ToggleRow label="Asks for a manager" desc="Immediate transfer on request" checked={r.forwardOnManager} onChange={(v) => patch("routing", { forwardOnManager: v })} />
            <ToggleRow label="Complex question" desc="Transfer when the AI is unsure" checked={r.forwardOnComplex} onChange={(v) => patch("routing", { forwardOnComplex: v })} />
            <Field label="Escalation number">
              <Input value={r.escalationNumber} onChange={(e) => patch("routing", { escalationNumber: e.target.value })} />
            </Field>
          </Section>

          <Section icon={IconUsers} title="Emergency / VIP Bypass" desc="Numbers and words that skip the AI">
            <Field label="VIP phone numbers">
              <Textarea rows={2} value={r.vipNumbers} onChange={(e) => patch("routing", { vipNumbers: e.target.value })} />
            </Field>
            <Field label="Bypass keywords">
              <Input value={r.vipKeywords} onChange={(e) => patch("routing", { vipKeywords: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-2 pt-1">
              {r.vipKeywords.split(",").map((k) => (
                <Badge key={k} className="border-orange-200 bg-orange-50 text-orange-600">
                  {k.trim()}
                </Badge>
              ))}
            </div>
          </Section>

          <Section icon={IconClock} title="Call Duration & Silence Timeout" desc="Limits that keep calls tidy">
            <Field label={`Max call duration — ${r.maxDuration} min`}>
              <Slider value={[r.maxDuration]} min={5} max={60} step={5} onValueChange={([v]) => patch("routing", { maxDuration: v })} />
            </Field>
            <Field label={`Silence timeout — ${r.silenceTimeout}s`}>
              <Slider value={[r.silenceTimeout]} min={3} max={30} step={1} onValueChange={([v]) => patch("routing", { silenceTimeout: v })} />
            </Field>
            <div className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-500">
              After {r.silenceTimeout}s of silence the AI asks "Are you still there?" then ends the call.
            </div>
          </Section>

          <Section icon={IconBell} title="Post-Call Notifications" desc="How the owner gets summaries">
            <ToggleRow label="SMS" desc="Text summary to your phone" checked={s.notifySms} onChange={(v) => patch("scheduling", { notifySms: v })} />
            <ToggleRow label="Email" desc="Full transcript by email" checked={s.notifyEmail} onChange={(v) => patch("scheduling", { notifyEmail: v })} />
            <ToggleRow label="Slack" desc="Post to a channel" checked={s.notifySlack} onChange={(v) => patch("scheduling", { notifySlack: v })} />
            <ToggleRow label="Push" desc="In-app notification" checked={s.notifyPush} onChange={(v) => patch("scheduling", { notifyPush: v })} />
          </Section>

          <Section icon={IconSwap} title="Compliance & Call Recording" desc="Provider-controlled recording and storage" className="lg:col-span-2">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-900">Recording is not enabled by this settings page.</p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">This workspace preference does not switch on SautiKit audio capture or copy audio into TWIGA cloud storage. Check the actual per-business recording status under Phone & AI → Call recordings & cloud storage. Keep recording off until the caller disclosure and provider recording behaviour have been verified.</p>
            </div>
            <Field label="Preferred recording disclosure text (draft only)">
              <Input value={s.disclaimer} onChange={(e) => patch("scheduling", { disclaimer: e.target.value })} />
            </Field>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  desc,
  children,
  className,
}: {
  icon: typeof IconGear;
  title: string;
  desc: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-2xl border-neutral-200 shadow-sm", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-4 py-3 transition-colors hover:border-neutral-200">
      <div>
        <p className="text-sm font-medium text-neutral-900">{label}</p>
        <p className="text-xs text-neutral-500">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        active ? "bg-neutral-950 text-white" : "text-neutral-500 hover:text-neutral-900"
      )}
    >
      {children}
    </button>
  );
}