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


type WorkerTask = { id: string; title: string; detail: string; status: string; priority: string; };
type WorkerNotification = { id: string; title: string; body: string; created_at: string; priority: string; };
type WorkerOverview = {
  worker: { enabled: boolean; schedule: string; nextReviewAt?: string | null; lastReviewAt?: string | null; };
  tasks: WorkerTask[];
  notifications: WorkerNotification[];
  counts: { needsReview: number; failed: number; };
};

async function businessWorkerRequest(businessId: string, action: string, extra: Record<string, unknown> = {}) {
  if (!supabase) throw new Error("TWIGA is not connected.");
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("Sign in again to use your business Worker.");
  const response = await fetch("https://twiga-api.twiga-ke.workers.dev/ai/worker", {
    method: "POST",
    headers: {"Content-Type":"application/json", "Authorization":"Bearer " + token},
    body: JSON.stringify({action:action,business_id:businessId,token:token,...extra})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(String(result.error || "The business Worker could not respond."));
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
          {workerOverview?.tasks?.length ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Work waiting for you</p>
              {workerOverview.tasks.slice(0,3).map((task) => (
                <div key={task.id} className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-950">{task.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-neutral-600">{task.detail}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void resolveWorkerTask(task.id)} className="border-neutral-300 text-neutral-800">Mark reviewed</Button>
                </div>
              ))}
            </div>
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
                const number = call.direction === "outbound" ? (call.to_number || call.from_number) : (call.from_number || call.to_number);
                const callState = String(call.status || "unknown").toLowerCase();
                const label = String(call.structured_data?.customer_name || "Caller");
                const intent = String(call.structured_data?.enquiry_type || call.structured_data?.intent || call.channel || "Call");
                return <div key={call.id} className="rounded-xl border border-neutral-100 bg-white p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0"><p className="text-sm font-semibold">{label}</p><p className="text-xs text-neutral-600">{number || "Number unavailable"} · {intent} · {new Date(call.started_at || call.created_at).toLocaleString()}</p></div>
                    <div className="flex items-center gap-3"><span className="font-mono text-sm text-orange-600">{formatDuration(Number(call.duration_seconds || 0))}</span><Badge className={cn("border", callState === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : callState === "in_progress" ? "border-orange-200 bg-orange-50 text-orange-700" : "border-neutral-200 bg-neutral-100 text-neutral-700")}>{callState.replaceAll("_", " ")}</Badge></div>
                  </div>
                  {call.summary && <p className="mt-2 text-xs leading-5 text-neutral-700">{call.summary}</p>}
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
              <CardDescription>Everything your AI receptionist did</CardDescription>
            </div>
            <Badge className="border-neutral-200 bg-neutral-100 text-neutral-700">
              {tasks.length} events
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {tasks.map((t) => {
              const meta = statusMeta[t.status];
              const Icon = meta.icon;
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-white px-4 py-3 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                      meta.chip
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {t.label}
                    </p>
                    <p className="truncate text-xs text-neutral-500">{t.detail}</p>
                  </div>
                  <span className="hidden text-xs text-neutral-400 sm:block">
                    {t.time}
                  </span>
                  {t.status !== "done" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => completeTask(t.id)}
                      className="border-neutral-200 text-neutral-700 hover:bg-orange-50 hover:text-orange-600"
                    >
                      Resolve
                    </Button>
                  )}
                </div>
              );
            })}
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