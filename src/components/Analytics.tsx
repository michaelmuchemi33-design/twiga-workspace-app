import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useStore } from "@/lib/store";
import { IconChart, IconTrend, IconPhone, IconCard, IconUsers } from "@/components/Icons";

function recordDate(record: any): Date | null {
  const raw = record?.created_at || record?.createdAt || record?.started_at || record?.timestamp || record?.date;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function Analytics() {
  const { sales, payments, tasks, customers, callRecords } = useStore();
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const collected = payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
  const doneTasks = tasks.filter((task) => task.status === "done").length;
  const conversion = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0;
  const completedCalls = callRecords.filter((call) => String(call.status || "").toLowerCase() === "completed");
  const averageCallSeconds = completedCalls.length ? Math.round(completedCalls.reduce((sum, call) => sum + Number(call.duration_seconds || 0), 0) / completedCalls.length) : 0;
  const formatDuration = (seconds: number) => seconds >= 60 ? Math.floor(seconds / 60) + "m " + String(seconds % 60).padStart(2, "0") + "s" : seconds + "s";

  const data = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - index));
      const key = day.toLocaleDateString("en-CA");
      const daySales = sales.filter((sale) => recordDate(sale)?.toLocaleDateString("en-CA") === key);
      const dayCalls = callRecords.filter((call) => recordDate(call)?.toLocaleDateString("en-CA") === key && String(call.status || "").toLowerCase() === "completed");
      return { day: day.toLocaleDateString(undefined, { weekday: "short" }), revenue: daySales.reduce((sum, sale) => sum + sale.total, 0), calls: dayCalls.length };
    });
  }, [sales, callRecords]);

  const kpis = [
    { label: "Tasks completed", value: `${doneTasks}/${tasks.length}`, icon: IconTrend, accent: true },
    { label: "Calls handled", value: String(completedCalls.length), icon: IconPhone },
    { label: "Payments collected", value: `KSh ${collected.toLocaleString()}`, icon: IconCard },
    { label: "Customers", value: String(customers.length), icon: IconUsers },
  ];

  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{kpis.map((k) => <Card key={k.label} className={k.accent ? "rounded-2xl border-orange-200 bg-orange-50 shadow-sm" : "rounded-2xl border-neutral-200 bg-white shadow-sm"}><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs font-medium uppercase tracking-wide text-neutral-600">{k.label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-neutral-950">{k.value}</p></div><div className={k.accent ? "flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white" : "flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-950 text-white"}><k.icon className="h-5 w-5" /></div></CardContent></Card>)}</div>
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="rounded-2xl border-neutral-200 bg-white shadow-sm lg:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2 text-xl font-semibold text-neutral-950"><IconChart className="h-5 w-5 text-orange-600" /> Weekly Performance</CardTitle><CardDescription className="text-neutral-600">Revenue and completed calls from dated business records</CardDescription></CardHeader><CardContent><div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} barGap={6}><CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="#525252" /><YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#525252" /><Tooltip cursor={{ fill: "#fafafa" }} contentStyle={{ borderRadius: 12, border: "1px solid #e5e5e5", fontSize: 12 }} /><Bar dataKey="revenue" fill="#f97316" radius={[6, 6, 0, 0]} /><Bar dataKey="calls" fill="#171717" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>{(sales.length > 0 || callRecords.length > 0) && data.every((day) => day.revenue === 0 && day.calls === 0) && <p className="mt-2 text-xs text-neutral-600">Your records do not include usable dates for this weekly chart yet. Summary totals above still use the saved records.</p>}</CardContent></Card>
      <Card className="rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-lg"><CardHeader><CardTitle className="flex items-center gap-2 text-lg font-semibold text-white"><IconTrend className="h-5 w-5 text-orange-500" /> Resolution Rate</CardTitle><CardDescription className="text-neutral-300">Tasks your AI closed out</CardDescription></CardHeader><CardContent className="space-y-6"><div className="flex items-end gap-2"><span className="text-5xl font-bold tracking-tight text-orange-400">{conversion}%</span><span className="pb-2 text-sm text-neutral-300">completed</span></div><div className="h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${conversion}%` }} /></div><div className="space-y-3 border-t border-white/10 pt-4 text-sm"><Row label="Revenue recorded" value={`KSh ${revenue.toLocaleString()}`} /><Row label="Collected" value={`KSh ${collected.toLocaleString()}`} /><Row label="Average call duration" value={completedCalls.length ? formatDuration(averageCallSeconds) : "No completed calls yet"} /></div></CardContent></Card>
    </div>
  </div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between"><span className="text-neutral-300">{label}</span><span className="font-medium text-white">{value}</span></div>;
}