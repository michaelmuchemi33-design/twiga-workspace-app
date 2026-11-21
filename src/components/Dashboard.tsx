import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore, type TaskStatus } from "@/lib/store";
import { cn } from "@/lib/utils";
import AnimatedNumber from "@/components/AnimatedNumber";


type WorkerTask = { id: string; title: string; detail: string; status: string; priority: string; task_type?: string; due_at?: string; created_at?: string; };
type WorkerNotification = { id: string; title: string; body: string; created_at: string; priority: string; };
type WorkerOverview = {
  worker: { enabled: boolean; schedule: string; nextReviewAt?: string | null; lastReviewAt?: string | null; };
  tasks: WorkerTask[];
  notifications: WorkerNotification[];
  counts: { needsReview: number; failed: number; };
};

type TaskPriority = "high" | "medium" | "low";
function normaliseTaskPriority(value: unknown): TaskPriority {
  const priority = String(value || "").toLowerCase();
  if (priority === "high") return "high";
  if (priority === "low") return "low";
  return "medium";
}
function ownerTaskCategory(task: WorkerTask): string {
  const value = (task.title + " " + task.detail).toLowerCase();
  if (/deliver|delivery|dispatch|pickup|collection|fulfil|fulfill|order/.test(value)) return "Orders";
  if (/appointment|booking|booked|service slot|calendar/.test(value)) return "Bookings & services";
  if (/stock|inventory|restock|replenish/.test(value)) return "Stock";
  if (/call back|callback|missed call|customer|enquir|lead|follow.up/.test(value)) return "Customers";
  if (/payment|unpaid|mpesa|m-pesa|invoice/.test(value)) return "Payments";
  return "Business operations";
}
function readableCallValue(value: unknown, depth = 0): string {
  if (depth > 4 || value == null || typeof value === "boolean") return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => readableCallValue(item, depth + 1)).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    const preferred = ["name", "title", "service", "product", "item", "description", "reason", "intent", "date", "time", "quantity", "qty", "value"];
    return Array.from(new Set(preferred.map((key) => readableCallValue(item[key], depth + 1)).filter(Boolean))).join(" · ");
  }
  return "";
}
function firstCallDetail(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = readableCallValue(data[key]);
    if (value) return value.slice(0, 260);
  }
  return "";
}
function callFlag(data: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => data[key] === true || data[key] === 1 || (typeof data[key] === "string" && !["", "false", "no", "0"].includes(String(data[key]).toLowerCase())));
}

