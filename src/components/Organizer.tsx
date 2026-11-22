import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  IconSwap, IconBulb, IconPlus, IconInbox, IconSend, IconTrash, IconSparkle,
  IconCheck, IconClock, IconAlert,
} from "@/components/Icons";

type Kind = "task" | "idea" | "followup";
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  kind: Kind;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  due_at: string | null;
  approval_required: boolean;
  approval_status: string;
  action_type: string | null;
  action_payload: Record<string, any> | null;
  source: string;
  created_at: string;
};
type WorkerTask = { id: string; task_type: string; title: string; detail: string; status: string; priority: string; due_at: string; created_at: string };
type WorkerNotification = { id: string; notification_type: string; title: string; body: string; priority: string; created_at: string };
type WorkerStatus = {
  enabled: boolean; schedule: string; nextReviewAt: string | null; lastRunAt: string | null; lastReviewAt: string | null;
  lastTickAt?: string | null; lastSuccessAt?: string | null; lastErrorAt?: string | null; lastError?: string | null;
  lastProcessedCount?: number; lastFailedCount?: number; schedulerLastStartedAt?: string | null; schedulerLastFinishedAt?: string | null;
  schedulerLastDispatchedBusinesses?: number; schedulerLastFailedBusinesses?: number; schedulerLastPendingBusinesses?: number; schedulerLastError?: string | null;
  counts?: { needsReview: number; pending: number; processing: number; failed: number };
  profileSynced?: boolean; profileSyncError?: string | null;
  ownerWhatsAppConfigured?: boolean; ownerWhatsAppEnabled?: boolean; ownerWhatsAppLast4?: string;
  ownerWhatsAppBusinessNumber?: string; ownerWhatsAppPending?: number; ownerWhatsAppLastDeliveryStatus?: string | null;
  ownerWhatsAppLastDeliveryError?: string | null; ownerWhatsAppLastDeliveryAt?: string | null;
};

async function readFunctionError(error: any, fallback: string) {
  const response = error?.context;
  if (response && typeof response.clone === "function") {
    try {
      const payload = await response.clone().json();
      if (payload?.error) return String(payload.error);
      if (payload?.message) return String(payload.message);
    } catch {
      try { const raw = await response.clone().text(); if (raw.trim()) return raw.slice(0, 500); } catch { /* no response body */ }
    }
  }
  return error?.message || fallback;
}
const priorities = ["low", "normal", "high", "urgent"] as const;
const categories = ["operations", "sales", "customer_support", "bookings", "delivery", "stock", "finance", "compliance", "customer_follow_up", "growth"];
const label = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());

