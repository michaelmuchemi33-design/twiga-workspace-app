import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import AnimatedNumber from "@/components/AnimatedNumber";
import { IconFile, IconCoin, IconCart, IconCard, IconChart, IconTrend, IconPhone } from "@/components/Icons";

function recordDate(record: any): Date | null {
  const raw = record?.created_at || record?.createdAt || record?.timestamp || record?.date;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function Reports() {
  const { sales, tasks, products, settings, businessId } = useStore();
  const [providerTransactions, setProviderTransactions] = useState<any[]>([]);
  const [transactionError, setTransactionError] = useState("");
  const [period, setPeriod] = useState<"day" | "week" | "month" | "all">("month");
  const currency = settings.business.currency;
  const inPeriod = (record: any) => {
    if (period === "all") return true;
    const date = recordDate(record);
    if (!date) return false;
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (period === "week") start.setDate(start.getDate() - 6);
    if (period === "month") start.setDate(1);
    return date >= start && date <= now;
  };
  useEffect(() => {
    if (!supabase || !businessId) { setProviderTransactions([]); return; }
    let active = true;
    void supabase.from("twiga_palpluss_transactions")
      .select("id,transaction_id,customer_name,phone,status,amount,currency,created_at,mpesa_receipt")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setTransactionError("Payment transaction history could not be loaded."); return; }
        setTransactionError("");
        setProviderTransactions(data || []);
      });
    return () => { active = false; };
  }, [businessId]);

  const filteredSales = sales.filter(inPeriod);
  const filteredPayments = providerTransactions.filter(inPeriod);
  const revenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const collected = filteredPayments.filter((payment) => ["success", "paid"].includes(String(payment.status).toLowerCase())).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const outstanding = filteredPayments.filter((payment) => ["pending", "processing"].includes(String(payment.status).toLowerCase())).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const doneTasks = tasks.filter((task) => task.status === "done").length;

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    filteredSales.forEach((sale) => sale.lines.forEach((line) => {
      const current = map.get(line.productId) ?? { name: line.name, qty: 0, revenue: 0 };
      current.qty += line.qty;
      current.revenue += line.price * line.qty;
      map.set(line.productId, current);
    }));
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [filteredSales]);

  const chartData = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - index));
      const key = day.toLocaleDateString("en-CA");
      const daySales = filteredSales.filter((sale) => {
        const date = recordDate(sale);
        return date?.toLocaleDateString("en-CA") === key;
      });
      return { day: day.toLocaleDateString(undefined, { weekday: "short" }), revenue: daySales.reduce((sum, sale) => sum + sale.total, 0), sales: daySales.length };
    });
  }, [filteredSales]);

  const kpis = [
    { label: "Revenue", value: revenue, icon: IconCoin, accent: true, money: true },
    { label: "Collected", value: collected, icon: IconCard, money: true },
    { label: "Outstanding", value: outstanding, icon: IconTrend, money: true },
    { label: "Transactions", value: filteredPayments.length, icon: IconChart },
    { label: "Tasks done", value: `${doneTasks}/${tasks.length}`, icon: IconChart },
  ];

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Insights</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-950">Reports</h1><p className="mt-1 text-sm text-neutral-600">Actual sales, collections and business activity recorded in this workspace</p></div>
      <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3"><IconFile className="h-5 w-5 text-orange-600" /><div><p className="text-xs font-medium uppercase tracking-wide text-neutral-600">Catalog</p><p className="text-lg font-bold text-orange-700">{products.length} items</p></div></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3"><p className="text-sm font-semibold text-neutral-800">Report period</p><div className="flex flex-wrap gap-2">{([{key:"day",label:"Today"},{key:"week",label:"This week"},{key:"month",label:"This month"},{key:"all",label:"All time"}] as const).map((item) => <button key={item.key} onClick={() => setPeriod(item.key)} className={cn("rounded-lg px-3 py-2 text-xs font-semibold transition-colors", period === item.key ? "bg-neutral-950 text-white" : "border border-neutral-200 bg-white text-neutral-600 hover:border-orange-300")}>{item.label}</button>)}</div></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {kpis.map((k) => <Card key={k.label} className={cn("rounded-2xl shadow-sm", k.accent ? "border-orange-200 bg-orange-50" : "border-neutral-200 bg-white")}><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs font-medium uppercase tracking-wide text-neutral-600">{k.label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-neutral-950">{k.money ? <AnimatedNumber value={k.value as number} prefix={`${currency} `} /> : k.value}</p></div><div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", k.accent ? "bg-orange-500 text-white" : "bg-neutral-950 text-white")}><k.icon className="h-5 w-5" /></div></CardContent></Card>)}
    </div>
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="rounded-2xl border-neutral-200 bg-white shadow-sm lg:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2 text-xl font-semibold text-neutral-950"><IconChart className="h-5 w-5 text-orange-600" /> Sales over time</CardTitle><CardDescription className="text-neutral-600">{period === "day" ? "Today" : period === "week" ? "Last 7 days" : period === "month" ? "This month" : "All recorded sales"} · dated records only</CardDescription></CardHeader><CardContent><div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} barGap={6}><CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="#525252" /><YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#525252" /><Tooltip cursor={{ fill: "#fafafa" }} contentStyle={{ borderRadius: 12, border: "1px solid #e5e5e5", fontSize: 12 }} /><Bar dataKey="revenue" fill="#f97316" radius={[6, 6, 0, 0]} /><Bar dataKey="sales" fill="#171717" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>{filteredSales.length > 0 && chartData.every((day) => day.sales === 0) && <p className="mt-2 text-xs text-neutral-600">Sales exist, but their records do not include a date field, so they are not assigned to an invented day.</p>}</CardContent></Card>
      <Card className="rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-lg"><CardHeader><CardTitle className="flex items-center gap-2 text-lg font-semibold text-white"><IconCart className="h-5 w-5 text-orange-500" /> Top Sellers</CardTitle><CardDescription className="text-neutral-300">Best performing items from recorded sales</CardDescription></CardHeader><CardContent className="space-y-3">{topItems.length === 0 && <p className="rounded-lg border border-dashed border-neutral-700 py-6 text-center text-sm text-neutral-300">No sales recorded yet</p>}{topItems.map((item, index) => <div key={item.name} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 transition-colors hover:bg-white/10"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-500 text-xs font-bold text-white">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{item.name}</p><p className="text-xs text-neutral-300">{item.qty} sold</p></div><span className="text-sm font-semibold text-orange-300">{currency} {item.revenue.toLocaleString()}</span></div>)}</CardContent></Card>
    </div>
    <Card className="rounded-2xl border-neutral-200 bg-white shadow-sm"><CardHeader className="flex flex-row items-center justify-between space-y-0"><div><CardTitle className="flex items-center gap-2 text-xl font-semibold text-neutral-950"><IconPhone className="h-5 w-5 text-orange-600" /> Recent Activity</CardTitle><CardDescription className="text-neutral-600">Latest recorded sales and confirmed/pending PalPluss transactions</CardDescription></div><Badge className="border-neutral-900 bg-neutral-950 text-white">{filteredSales.length + filteredPayments.length} events</Badge></CardHeader><CardContent className="space-y-2">{filteredSales.length === 0 && filteredPayments.length === 0 && <p className="rounded-xl border border-dashed border-neutral-300 py-8 text-center text-sm text-neutral-600">No sales or payments recorded yet. Activity will appear here when this business starts using TWIGA.</p>}{filteredSales.slice(0, 3).map((sale) => <div key={sale.id} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600"><IconCart className="h-4 w-4" /></span><div><p className="text-sm font-medium text-neutral-950">Sale to {sale.customer}</p><p className="text-xs text-neutral-600">{sale.lines.length} item{sale.lines.length === 1 ? "" : "s"} · {sale.time}</p></div></div><span className="text-sm font-semibold text-neutral-950">{currency} {sale.total.toLocaleString()}</span></div>)}{transactionError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{transactionError}</p>}{filteredPayments.slice(0, 3).map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-950 text-white"><IconCard className="h-4 w-4" /></span><div><p className="text-sm font-medium text-neutral-950">Payment · {payment.customer_name || payment.phone || "Customer"}</p><p className="text-xs capitalize text-neutral-600">{payment.status} · {new Date(payment.created_at).toLocaleString()}</p></div></div><span className="text-sm font-semibold text-neutral-950">{payment.currency || currency} {Number(payment.amount || 0).toLocaleString()}</span></div>)}</CardContent></Card>
  </div>;
}