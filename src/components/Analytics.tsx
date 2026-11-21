import { useMemo, type ComponentType, type SVGProps } from "react";
import { useStore } from "@/lib/store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  IconChart,
  IconTrend,
  IconPhone,
  IconCard,
  IconUsers,
  IconCoin,
  IconCalendar,
  IconCheck,
  IconClock,
  IconX,
  IconSparkle,
} from "@/components/Icons";

const money = (amount: number, currency: string) =>
  currency + " " + Math.round(amount).toLocaleString("en-KE");

const percent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export default function Analytics() {
  const { sales, payments, tasks, customers, callRecords, settings } = useStore();
  const currency = settings.business.currency || "KSh";

  const revenue = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const collected = payments.filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const awaitingPayment = payments.filter((payment) => payment.status === "pending")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const pendingTasks = tasks.filter((task) => task.status === "pending").length;
  const failedTasks = tasks.filter((task) => task.status === "failed").length;
  const resolvedTasks = completedTasks + pendingTasks + failedTasks;
  const completionRate = resolvedTasks ? percent((completedTasks / resolvedTasks) * 100) : 0;

  const completedCalls = callRecords.filter((call) => ["completed", "ended"].includes(String(call.status || "").toLowerCase())).length;
  const missedCalls = callRecords.filter((call) => ["missed", "no_answer", "failed"].includes(String(call.status || "").toLowerCase())).length;
  const liveCalls = callRecords.filter((call) => ["in_progress", "ringing", "ongoing"].includes(String(call.status || "").toLowerCase())).length;
  const averageDuration = callRecords.length
    ? Math.round(callRecords.reduce((sum, call) => sum + Number(call.duration_seconds || 0), 0) / callRecords.length)
    : 0;
  const durationLabel = averageDuration >= 60
    ? Math.floor(averageDuration / 60) + "m " + String(averageDuration % 60).padStart(2, "0") + "s"
    : averageDuration + "s";

  const weeklyData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = date.toLocaleDateString("en-CA", { timeZone: settings.business.timezone || "Africa/Nairobi" });
      return {
        key,
        day: date.toLocaleDateString("en-KE", { weekday: "short", timeZone: settings.business.timezone || "Africa/Nairobi" }),
        calls: 0,
      };
    });
    for (const call of callRecords) {
      const stamp = call.started_at || call.created_at;
      if (!stamp) continue;
      const key = new Date(stamp).toLocaleDateString("en-CA", { timeZone: settings.business.timezone || "Africa/Nairobi" });
      const row = days.find((item) => item.key === key);
      if (row) row.calls += 1;
    }
    return days;
  }, [callRecords, payments, settings.business.timezone]);

  const kpis = [
    {
      label: "Sales recorded",
      value: money(revenue, currency),
      detail: sales.length + " sales in this workspace",
      icon: IconCoin,
      tone: "orange",
    },
    {
      label: "Payments collected",
      value: money(collected, currency),
      detail: awaitingPayment > 0 ? money(awaitingPayment, currency) + " still pending" : "No pending payments recorded",
      icon: IconCard,
      tone: "dark",
    },
    {
      label: "Calls recorded",
      value: String(callRecords.length),
      detail: completedCalls + " completed · " + missedCalls + " missed / failed",
      icon: IconPhone,
      tone: "light",
    },
    {
      label: "Customers",
      value: String(customers.length),
      detail: "Customer records in this business",
      icon: IconUsers,
      tone: "light",
    },
  ];

  const latestCalls = callRecords.slice(0, 4);
  const formatDuration = (seconds: number) =>
    seconds >= 60
      ? Math.floor(seconds / 60) + "m " + String(seconds % 60).padStart(2, "0") + "s"
      : seconds + "s";

  return (
    <div className="space-y-6 text-neutral-900 dark:text-neutral-100">
      <header className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-orange-700 dark:text-orange-400">Business intelligence</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-100 sm:text-3xl">Stats & performance</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-neutral-300">See what your receptionist, sales and team activity have recorded for this business.</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-700 sm:self-auto dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200">
          <IconChart className="h-4 w-4 text-orange-500" /> Live workspace records
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <Card key={item.label} className="rounded-2xl border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
            <CardContent className="flex min-h-[132px] items-start justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{item.label}</p>
                <p className="mt-2 break-words text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-100">{item.value}</p>
                <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">{item.detail}</p>
              </div>
              <span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " + (item.tone === "orange" ? "bg-orange-500 text-white" : item.tone === "dark" ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950" : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200")}>
                <item.icon className="h-5 w-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,.85fr)]">
        <Card className="rounded-2xl border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-bold text-neutral-950 dark:text-neutral-100">
                <IconChart className="h-5 w-5 text-orange-500" /> Weekly activity
              </CardTitle>
              <CardDescription className="mt-1 text-neutral-500 dark:text-neutral-400">Calls saved for each day in the last seven days</CardDescription>
            </div>
            <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">7 days</span>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-4 text-xs text-neutral-600 dark:text-neutral-300">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> Calls recorded</span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData} barGap={5} margin={{ top: 8, right: 8, left: -18, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="#737373" />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="#737373" />
                  <Tooltip
                    cursor={{ fill: "#f5f5f5", fillOpacity: 0.7 }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e5e5", fontSize: 12, background: "#ffffff", color: "#171717" }}
                    labelStyle={{ color: "#171717", fontWeight: 700 }}
                  />
                  <Bar dataKey="calls" name="Calls recorded" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-sm dark:border-neutral-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-white">
              <IconTrend className="h-5 w-5 text-orange-400" /> Task completion
            </CardTitle>
            <CardDescription className="text-neutral-400">Workspace activity marked as done</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex items-end gap-2">
                <span className="text-5xl font-bold tracking-tight text-orange-400">{completionRate}%</span>
                <span className="pb-2 text-xs text-neutral-400">completed</span>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: completionRate + "%" }} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
              <div><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Done</p><p className="mt-1 text-xl font-bold text-white">{completedTasks}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Pending</p><p className="mt-1 text-xl font-bold text-white">{pendingTasks}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Failed</p><p className="mt-1 text-xl font-bold text-white">{failedTasks}</p></div>
            </div>
            {resolvedTasks === 0 && <p className="text-xs text-neutral-400">No task activity has been recorded yet.</p>}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-2xl border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-neutral-950 dark:text-neutral-100">
              <IconCard className="h-5 w-5 text-orange-500" /> Money snapshot
            </CardTitle>
            <CardDescription className="text-neutral-500 dark:text-neutral-400">Totals from recorded sales and payment entries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950">
              <div><p className="text-xs text-neutral-500 dark:text-neutral-400">Sales total</p><p className="mt-1 text-xl font-bold text-neutral-950 dark:text-neutral-100">{money(revenue, currency)}</p></div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300"><IconCoin className="h-5 w-5" /></span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"><p className="text-xs text-neutral-500 dark:text-neutral-400">Collected</p><p className="mt-1 text-lg font-bold text-neutral-950 dark:text-neutral-100">{money(collected, currency)}</p><p className="mt-1 text-[11px] text-neutral-500">{payments.filter((p) => p.status === "paid").length} paid entries</p></div>
              <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"><p className="text-xs text-neutral-500 dark:text-neutral-400">Awaiting payment</p><p className="mt-1 text-lg font-bold text-neutral-950 dark:text-neutral-100">{money(awaitingPayment, currency)}</p><p className="mt-1 text-[11px] text-neutral-500">{payments.filter((p) => p.status === "pending").length} pending entries</p></div>
            </div>
            <p className="text-[11px] leading-5 text-neutral-500 dark:text-neutral-400">Sales totals and recorded payment collections are separate figures. TWIGA does not treat an unpaid order as money collected.</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-neutral-950 dark:text-neutral-100">
              <IconPhone className="h-5 w-5 text-orange-500" /> Call outcomes
            </CardTitle>
            <CardDescription className="text-neutral-500 dark:text-neutral-400">What the call log currently contains</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <OutcomeRow icon={IconCheck} label="Completed / ended" value={completedCalls} tone="orange" />
            <OutcomeRow icon={IconX} label="Missed / failed" value={missedCalls} tone="neutral" />
            <OutcomeRow icon={IconClock} label="Currently active" value={liveCalls} tone="neutral" />
            <div className="mt-2 flex items-center justify-between border-t border-neutral-200 pt-3 text-xs dark:border-neutral-800">
              <span className="text-neutral-500 dark:text-neutral-400">Average recorded call</span>
              <strong className="text-neutral-900 dark:text-neutral-100">{durationLabel}</strong>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-2xl border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-neutral-950 dark:text-neutral-100"><IconSparkle className="h-5 w-5 text-orange-500" /> Recent recorded calls</CardTitle>
            <CardDescription className="text-neutral-500 dark:text-neutral-400">Latest call summaries saved for this business</CardDescription>
          </div>
          <span className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">{latestCalls.length} shown</span>
        </CardHeader>
        <CardContent className="space-y-2">
          {latestCalls.length === 0 && <p className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950">No calls have been recorded yet. Calls will appear here after the receptionist provider reports them to TWIGA.</p>}
          {latestCalls.map((call) => (
            <div key={call.id} className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3 sm:flex-row sm:items-start sm:justify-between dark:border-neutral-800">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-950 dark:text-neutral-100">{call.structured_data?.customer_name ? String(call.structured_data.customer_name) : call.direction === "outbound" ? "Outgoing call" : "Incoming caller"}</p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{call.from_number || call.to_number || "Number unavailable"} · {call.direction || "Call"} · {new Date(call.started_at || call.created_at).toLocaleString()}</p>
                {call.summary && <p className="mt-2 text-xs leading-5 text-neutral-600 dark:text-neutral-300">{call.summary}</p>}
              </div>
              <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">{String(call.status || "unknown").replaceAll("_", " ")}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs leading-5 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
        <IconCalendar className="h-4 w-4 shrink-0 text-orange-500" />
        Stats are calculated from this business's saved workspace records. Empty sections mean no corresponding activity has been recorded yet.
      </div>
    </div>
  );
}

function OutcomeRow({ icon: Icon, label, value, tone }: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: number;
  tone: "orange" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-3 dark:border-neutral-800">
      <div className="flex items-center gap-3">
        <span className={"flex h-9 w-9 items-center justify-center rounded-lg " + (tone === "orange" ? "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300" : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200")}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{label}</span>
      </div>
      <span className="text-lg font-bold tabular-nums text-neutral-950 dark:text-neutral-100">{value}</span>
    </div>
  );
}
