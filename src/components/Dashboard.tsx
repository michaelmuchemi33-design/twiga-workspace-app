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
    chip: "border-neutral-900 bg-neutral-950 text-white",
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

export default function Dashboard({ onSetup }: { onSetup: () => void }) {
  const {
    tasks,
    sales,
    payments,
    customers,
    messages,
    liveCalls,
    callRecords,
    completeTask,
    demoMode,
    settings,
  } = useStore();
  const [ownerName, setOwnerName] = useState("");

  useEffect(() => {
    if (demoMode || !supabase) return;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setOwnerName(String(data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || ""));
    });
    return () => { active = false; };
  }, [demoMode]);

  const revenue = sales.reduce((s, x) => s + x.total, 0);
  const dueFollowUps = customers.filter((c) => c.followUpIn === 0).length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const failedTasks = tasks.filter((t) => t.status === "failed").length;

  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: settings.business.timezone || "Africa/Nairobi" });
  const callsToday = demoMode ? 23 : callRecords.filter((c) => new Date(c.started_at || c.created_at).toLocaleDateString("en-CA", { timeZone: settings.business.timezone || "Africa/Nairobi" }) === todayKey).length;
  const callsHandled = demoMode ? 149 : callRecords.filter((c) => Date.now() - new Date(c.started_at || c.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000).length;
  const bookings = demoMode ? 8 : callRecords.filter((c) => Boolean(c.structured_data?.appointment_request || c.structured_data?.appointment_start_iso)).length;
  const ongoingCalls = callRecords.filter((c) => ["in_progress", "ringing", "ongoing"].includes(String(c.status).toLowerCase()));
  const recentCalls = callRecords.slice(0, 8);
  const averageDuration = callRecords.length ? Math.round(callRecords.reduce((sum, c) => sum + Number(c.duration_seconds || 0), 0) / callRecords.length) : 0;
  const formatDuration = (seconds: number) => seconds >= 60 ? Math.floor(seconds / 60) + "m " + String(seconds % 60).padStart(2, "0") + "s" : seconds + "s";
  const leads = demoMode ? 5 : customers.length;

  const stats = [
    { label: "Calls handled today", value: `${callsToday}`, sub: `${callsHandled} this week`, icon: IconPhone, accent: true },
    { label: "Ongoing calls", value: `${demoMode ? liveCalls.length : ongoingCalls.length}`, sub: "in progress now", icon: IconMic },
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
            AI Front Desk
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            {ownerName ? `Welcome, ${ownerName}` : settings.business.name ? `Welcome, ${settings.business.name}` : "Your workspace"}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {settings.business.name ? `${settings.business.name} · ` : ""}Your receptionist handled {doneTasks} tasks today · {pendingTasks} pending · {failedTasks} failed
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div className="flex items-center gap-3 rounded-xl bg-neutral-950 px-4 py-3 text-white">
            <span className={`h-2.5 w-2.5 rounded-full ${demoMode ? "bg-orange-500" : "bg-neutral-500"}`} />
            <span className="text-sm font-medium">{demoMode ? "Sample activity" : "Workspace ready"}</span>
          </div>

          <button
            onClick={onSetup}
            className="flex items-center gap-3 rounded-xl bg-neutral-950 px-4 py-3 text-white transition-all duration-200 hover:bg-neutral-800 active:scale-95"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            <span className="text-sm font-medium">Set up with AI</span>
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card
            key={s.label}
            className={cn(
              "rounded-2xl shadow-sm",
              s.accent ? "border-orange-200 bg-orange-50" : "border-neutral-200"
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
                  s.accent ? "bg-orange-500 text-white" : "bg-neutral-950 text-white"
                )}
              >
                <s.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-lg lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-semibold">
                <IconMic className="h-5 w-5 text-orange-500" /> {demoMode ? "Live Calls" : "Recent Calls"}
              </CardTitle>
              <CardDescription className="text-neutral-400">
                {demoMode ? "Illustrative sample activity — not real calls" : "Retell call history for this business. Transcripts are saved only when recording is enabled."}
              </CardDescription>
            </div>
            <Badge className="border-orange-500/30 bg-orange-500/20 text-orange-400">
              {demoMode ? liveCalls.length : ongoingCalls.length} active
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {demoMode ? (
              <>
                {liveCalls.length === 0 && <p className="rounded-xl border border-dashed border-neutral-700 py-8 text-center text-sm text-neutral-500">No calls in progress — the line is open</p>}
                <div className="live-scroll max-h-64 space-y-3 overflow-y-auto pr-2">
                  {liveCalls.map((call, i) => (
                    <div key={call.id} style={{ animationDelay: `${i * 70}ms` }} className="live-row flex flex-col gap-3 rounded-xl bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white"><IconPhone className="h-4 w-4" /></span><div><p className="text-sm font-semibold">{call.caller}</p><p className="text-xs text-neutral-400">{call.phone} · {call.intent}</p></div></div>
                      <div className="flex items-center gap-4"><span className="font-mono text-sm text-orange-400">{call.duration}</span><Badge className={cn("border", call.sentiment === "positive" ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-400" : call.sentiment === "negative" ? "border-red-500/30 bg-red-500/20 text-red-400" : "border-neutral-600 bg-white/10 text-neutral-300")}>{call.sentiment}</Badge></div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="live-scroll max-h-64 space-y-3 overflow-y-auto pr-2">
                {recentCalls.length === 0 && <p className="rounded-xl border border-dashed border-neutral-700 py-8 text-center text-sm text-neutral-500">No Retell calls yet. Publish a receptionist in Profile → AI Front Desk, then test it.</p>}
                {recentCalls.map((call) => {
                  const number = call.direction === "outbound" ? (call.to_number || call.from_number) : (call.from_number || call.to_number);
                  const status = String(call.status || "unknown").toLowerCase();
                  const label = String(call.structured_data?.customer_name || "Caller");
                  const intent = String(call.structured_data?.enquiry_type || call.structured_data?.intent || call.channel || "Call");
                  return <div key={call.id} className="rounded-xl bg-white/5 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><p className="text-sm font-semibold">{label}</p><p className="text-xs text-neutral-400">{number || "Number unavailable"} · {intent} · {new Date(call.started_at || call.created_at).toLocaleString()}</p></div>
                      <div className="flex items-center gap-3"><span className="font-mono text-sm text-orange-400">{formatDuration(Number(call.duration_seconds || 0))}</span><Badge className={cn("border", status === "completed" ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-400" : status === "in_progress" ? "border-orange-500/30 bg-orange-500/20 text-orange-300" : "border-neutral-600 bg-white/10 text-neutral-300")}>{status.replaceAll("_", " ")}</Badge></div>
                    </div>
                    {call.summary && <p className="mt-2 text-xs leading-5 text-neutral-300">{call.summary}</p>}
                  </div>;
                })}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
              {demoMode ? <><MiniStat label="Avg. call" value="1m 12s" /><MiniStat label="Answered" value="98%" /><MiniStat label="Transferred" value="2" /></> : <><MiniStat label="Call records" value={String(callRecords.length)} /><MiniStat label="Completed" value={String(callRecords.filter((call) => String(call.status).toLowerCase() === "completed").length)} /><MiniStat label="Avg. call" value={formatDuration(averageDuration)} /></>}
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
                        : "bg-neutral-950 text-white"
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
            <Badge className="border-neutral-900 bg-neutral-950 text-white">
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
          <Card className="rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <IconSwap className="h-5 w-5 text-orange-500" /> What it handles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {capabilities.map((c) => (
                <div
                  key={c.label}
                  className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 transition-colors hover:bg-white/10"
                >
                  <c.icon className="h-4 w-4 text-orange-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-neutral-400">{c.detail}</p>
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
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-950 text-white">
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
    <div className="rounded-lg bg-white/5 px-3 py-2">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}