async function businessWorkerRequest(businessId: string, action: string, extra: Record<string, unknown> = {}) {
  if (!supabase) throw new Error("TWIGA is not connected.");
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("Sign in again to use your business Worker.");
  const response = await fetch("https://twiga-api.twiga-ke.workers.dev/ai/worker", {
    method: "POST",
    headers: {"Content-Type":"application/json", "Authorization":"Bearer " + token},
    body: JSON.stringify({action:action,business_id:businessId,...extra})
  });
  const rawResponse = await response.text();
  let result: any = {};
  try {
    result = rawResponse ? JSON.parse(rawResponse) : {};
  } catch {
    throw new Error(`TWIGA Worker returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok || result.ok === false) {
    const message = String(result.error || `The business Worker could not respond (HTTP ${response.status}).`);
    const reference = result.reference ? ` Reference: ${String(result.reference).slice(0, 40)}` : "";
    throw new Error(message + reference);
  }
  return result;
}

import {
  IconSparkle,
  IconPhone,
  IconCalendar,
  IconCard,
  IconChat,
  IconUsers,
  IconCheck,
  IconClock,
  IconX,
  IconTrend,
  IconCoin,
  IconArrowUpRight,
  IconBulb,
  IconMic,
  IconSwap,
  IconBell,
} from "@/components/Icons";

const statusMeta: Record<
  TaskStatus,
  { icon: typeof IconCheck; chip: string; label: string }
> = {
  done: {
    icon: IconCheck,
    chip: "border-orange-200 bg-orange-50 text-orange-600",
    label: "Done",
  },
  pending: {
    icon: IconClock,
    chip: "border-neutral-200 bg-neutral-100 text-neutral-600",
    label: "Pending",
  },
  failed: {
    icon: IconX,
    chip: "border-neutral-200 bg-white text-neutral-900",
    label: "Failed",
  },
};

const capabilities = [
  { icon: IconPhone, label: "Answer calls", detail: "24/7 pickup" },
  { icon: IconCalendar, label: "Book appointments", detail: "Calendar sync" },
  { icon: IconCard, label: "Take payments", detail: "Push links" },
  { icon: IconChat, label: "WhatsApp replies", detail: "Auto-send" },
  { icon: IconUsers, label: "Capture leads", detail: "CRM entry" },
  { icon: IconSparkle, label: "Answer FAQs", detail: "Trained on you" },
];

export default function Dashboard({ onSetup, onPayments }: { onSetup: () => void; onPayments?: () => void }) {
  const {
    tasks,
    sales,
    payments,
    customers,
    messages,
    callRecords,
    completeTask,
    settings,
    businessId,
  } = useStore();
  const [ownerName, setOwnerName] = useState("");
  const [billingReminder, setBillingReminder] = useState<{ paid_through?: string | null; current_period_end?: string | null; status?: string } | null>(null);
  const [workerOverview, setWorkerOverview] = useState<WorkerOverview | null>(null);
  const [workerLoading, setWorkerLoading] = useState(true);
  const [workerRunning, setWorkerRunning] = useState(false);
  const [workerError, setWorkerError] = useState("");


  useEffect(() => {
    if (false || !supabase || !businessId) return;
    let active = true;
    void Promise.all([
      supabase.auth.getUser(),
      supabase.from("twiga_business_profiles").select("owner_name,owner_email").eq("business_id", businessId).maybeSingle(),
    ]).then(([authResult, profileResult]) => {
      if (!active) return;
      const savedName = String(profileResult.data?.owner_name || "");
      const accountName = String(authResult.data.user?.user_metadata?.full_name || authResult.data.user?.user_metadata?.name || "");
      setOwnerName(savedName || accountName);
    });
    return () => { active = false; };
  }, [false, businessId]);

  useEffect(() => {
    if (!supabase || !businessId) { setBillingReminder(null); return; }
    let active = true;
    void Promise.all([
      supabase.from("businesses").select("paid_through,status").eq("id", businessId).maybeSingle(),
      supabase.from("twiga_subscriptions").select("current_period_end").eq("business_id", businessId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]).then(([businessResult, subscriptionResult]) => {
      if (!active) return;
      setBillingReminder({
        paid_through: businessResult.data?.paid_through ?? null,
        status: businessResult.data?.status ?? null,
        current_period_end: subscriptionResult.data?.current_period_end ?? null,
      });
    });
    return () => { active = false; };
  }, [businessId]);


  useEffect(() => {
    let active = true;
    if (!businessId) { setWorkerOverview(null); setWorkerLoading(false); return; }
    const refresh = () => {
      businessWorkerRequest(businessId, "overview")
        .then((result) => { if (active) setWorkerOverview(result as WorkerOverview); })
        .catch((error) => { if (active) setWorkerError(error instanceof Error ? error.message : "Worker status could not be loaded."); })
        .finally(() => { if (active) setWorkerLoading(false); });
    };
    setWorkerLoading(true);
    setWorkerError("");
    refresh();
    const refreshInterval = window.setInterval(refresh, 60_000);
    return () => { active = false; window.clearInterval(refreshInterval); };
  }, [businessId]);

  const runBusinessWorkerReview = async () => {
    if (!businessId || workerRunning) return;
    setWorkerRunning(true);
    setWorkerError("");
    try {
      await businessWorkerRequest(businessId, "run_review");
      const result = await businessWorkerRequest(businessId, "overview");
      setWorkerOverview(result as WorkerOverview);
    } catch (error) {
      setWorkerError(error instanceof Error ? error.message : "The Worker review failed.");
    } finally {
      setWorkerRunning(false);
    }
  };

  const resolveWorkerTask = async (taskId: string) => {
    if (!businessId) return;
    try {
      await businessWorkerRequest(businessId, "resolve_task", {task_id:taskId});
      const result = await businessWorkerRequest(businessId, "overview");
      setWorkerOverview(result as WorkerOverview);
    } catch (error) {
      setWorkerError(error instanceof Error ? error.message : "The task could not be updated.");
    }
  };

  const renewalDeadline = billingReminder?.current_period_end
    ? new Date(billingReminder.current_period_end).getTime()
    : billingReminder?.paid_through
      ? new Date(String(billingReminder.paid_through) + "T23:59:59").getTime()
      : null;
  const renewalDaysLeft = renewalDeadline !== null
    ? Math.ceil((renewalDeadline - Date.now()) / 86400000)
    : null;

  const revenue = sales.reduce((s, x) => s + x.total, 0);
  const dueFollowUps = customers.filter((c) => c.followUpIn === 0).length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const failedTasks = tasks.filter((t) => t.status === "failed").length;

  const resolveBusinessTimeZone = (value: string) => {
    const candidate = String(value || "Africa/Nairobi").split(/\s+\(/)[0].trim();
    try { new Intl.DateTimeFormat("en", { timeZone: candidate }).format(new Date()); return candidate; }
    catch { return "Africa/Nairobi"; }
  };
  const businessTimeZone = resolveBusinessTimeZone(settings.business.timezone);
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: businessTimeZone });
  const callsToday = callRecords.filter((c) => new Date(c.started_at || c.created_at).toLocaleDateString("en-CA", { timeZone: businessTimeZone }) === todayKey).length;
  const callsHandled = callRecords.filter((c) => Date.now() - new Date(c.started_at || c.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000).length;
  const bookings = callRecords.filter((c) => Boolean(c.structured_data?.appointment_request || c.structured_data?.appointment_start_iso)).length;
  const ongoingCalls = callRecords.filter((c) => ["in_progress", "ringing", "ongoing"].includes(String(c.status).toLowerCase()));
  const recentCalls = callRecords.slice(0, 8);
  const workerTasks = workerOverview?.tasks || [];
  const priorityGroups: Array<{key: TaskPriority; label: string; hint: string; tasks: WorkerTask[]; tone: string}> = [
    {key: "high", label: "High priority", hint: "Handle first", tasks: workerTasks.filter((task) => normaliseTaskPriority(task.priority) === "high"), tone: "border-red-200 bg-red-50 text-red-800"},
    {key: "medium", label: "Medium priority", hint: "Plan and complete", tasks: workerTasks.filter((task) => normaliseTaskPriority(task.priority) === "medium"), tone: "border-orange-200 bg-orange-50 text-orange-800"},
    {key: "low", label: "Low priority", hint: "When time allows", tasks: workerTasks.filter((task) => normaliseTaskPriority(task.priority) === "low"), tone: "border-neutral-200 bg-neutral-100 text-neutral-700"}
  ];
  const averageDuration = callRecords.length ? Math.round(callRecords.reduce((sum, c) => sum + Number(c.duration_seconds || 0), 0) / callRecords.length) : 0;
  const formatDuration = (seconds: number) => seconds >= 60 ? Math.floor(seconds / 60) + "m " + String(seconds % 60).padStart(2, "0") + "s" : seconds + "s";
  const leads = customers.length;

  const stats = [
    { label: "Calls handled today", value: `${callsToday}`, sub: `${callsHandled} this week`, icon: IconPhone, accent: true },
    { label: "Ongoing calls", value: `${ongoingCalls.length}`, sub: "in progress now", icon: IconMic },
    { label: "Bookings made", value: `${bookings}`, sub: "by the AI", icon: IconCalendar },
    { label: "Revenue today", value: `KSh ${revenue.toLocaleString()}`, sub: `${sales.length} sales`, icon: IconCoin, money: revenue },
  ];

  const outputs = [
    { label: "Calls answered", value: callsToday, icon: IconPhone, tone: "orange" },
    { label: "Appointments booked", value: bookings, icon: IconCalendar, tone: "dark" },
    { label: "Payment links sent", value: payments.length, icon: IconCard, tone: "orange" },
    { label: "WhatsApp sent", value: messages.length, icon: IconChat, tone: "dark" },
    { label: "Leads captured", value: leads, icon: IconUsers, tone: "orange" },
    { label: "Follow-ups due", value: dueFollowUps, icon: IconArrowUpRight, tone: "dark" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
            Your business
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            {ownerName ? `Welcome, ${ownerName}` : settings.business.name ? `Welcome, ${settings.business.name}` : "Your workspace"}
          </h1>
          <p className="mt-1 text-sm text-neutral-800">
            {settings.business.name ? `${settings.business.name} · ` : ""}Your receptionist handled {doneTasks} tasks today · {pendingTasks} pending · {failedTasks} failed
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-neutral-900">
            <span className={`h-2.5 w-2.5 rounded-full ${"bg-neutral-500"}`} />
            <span className="text-sm font-medium">{"Workspace ready"}</span>
          </div>

          <button
            onClick={onSetup}
            className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-neutral-900 transition-all duration-200 hover:bg-neutral-50 active:scale-95"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            <span className="text-sm font-medium">Edit business details</span>
          </button>
        </div>
      </div>

      <Card className="rounded-2xl border-neutral-200 bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <IconSparkle className="h-5 w-5 text-orange-500" /> TWIGA Worker
              <Badge className="border-0 bg-orange-50 text-orange-800">{workerLoading ? "Checking" : workerOverview?.worker.enabled ? "On" : "Paused"}</Badge>
            </CardTitle>
            <CardDescription>Checks this business, prepares useful tasks and brings important work to your workspace.</CardDescription>
          </div>
          <Button onClick={() => void runBusinessWorkerReview()} disabled={workerLoading || workerRunning || !businessId} className="bg-neutral-950 text-white hover:bg-neutral-800">
            {workerRunning ? "Reviewing…" : "Run review now"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
              <p className="text-xs text-neutral-500">Needs your review</p>
              <p className="text-xl font-semibold text-neutral-950">{workerOverview?.counts.needsReview ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
              <p className="text-xs text-neutral-500">Worker errors</p>
              <p className="text-xl font-semibold text-neutral-950">{workerOverview?.counts.failed ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
              <p className="text-xs text-neutral-500">Schedule</p>
              <p className="mt-1 text-sm font-semibold text-neutral-950">Every minute</p>
              <p className="text-[11px] text-neutral-500">Up to 50 workspaces · 10 tasks each</p>
            </div>
          </div>
          {workerOverview?.notifications?.length ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Latest update</p>
              <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3">
                <p className="text-sm font-semibold text-neutral-950">{workerOverview.notifications[0].title}</p>
                <p className="mt-1 text-sm leading-5 text-neutral-700">{workerOverview.notifications[0].body}</p>
              </div>
            </div>
          ) : <p className="text-sm text-neutral-500">{workerLoading ? "Checking the business Worker…" : "No new updates yet. TWIGA will add a note when it finds something useful."}</p>}
          {workerTasks.length > 0 ? (
            <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700">
              <strong className="text-neutral-950">{workerTasks.length} owner actions</strong> are listed in the prioritised Task Log below, grouped by urgency.
            </p>
          ) : null}
          {workerError && <p role="alert" className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-red-700">{workerError}</p>}
          <p className="text-[11px] leading-5 text-neutral-500">Cloudflare runs scheduled jobs and wakes this workspace’s Worker when work is due. Customer calls, messages, payments and purchases remain approval-controlled.</p>
        </CardContent>
      </Card>

      {renewalDaysLeft !== null && renewalDaysLeft <= 7 && (
        <div className={cn("flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between", renewalDaysLeft < 0 ? "border-red-200 bg-red-50" : "border-orange-200 bg-orange-50")}>
          <div>
            <p className="text-sm font-semibold text-neutral-900">{renewalDaysLeft < 0 ? "Your TWIGA subscription has expired" : renewalDaysLeft === 0 ? "Your TWIGA subscription expires today" : "Your TWIGA subscription is due soon"}</p>
            <p className="mt-1 text-xs text-neutral-600">{renewalDaysLeft < 0 ? "Review your renewal to restore uninterrupted service." : renewalDaysLeft === 0 ? "Review renewal options to avoid service interruption." : renewalDaysLeft + " days remaining. You can review renewal or available account top-up options in Payments."} TWIGA will never charge or purchase anything without your approval.</p>
          </div>
          <button onClick={onPayments} className="shrink-0 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-orange-600">Review in Payments</button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card
            key={s.label}
            className={cn(
              "rounded-2xl shadow-sm",
              s.accent ? "border-orange-200 bg-orange-50" : "border-neutral-200 bg-white"
            )}
          >
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {s.label}
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
                  {s.money !== undefined ? (
                    <AnimatedNumber value={s.money} prefix="KSh " />
                  ) : (
                    s.value
                  )}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">{s.sub}</p>
              </div>
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl",
                  s.accent ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-600"
                )}
              >
                <s.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl border-neutral-200 bg-white text-neutral-900 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-semibold">
                <IconMic className="h-5 w-5 text-orange-500" /> {"Recent Calls"}
              </CardTitle>
              <CardDescription className="text-neutral-600">
                <span className="text-neutral-900">{"AI call history for this business. Transcripts are saved only when recording is enabled."}</span>
              </CardDescription>
            </div>
            <Badge className="border-orange-200 bg-orange-50 text-orange-700">
              {ongoingCalls.length} active
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="live-scroll max-h-64 space-y-3 overflow-y-auto pr-2">
              {recentCalls.length === 0 && <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 py-8 text-center text-sm text-neutral-600">No AI calls yet. Publish a receptionist in Phone & AI and complete a test call to see real activity here.</p>}
              {recentCalls.map((call) => {
                const data = call.structured_data || {};
                const number = call.direction === "outbound" ? (call.to_number || call.from_number) : (call.from_number || call.to_number);
                const callState = String(call.status || "unknown").toLowerCase();
                const label = firstCallDetail(data, ["customer_name", "caller_name", "customer", "name"]) || (call.direction === "outbound" ? "Outgoing call" : "Incoming caller");
                const intent = firstCallDetail(data, ["enquiry_type", "intent", "reason", "purpose", "request_type"]) || (call.channel === "phone" ? "Phone enquiry" : call.channel || "Call");
                const request = firstCallDetail(data, ["customer_request", "requested_service", "service_name", "requested_product", "product_name", "items", "order_items", "enquiry", "subject"]);
                const appointment = callFlag(data, ["appointment_request", "appointment_start_iso", "booking_requested", "appointment_id"]);
                const order = callFlag(data, ["order_created", "order_request", "order_id", "order_items"]);
                const callback = callFlag(data, ["callback_requested", "requested_callback", "follow_up_requested", "needs_callback"]);
                const handover = callFlag(data, ["handover_requested", "transfer_requested", "needs_staff", "human_required"]);
                const appointmentWhen = firstCallDetail(data, ["appointment_date", "booking_date", "appointment_time", "booking_time", "appointment_start_iso"]);
                const statusLabel = ["completed", "ended"].includes(callState) ? "Completed" : callState === "in_progress" || callState === "ringing" ? "In progress" : callState.replaceAll("_", " ");
                return <div key={call.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-950">{label}</p>
                      <p className="mt-1 text-xs text-neutral-600">{number || "Number unavailable"} · {call.direction === "outbound" ? "Outgoing" : "Incoming"} · {new Date(call.started_at || call.created_at).toLocaleString()}</p>
                      <p className="mt-1 text-xs font-medium text-orange-700">{intent}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-neutral-600">{formatDuration(Number(call.duration_seconds || 0))}</span>
                      <Badge className={cn("border", ["completed", "ended"].includes(callState) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ["in_progress", "ringing"].includes(callState) ? "border-orange-200 bg-orange-50 text-orange-700" : "border-neutral-200 bg-neutral-100 text-neutral-700")}>{statusLabel}</Badge>
                    </div>
                  </div>
                  {(request || appointment || order || callback || handover) && <div className="mt-3 flex flex-wrap gap-1.5">
                    {request && <Badge className="border-neutral-200 bg-neutral-50 text-neutral-700">Asked: {request}</Badge>}
                    {appointment && <Badge className="border-orange-200 bg-orange-50 text-orange-800">Booking</Badge>}
                    {order && <Badge className="border-orange-200 bg-orange-50 text-orange-800">Order</Badge>}
                    {callback && <Badge className="border-neutral-200 bg-neutral-100 text-neutral-700">Callback requested</Badge>}
                    {handover && <Badge className="border-neutral-200 bg-neutral-100 text-neutral-700">Staff follow-up</Badge>}
                  </div>}
                  {appointmentWhen && <p className="mt-2 text-xs text-neutral-600">Requested appointment: {appointmentWhen}</p>}
                  {call.summary && <p className="mt-3 rounded-xl bg-neutral-50 px-3 py-2.5 text-sm leading-5 text-neutral-700">{call.summary}</p>}
                  {!call.summary && !request && <p className="mt-3 text-xs text-neutral-500">No call summary or structured customer request was saved for this call.</p>}
                </div>;
              })}
            </div>
            <div className="grid grid-cols-3 gap-3 border-t border-neutral-200 pt-4">
              <MiniStat label="Call records" value={String(callRecords.length)} />
              <MiniStat label="Completed" value={String(callRecords.filter((call) => String(call.status).toLowerCase() === "completed").length)} />
              <MiniStat label="Avg. call" value={formatDuration(averageDuration)} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-neutral-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <IconTrend className="h-5 w-5 text-orange-500" /> AI Outputs
            </CardTitle>
            <CardDescription>Everything it produced today</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {outputs.map((o) => (
              <div
                key={o.label}
                className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-3 py-2.5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg",
                      o.tone === "orange"
                        ? "bg-orange-50 text-orange-500"
                        : "bg-neutral-100 text-neutral-700"
                    )}
                  >
                    <o.icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm text-neutral-700">{o.label}</span>
                </div>
                <span className="text-lg font-bold text-neutral-900">{o.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl border-neutral-200 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-semibold">
                <IconSparkle className="h-5 w-5 text-orange-500" /> Task Log
              </CardTitle>
              <CardDescription>Your owner and staff action list, based on this business’s actual activity</CardDescription>
            </div>
            <Badge className="border-neutral-200 bg-neutral-100 text-neutral-700">{workerTasks.length} owner actions</Badge>
          </CardHeader>
          <CardContent className="space-y-5">
            {workerError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{workerError}</p>}
            {priorityGroups.map((group) => (
              <section key={group.key} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div><h3 className="text-sm font-bold text-neutral-900">{group.label}</h3><p className="text-xs text-neutral-500">{group.hint}</p></div>
                  <Badge className={cn("border", group.tone)}>{group.tasks.length}</Badge>
                </div>
                {group.tasks.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.tasks.map((task) => {
                      const priority = normaliseTaskPriority(task.priority);
                      const priorityTone = priority === "high" ? "border-red-200 bg-red-50 text-red-800" : priority === "medium" ? "border-orange-200 bg-orange-50 text-orange-800" : "border-neutral-200 bg-neutral-100 text-neutral-700";
                      const statusLabel = task.status === "failed" ? "Needs attention" : task.status === "pending" ? "Queued" : "Awaiting review";
                      const dueLabel = task.due_at ? new Date(task.due_at).toLocaleString() : task.created_at ? new Date(task.created_at).toLocaleDateString() : "No due date set";
                      return (
                        <article key={task.id} className="flex min-h-[170px] flex-col rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Badge className="border border-neutral-200 bg-neutral-50 text-neutral-700">{ownerTaskCategory(task)}</Badge>
                            <Badge className={cn("border", priorityTone)}>{priority} priority</Badge>
                          </div>
                          <h4 className="mt-3 text-sm font-semibold leading-5 text-neutral-950">{task.title}</h4>
                          <p className="mt-1 flex-1 whitespace-pre-wrap text-xs leading-5 text-neutral-600">{task.detail || "Review this item with the relevant staff member."}</p>
                          <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-100 pt-3">
                            <span className="text-[11px] text-neutral-500">{statusLabel} · {dueLabel}</span>
                            <Button size="sm" variant="outline" onClick={() => void resolveWorkerTask(task.id)} className="shrink-0 border-neutral-300 text-neutral-800">Mark reviewed</Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-3 py-4 text-xs text-neutral-500">No {group.key}-priority owner actions at the moment.</p>}
              </section>
            ))}
            {workerTasks.length === 0 && <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center"><p className="text-sm font-semibold text-neutral-900">{workerLoading ? "Checking your owner tasks…" : "No owner actions are waiting for review"}</p><p className="mt-1 text-xs leading-5 text-neutral-600">Run a TWIGA Worker review to check recent orders, unpaid balances and stock records for work that needs your attention.</p><Button onClick={() => void runBusinessWorkerReview()} disabled={workerLoading || workerRunning || !businessId} className="mt-3 bg-neutral-950 text-white hover:bg-neutral-800">{workerRunning ? "Reviewing…" : "Run business review"}</Button></div>}
            {tasks.length > 0 && (
              <section className="space-y-3 border-t border-neutral-200 pt-5">
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-neutral-900">Workspace activity</h3><p className="text-xs text-neutral-500">Recorded actions and updates from the workspace</p></div><Badge className="border-neutral-200 bg-neutral-100 text-neutral-700">{tasks.length} events</Badge></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tasks.map((task) => {
                    const meta = statusMeta[task.status];
                    const Icon = meta.icon;
                    return <div key={task.id} className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-3"><span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", meta.chip)}><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-neutral-900">{task.label}</p><p className="mt-1 text-xs leading-5 text-neutral-600">{task.detail}</p><p className="mt-2 text-[11px] text-neutral-500">{task.time} · {meta.label}</p></div>{task.status !== "done" && <Button size="sm" variant="outline" onClick={() => completeTask(task.id)} className="shrink-0 border-neutral-300 text-neutral-800">Resolve</Button>}</div>;
                  })}
                </div>
              </section>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl border-neutral-200 bg-white text-neutral-900 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <IconSwap className="h-5 w-5 text-orange-500" /> What it handles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {capabilities.map((c) => (
                <div
                  key={c.label}
                  className="flex items-center gap-3 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 transition-colors hover:border-orange-200 hover:bg-orange-50"
                >
                  <c.icon className="h-4 w-4 text-orange-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-neutral-500">{c.detail}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-orange-200 bg-orange-50 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <IconBulb className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  AI suggestion
                </p>
                <p className="mt-0.5 text-xs text-neutral-600">
                  {dueFollowUps} customers are due for a follow-up. Send a win-back
                  offer to recover at-risk revenue.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-neutral-200 shadow-sm">
            <CardContent className="flex items-center gap-3 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
                <IconBell className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  Owner digest ready
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  WhatsApp summary of today's calls &amp; sales
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-sm font-semibold text-neutral-900">{value}</p>
    </div>
  );
}