export default function Organizer() {
  const { businessId, demoMode, tasks: sampleTasks } = useStore();
  const [items, setItems] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<Kind>("task");
  const [category, setCategory] = useState("operations");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [dueAt, setDueAt] = useState("");
  const [filter, setFilter] = useState<"all" | "tasks" | "ideas" | "approvals" | "done">("all");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [workerTasks, setWorkerTasks] = useState<WorkerTask[]>([]);
  const [workerNotifications, setWorkerNotifications] = useState<WorkerNotification[]>([]);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [workerActionBusy, setWorkerActionBusy] = useState(false);
  const [ownerWhatsAppPhone, setOwnerWhatsAppPhone] = useState("");
  const [ownerWhatsAppSaving, setOwnerWhatsAppSaving] = useState(false);

  const load = useCallback(async () => {
    if (demoMode) {
      const createdAt = new Date().toISOString();
      const taskItems: Task[] = sampleTasks.map((task, index) => ({
        id: task.id, title: task.label, description: task.detail,
        status: task.status === "done" ? "done" : "open", kind: "task",
        category: index === 2 ? "stock" : index === 1 ? "customer_follow_up" : "operations",
        priority: index === 1 ? "high" : "normal", due_at: null,
        approval_required: false, approval_status: "not_required",
        action_type: null, action_payload: null, source: "demo", created_at: createdAt,
      }));
      const approval: Task = {
        id: "demo-callback-approval", title: "Review Brian's requested callback",
        description: "Brian explicitly asked for a call after 2:00 PM about the service quote. Review the number and timing before approving.",
        status: "open", kind: "followup", category: "customer_follow_up", priority: "high",
        due_at: new Date(Date.now() + 45 * 60_000).toISOString(), approval_required: true,
        approval_status: "pending", action_type: "schedule_followup",
        action_payload: { customer_name: "Brian Otieno", phone: "+254712345602", reason: "Customer requested a quote follow-up", scheduled_at: new Date(Date.now() + 45 * 60_000).toISOString(), recipient_consent_confirmed: true },
        source: "demo", created_at: createdAt,
      };
      setItems([approval, ...taskItems]);
      setWorkerTasks([]);
      setWorkerNotifications([]);
      setWorkerStatus(null);
      setLoading(false);
      return;
    }
    if (!businessId || !supabase) { setItems([]); setWorkerTasks([]); setWorkerNotifications([]); setWorkerStatus(null); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("twiga_tasks")
      .select("id,title,description,status,kind,category,priority,due_at,approval_required,approval_status,action_type,action_payload,source,created_at")
      .eq("business_id", businessId).order("created_at", { ascending: false }).limit(200);
    if (error) setMessage(error.message);
    else setItems((data || []) as Task[]);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (!accessToken) throw new Error("Sign in again to view the AI Worker queue.");
      const response = await fetch("https://twiga-api.twiga-ke.workers.dev/ai/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
        body: JSON.stringify({ action: "overview", business_id: businessId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(String(payload?.error || "The AI Worker status could not be loaded."));
      setWorkerStatus(payload.worker ? { ...payload.worker, counts: payload.counts || { needsReview: 0, pending: 0, processing: 0, failed: 0 }, profileSynced: payload.profileSynced, profileSyncError: payload.profileSyncError || null } : null);
      setWorkerTasks(Array.isArray(payload.tasks) ? payload.tasks : []);
      setWorkerNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch (workerError) {
      setWorkerStatus(null);
      setWorkerTasks([]);
      setWorkerNotifications([]);
      setMessage(workerError instanceof Error ? "AI Orchestrator: " + workerError.message : "AI Orchestrator status could not be loaded.");
    }
    setLoading(false);
  }, [businessId, demoMode, sampleTasks]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!businessId || !supabase) return;
    const channel = supabase.channel("twiga-organizer-" + businessId)
      .on("postgres_changes", { event: "*", schema: "public", table: "twiga_tasks", filter: "business_id=eq." + businessId }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [businessId, load]);

  const add = async () => {
    if (title.trim().length < 3) return;
    if (demoMode) {
      const now = new Date().toISOString();
      setItems((current) => [{ id: "demo-manual-" + Date.now(), title: title.trim(), description: description.trim() || null, status: "open", kind, category, priority, due_at: dueAt ? new Date(dueAt).toISOString() : null, approval_required: false, approval_status: "not_required", action_type: null, action_payload: null, source: "demo", created_at: now }, ...current]);
      setTitle(""); setDescription(""); setDueAt(""); setKind("task"); setPriority("normal");
      setMessage("Added to this temporary demo. Nothing was sent or saved to a real business.");
      return;
    }
    if (!businessId || !supabase) return;
    setBusy(true); setMessage("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in again before adding a task.");
      const { data, error } = await supabase.from("twiga_tasks").insert({
        business_id: businessId,
        created_by: auth.user.id,
        title: title.trim(),
        description: description.trim() || null,
        status: "open",
        kind,
        category,
        priority,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        source: "manual",
        approval_required: false,
        approval_status: "not_required",
        action_payload: {},
        metadata: {},
        updated_at: new Date().toISOString(),
      }).select("id").single();
      if (error) throw error;
      setTitle(""); setDescription(""); setDueAt(""); setKind("task"); setPriority("normal");
      setMessage("Saved to this business workspace.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this task."); }
    finally { setBusy(false); }
  };

  const updateStatus = async (item: Task, status: string) => {
    if (demoMode) { setItems((current) => current.map((x) => x.id === item.id ? { ...x, status } : x)); setMessage("Demo task updated locally."); return; }
    if (!supabase || !businessId) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.from("twiga_tasks").update({
      status,
      ...(status === "done" ? { completed_at: new Date().toISOString() } : { completed_at: null }),
      updated_at: new Date().toISOString(),
    }).eq("id", item.id).eq("business_id", businessId);
    if (error) setMessage(error.message); else await load();
    setBusy(false);
  };

  const remove = async (id: string) => {
    if (demoMode) { setItems((current) => current.filter((x) => x.id !== id)); setMessage("Removed from this temporary demo."); return; }
    if (!supabase || !businessId) return;
    setBusy(true);
    const { error } = await supabase.from("twiga_tasks").delete().eq("id", id).eq("business_id", businessId);
    if (error) setMessage(error.message); else await load();
    setBusy(false);
  };

  const decideCallback = async (item: Task, decision: "approve_callback" | "reject_callback") => {
    if (demoMode) {
      setItems((current) => current.map((x) => x.id === item.id ? { ...x, approval_status: decision === "approve_callback" ? "approved" : "rejected", status: decision === "approve_callback" ? "open" : "cancelled" } : x));
      setMessage(decision === "approve_callback" ? "Demo approval recorded locally. No real callback was queued or placed." : "Demo request rejected locally. No call was placed.");
      return;
    }
    if (!supabase || !businessId) return;
    setBusy(true); setMessage(decision === "approve_callback" ? "Approving and scheduling the consented callback…" : "Rejecting the proposed callback…");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-ai-actions", {
        body: { action: decision, businessId, taskId: item.id },
      });
      if (error) throw new Error(await readFunctionError(error, "The AI action approval service returned an error."));
      if (data?.error) throw new Error(String(data.error));
      setMessage(data?.message || (decision === "approve_callback" ? "Callback approved." : "Callback rejected. No call was placed."));
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update this approval."); }
    finally { setBusy(false); }
  };

  const acknowledgeWorkerTask = async (taskId: string) => {
    if (!supabase || !businessId) return;
    setWorkerActionBusy(true);
    setMessage("");
    try {
      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (!accessToken) throw new Error("Sign in again before acknowledging this item.");
      const response = await fetch("https://twiga-api.twiga-ke.workers.dev/ai/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
        body: JSON.stringify({ action: "resolve_task", business_id: businessId, task_id: taskId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(String(payload?.error || "This item could not be acknowledged."));
      setMessage("Item acknowledged in the business Worker queue.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not acknowledge this Worker item.");
    } finally {
      setWorkerActionBusy(false);
    }
  };

  const runWorkerCommand = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!businessId || !supabase) throw new Error("Choose a business workspace and sign in again.");
    const { data: authData } = await supabase.auth.getSession();
    const accessToken = authData.session?.access_token;
    if (!accessToken) throw new Error("Sign in again to use the AI Orchestrator.");
    const response = await fetch("https://twiga-api.twiga-ke.workers.dev/ai/worker", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
      body: JSON.stringify({ action, business_id: businessId, ...extra }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) throw new Error(String(payload?.error || "The AI Orchestrator could not complete that action."));
    return payload;
  };

  const saveOwnerWhatsApp = async () => {
    if (!ownerWhatsAppPhone.trim()) { setMessage("Enter the owner's WhatsApp number first."); return; }
    setOwnerWhatsAppSaving(true);
    setMessage("Saving the owner WhatsApp alert destination…");
    try {
      const payload = await runWorkerCommand("set_owner_whatsapp", { phone: ownerWhatsAppPhone.trim(), enabled: true });
      setMessage(String(payload?.message || "Owner WhatsApp number saved."));
      setOwnerWhatsAppPhone("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the owner WhatsApp number.");
    } finally { setOwnerWhatsAppSaving(false); }
  };

  const runWorkerReview = async () => {
    setWorkerActionBusy(true);
    setMessage("Starting a fresh evidence-based business review…");
    try {
      const payload = await runWorkerCommand("run_review");
      const processed = Number(payload?.result?.processed || 0);
      const failed = Number(payload?.result?.failed || 0);
      const pending = Number(payload?.result?.remainingPending || 0);
      setMessage("Review request reached the Worker · " + processed + " queued job(s) processed · " + failed + " failed · " + pending + " still pending.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? "AI Orchestrator: " + error.message : "The business review could not be started.");
    } finally {
      setWorkerActionBusy(false);
    }
  };

  const processWorkerQueue = async () => {
    setWorkerActionBusy(true);
    setMessage("Processing up to 50 due jobs for this business…");
    try {
      const payload = await runWorkerCommand("process_queue");
      const result = payload?.result || {};
      setMessage("Worker queue checked · " + Number(result.processed || 0) + " processed · " + Number(result.failed || 0) + " failed · " + Number(result.remainingPending || 0) + " still pending.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? "AI Orchestrator: " + error.message : "The Worker queue could not be processed.");
    } finally {
      setWorkerActionBusy(false);
    }
  };

  const provisionWorker = async () => {
    setWorkerActionBusy(true);
    setMessage("Provisioning this business's isolated Worker and daily review schedule…");
    try {
      const payload = await runWorkerCommand("provision");
      setMessage(payload?.message || "Business Worker provisioned.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? "AI Orchestrator: " + error.message : "The business Worker could not be provisioned.");
    } finally {
      setWorkerActionBusy(false);
    }
  };

  const toggleWorkerSchedule = async () => {
    if (!workerStatus) return;
    const enabled = !workerStatus.enabled;
    setWorkerActionBusy(true);
    setMessage(enabled ? "Resuming scheduled business reviews…" : "Pausing scheduled business reviews…");
    try {
      await runWorkerCommand("set_enabled", { enabled });
      setMessage(enabled ? "Scheduled business reviews resumed." : "Scheduled business reviews paused. Queued work will still be processed.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? "AI Orchestrator: " + error.message : "The review schedule could not be updated.");
    } finally {
      setWorkerActionBusy(false);
    }
  };

  const visible = useMemo(() => items.filter((item) => {
    if (filter === "tasks") return item.kind === "task" || item.kind === "followup";
    if (filter === "ideas") return item.kind === "idea";
    if (filter === "approvals") return item.approval_status === "pending";
    if (filter === "done") return item.status === "done";
    return true;
  }), [items, filter]);
  const pendingApprovals = items.filter((item) => item.approval_status === "pending").length;
  const openTasks = items.filter((item) => item.status !== "done" && item.status !== "cancelled").length;
  const ideas = items.filter((item) => item.kind === "idea").length;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-orange-600">TWIGA · business operations</p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-950">Organize work</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Real tasks, ideas and AI-proposed customer callbacks for the selected business. AI can log work automatically. Outbound callbacks wait for recipient consent and, by default, owner approval.</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Open work</p><p className="mt-1 text-xl font-bold tabular-nums text-neutral-950">{openTasks}</p></div>
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Needs approval</p><p className="mt-1 text-xl font-bold tabular-nums text-neutral-950">{pendingApprovals}</p></div>
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Ideas</p><p className="mt-1 text-xl font-bold tabular-nums text-neutral-950">{ideas}</p></div>
        </div>
      </header>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-orange-600">Cloudflare · per-business runtime</p>
            <h2 className="mt-1 text-lg font-semibold text-neutral-950">AI Business Orchestrator</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600">Cloudflare checks up to 50 business workspaces per scheduler tick and can process up to 50 due jobs for this business per run. Daily reviews run at 8:00 a.m. Nairobi time; inbox events and due jobs are processed in the background. Unsupported actions stay in the owner approval queue rather than being falsely marked complete.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", workerStatus?.enabled ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600")}>
              {workerStatus ? (workerStatus.enabled ? "Worker schedule on" : "Worker schedule paused") : demoMode ? "Demo only" : "Status unavailable"}
            </span>
            {!demoMode && <button type="button" onClick={() => void runWorkerReview()} disabled={!businessId || workerActionBusy} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-40">{workerActionBusy ? "Working…" : "Run business review"}</button>}
            {!demoMode && <button type="button" onClick={() => void processWorkerQueue()} disabled={!businessId || workerActionBusy} className="rounded-lg bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-40 dark:bg-white dark:text-neutral-950">{workerActionBusy ? "Working…" : "Process queue now"}</button>}
            {!demoMode && <button type="button" onClick={() => void provisionWorker()} disabled={!businessId || workerActionBusy} className="rounded-lg border border-orange-300 px-3 py-2 text-xs font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-40 dark:text-orange-300">Provision / repair</button>}
            {!demoMode && workerStatus && <button type="button" onClick={() => void toggleWorkerSchedule()} disabled={workerActionBusy} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">{workerStatus.enabled ? "Pause daily reviews" : "Resume daily reviews"}</button>}
          </div>
        </div>
        {workerStatus && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Scheduler heartbeat</p><p className="mt-1 text-sm font-semibold text-neutral-950">{workerStatus.schedulerLastFinishedAt ? new Date(workerStatus.schedulerLastFinishedAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "No scheduler tick recorded"}</p><p className="mt-1 text-[11px] text-neutral-500">{Number(workerStatus.schedulerLastDispatchedBusinesses || 0)} business(es) dispatched</p></div>
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Business Worker heartbeat</p><p className="mt-1 text-sm font-semibold text-neutral-950">{workerStatus.lastTickAt ? new Date(workerStatus.lastTickAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "No business tick yet"}</p><p className="mt-1 text-[11px] text-neutral-500">Last successful tick: {workerStatus.lastSuccessAt ? new Date(workerStatus.lastSuccessAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" }) : "Not recorded"}</p></div>
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Next daily review</p><p className="mt-1 text-sm font-semibold text-neutral-950">{workerStatus.nextReviewAt ? new Date(workerStatus.nextReviewAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "Not scheduled"}</p><p className="mt-1 text-[11px] text-neutral-500">Last review: {workerStatus.lastReviewAt ? new Date(workerStatus.lastReviewAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" }) : "Not run yet"}</p></div>
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Jobs this business</p><p className="mt-1 text-sm font-semibold text-neutral-950">{Number(workerStatus.counts?.pending || 0)} pending · {Number(workerStatus.counts?.processing || 0)} processing</p><p className="mt-1 text-[11px] text-neutral-500">{Number(workerStatus.counts?.needsReview || 0)} need review · {Number(workerStatus.counts?.failed || 0)} failed</p></div>
        </div>}
        {workerStatus && (workerStatus.schedulerLastError || workerStatus.lastError || workerStatus.profileSynced === false) && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Worker needs attention</p>
          {workerStatus.schedulerLastError && <p className="mt-1 text-xs leading-5">Scheduler: {workerStatus.schedulerLastError}</p>}
          {workerStatus.lastError && <p className="mt-1 text-xs leading-5">Business queue: {workerStatus.lastError}</p>}
          {workerStatus.profileSynced === false && <p className="mt-1 text-xs leading-5">Profile sync: {workerStatus.profileSyncError || "Business profile could not be refreshed. The saved Worker profile will be used."}</p>}
        </div>}
        {workerStatus && workerStatus.schedulerLastFinishedAt && Date.now() - new Date(workerStatus.schedulerLastFinishedAt).getTime() > 3 * 60 * 1000 && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">The scheduler heartbeat is more than three minutes old. The Worker may not be receiving Cron ticks.</div>}
        {workerStatus && workerStatus.lastTickAt && Date.now() - new Date(workerStatus.lastTickAt).getTime() > 10 * 60 * 1000 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">This business has not received a Worker tick in over ten minutes. Use Process queue now or Provision / repair to test it.</div>}
        <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-950">Owner WhatsApp alerts & quick replies</h3>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-600">TWIGA sends high-priority handovers, Worker failures and urgent review findings from the business’s connected official WhatsApp number. Save the owner’s personal WhatsApp number below.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700">{workerStatus?.ownerWhatsAppConfigured ? "Owner number saved · " + (workerStatus.ownerWhatsAppLast4 || "••••") + (workerStatus.ownerWhatsAppEnabled ? " · alerts on" : " · alerts paused") : "Owner number not configured"}</span>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input aria-label="Owner WhatsApp number" type="tel" inputMode="tel" autoComplete="tel" value={ownerWhatsAppPhone} onChange={(event) => setOwnerWhatsAppPhone(event.target.value)} placeholder="+2547XXXXXXXX" className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-950 outline-none focus:border-orange-400" />
            <button type="button" onClick={() => void saveOwnerWhatsApp()} disabled={!businessId || ownerWhatsAppSaving || workerActionBusy || ownerWhatsAppPhone.trim().length < 8} className="rounded-lg bg-neutral-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{ownerWhatsAppSaving ? "Saving…" : "Save owner number"}</button>
          </div>
          <p className="mt-2 text-xs leading-5 text-neutral-600">Connected business WhatsApp: <strong>{workerStatus?.ownerWhatsAppBusinessNumber || "not connected"}</strong>. After saving, send <strong>START</strong> from the owner’s phone to this business number. This opens Meta’s 24-hour reply window for alerts. When the window expires, send START again or configure an approved Meta message template.</p>
          <p className="mt-1 text-xs leading-5 text-neutral-600">Owner commands: <strong>STATUS</strong>, <strong>SUMMARY</strong>, <strong>TASKS</strong>, <strong>PAUSE</strong>, <strong>RESUME</strong>, <strong>DISMISS task-id</strong>, or <strong>REPLY +2547… | your message</strong> to answer a customer.</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-600">
            <span>Outbox: {Number(workerStatus?.ownerWhatsAppPending || 0)} pending / blocked</span>
            <span>Last delivery: {workerStatus?.ownerWhatsAppLastDeliveryStatus || "none yet"}{workerStatus?.ownerWhatsAppLastDeliveryAt ? " · " + new Date(workerStatus.ownerWhatsAppLastDeliveryAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" }) : ""}</span>
          </div>
          {workerStatus?.ownerWhatsAppLastDeliveryError && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{workerStatus.ownerWhatsAppLastDeliveryError}</p>}
          {workerStatus?.ownerWhatsAppConfigured && <button type="button" onClick={async () => { setWorkerActionBusy(true); try { const enabled = !workerStatus.ownerWhatsAppEnabled; const result = await runWorkerCommand("set_owner_whatsapp", { enabled }); setMessage(String(result?.message || (enabled ? "Owner WhatsApp alerts enabled." : "Owner WhatsApp alerts paused."))); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update owner alerts."); } finally { setWorkerActionBusy(false); } }} disabled={workerActionBusy} className="mt-2 text-xs font-semibold text-neutral-600 underline underline-offset-2">{workerStatus.ownerWhatsAppEnabled ? "Pause owner WhatsApp alerts" : "Resume owner WhatsApp alerts"}</button>}
        </div>
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-semibold text-neutral-950">Business Worker queue & handovers</h3><p className="mt-1 text-xs text-neutral-500">Pending and processing jobs, owner-review tasks, and failed jobs returned by the Cloudflare Worker.</p></div>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">{workerTasks.length} waiting</span>
          </div>
          {!workerStatus && !demoMode && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The Worker queue could not be read. Refresh to retry; the business task list below remains available.</p>}
          {workerTasks.length === 0 && workerStatus && <p className="mt-3 rounded-xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-500">No pending, processing, review or failed jobs are currently in this business's Cloudflare Worker queue.</p>}
          <div className="mt-3 space-y-2">
            {workerTasks.map((task) => <article key={task.id} className="rounded-xl border border-neutral-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><p className="text-sm font-semibold text-neutral-950">{task.title}</p><p className="mt-1 text-xs text-neutral-500">{label(task.task_type)} · {label(task.status)} · {label(task.priority)} priority</p></div>
                {["needs_review","failed"].includes(task.status) && <button onClick={() => void acknowledgeWorkerTask(task.id)} disabled={workerActionBusy} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 disabled:opacity-40">Acknowledge</button>}
                {task.status === "pending" && <span className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-[11px] font-semibold text-orange-800">Waiting for Worker</span>}
                {task.status === "processing" && <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-800">Worker processing</span>}
              </div>
              {task.detail && <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-neutral-600">{task.detail}</p>}
            </article>)}
          </div>
        </div>
        {workerNotifications.length > 0 && <div className="mt-5 border-t border-neutral-200 pt-4">
          <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-neutral-950">Worker notifications & run results</h3><span className="text-xs text-neutral-500">Latest {workerNotifications.length}</span></div>
          <div className="space-y-2">{workerNotifications.map((notice) => <article key={notice.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-neutral-900">{notice.title}</p><span className="text-[11px] text-neutral-500">{new Date(notice.created_at).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</span></div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-neutral-600">{notice.body}</p>
          </article>)}</div>
        </div>}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><IconSwap className="h-5 w-5 text-orange-500" /><h2 className="font-semibold text-neutral-950">Capture work</h2></div>
        <p className="mt-1 text-xs text-neutral-500">Add an internal task or idea. AI-created tasks will also appear here.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} placeholder="What needs doing?" className="h-11 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 sm:col-span-2" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details, customer context or next steps…" rows={2} className="rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-orange-400 sm:col-span-2" />
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="h-10 rounded-xl border border-neutral-200 px-3 text-sm"><option value="task">Task</option><option value="idea">Idea</option><option value="followup">Follow-up</option></select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-xl border border-neutral-200 px-3 text-sm">{categories.map((x) => <option key={x} value={x}>{label(x)}</option>)}</select>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])} className="h-10 rounded-xl border border-neutral-200 px-3 text-sm">{priorities.map((x) => <option key={x} value={x}>{label(x)} priority</option>)}</select>
          <input aria-label="Due date and time" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-10 rounded-xl border border-neutral-200 px-3 text-sm" />
        </div>
        <div className="mt-3 flex justify-end"><button onClick={() => void add()} disabled={!businessId || busy || title.trim().length < 3} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"><IconPlus className="h-4 w-4" /> Add to workspace</button></div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold text-neutral-950">Business work queue</h2><p className="mt-1 text-xs text-neutral-500">Only records belonging to the currently selected business are shown.</p></div>
          <button onClick={() => void load()} disabled={loading || busy} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700">Refresh</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["all","tasks","ideas","approvals","done"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", filter === value ? "border-orange-500 bg-orange-500 text-white" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300")}>{value === "approvals" ? "Needs approval (" + pendingApprovals + ")" : label(value)}</button>)}
        </div>
        <div className="mt-4 space-y-3">
          {!businessId && <p className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">Select a business workspace to view its tasks.</p>}
          {businessId && loading && <p className="py-8 text-center text-sm text-neutral-500">Loading this business's work queue…</p>}
          {businessId && !loading && visible.length === 0 && <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center"><IconInbox className="mx-auto h-7 w-7 text-neutral-300" /><p className="mt-2 text-sm font-medium text-neutral-700">No records in this view</p><p className="mt-1 text-xs text-neutral-500">New work recorded by the AI or your team will appear here. No sample items are inserted.</p></div>}
          {visible.map((item) => {
            const pending = item.approval_status === "pending";
            const done = item.status === "done" || item.status === "cancelled";
            return <article key={item.id} className="rounded-xl border border-neutral-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-neutral-950">{item.title}</span><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">{label(item.kind)}</span><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">{label(item.category || "operations")}</span></div>
                  {item.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-neutral-600">{item.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-500"><span className={cn("rounded-full px-2 py-1", item.priority === "urgent" ? "bg-red-50 text-red-700" : item.priority === "high" ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600")}>{label(item.priority || "normal")} priority</span><span className="rounded-full bg-neutral-100 px-2 py-1">{label(item.status)}</span>{item.due_at && <span className="rounded-full bg-neutral-100 px-2 py-1">Due {new Date(item.due_at).toLocaleString()}</span>}{item.source === "ai_receptionist" && <span className="rounded-full bg-neutral-100 px-2 py-1">Created by AI</span>}</div>
                </div>
                <button onClick={() => void remove(item.id)} disabled={busy} aria-label="Delete task" className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-30"><IconTrash className="h-4 w-4" /></button>
              </div>
              {pending && item.action_type === "schedule_followup" && <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-orange-900"><IconAlert className="h-4 w-4" /> Customer callback requires approval</div>
                <p className="mt-1 text-xs leading-5 text-orange-900">The AI says the customer agreed to this callback. Review the destination, reason and time before approving. Approval adds it to the scheduled-call queue; it does not place an immediate call.</p>
                <div className="mt-2 text-xs text-orange-950">{item.action_payload?.phone} · {item.action_payload?.reason} · {item.action_payload?.scheduled_at ? new Date(item.action_payload.scheduled_at).toLocaleString() : "Time not supplied"}</div>
                <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void decideCallback(item,"approve_callback")} disabled={busy} className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Approve & schedule callback</button><button onClick={() => void decideCallback(item,"reject_callback")} disabled={busy} className="rounded-lg border border-orange-300 bg-white px-3 py-2 text-xs font-semibold text-orange-900 disabled:opacity-40">Reject</button></div>
              </div>}
              {!pending && !done && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void updateStatus(item,"in_progress")} disabled={busy || item.status === "in_progress"} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 disabled:opacity-40">Start</button><button onClick={() => void updateStatus(item,"done")} disabled={busy} className="rounded-lg bg-neutral-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><IconCheck className="mr-1 inline h-3.5 w-3.5" /> Mark done</button></div>}
            </article>;
          })}
        </div>
      </section>
      {message && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-700">{message}</p>}
    </div>
  );
}
