import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import AnimatedNumber from "@/components/AnimatedNumber";
import {
  IconFile,
  IconCoin,
  IconCart,
  IconCard,
  IconChart,
  IconTrend,
  IconPhone,
} from "@/components/Icons";

export default function Reports() {
  const { sales, payments, tasks, products, settings } = useStore();
  const currency = settings.business.currency;

  const revenue = sales.reduce((s, x) => s + x.total, 0);
  const collected = payments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);
  const outstanding = payments
    .filter((p) => p.status === "pending")
    .reduce((s, p) => s + p.amount, 0);
  const doneTasks = tasks.filter((t) => t.status === "done").length;

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    sales.forEach((s) =>
      s.lines.forEach((l) => {
        const cur = map.get(l.productId) ?? { name: l.name, qty: 0, revenue: 0 };
        cur.qty += l.qty;
        cur.revenue += l.price * l.qty;
        map.set(l.productId, cur);
      })
    );
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [sales]);

  // Build the chart only from this workspace's recorded sale lines.
  const chartData = topItems.map((item) => ({
    day: item.name,
    revenue: item.revenue,
    sales: item.qty,
  }));

  const kpis = [
    { label: "Revenue", value: revenue, icon: IconCoin, accent: true, money: true },
    { label: "Collected", value: collected, icon: IconCard, money: true },
    { label: "Outstanding", value: outstanding, icon: IconTrend, money: true },
    { label: "Tasks done", value: `${doneTasks}/${tasks.length}`, icon: IconChart },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
            Insights
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            Reports
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Sales, collections and performance at a glance
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <IconFile className="h-5 w-5 text-orange-500" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Catalog
            </p>
            <p className="text-lg font-bold text-orange-600">
              {products.length} items
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card
            key={k.label}
            className={cn(
              "rounded-2xl shadow-sm",
              k.accent ? "border-orange-200 bg-orange-50" : "border-neutral-200"
            )}
          >
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {k.label}
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
                  {k.money ? (
                    <AnimatedNumber
                      value={k.value as number}
                      prefix={`${currency} `}
                    />
                  ) : (
                    k.value
                  )}
                </p>
              </div>
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl",
                  k.accent ? "bg-orange-500 text-white" : "bg-neutral-950 text-white"
                )}
              >
                <k.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl border-neutral-200 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <IconChart className="h-5 w-5 text-orange-500" /> Sales by item
            </CardTitle>
            <CardDescription>Revenue and units from recorded sales</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={6}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="#737373" />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#737373" />
                    <Tooltip cursor={{ fill: "#fafafa" }} contentStyle={{ borderRadius: 12, border: "1px solid #e5e5e5", fontSize: 12 }} />
                    <Bar dataKey="revenue" fill="#f97316" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="sales" fill="#171717" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="grid h-64 place-items-center rounded-xl border border-dashed border-neutral-200 text-sm text-neutral-500">Sales will appear here after your first recorded sale.</div>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <IconCart className="h-5 w-5 text-orange-500" /> Top Sellers
            </CardTitle>
            <CardDescription className="text-neutral-400">
              Best performing items
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topItems.length === 0 && (
              <p className="rounded-lg border border-dashed border-neutral-700 py-6 text-center text-sm text-neutral-500">
                No sales recorded yet
              </p>
            )}
            {topItems.map((t, i) => (
              <div
                key={t.name}
                className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 transition-colors hover:bg-white/10"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-500 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-neutral-400">{t.qty} sold</p>
                </div>
                <span className="text-sm font-semibold text-orange-400">
                  {currency} {t.revenue.toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-neutral-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <IconPhone className="h-5 w-5 text-orange-500" /> Recent Activity
            </CardTitle>
            <CardDescription>Latest sales and payment events</CardDescription>
          </div>
          <Badge className="border-neutral-900 bg-neutral-950 text-white">
            {sales.length + payments.length} events
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {sales.slice(0, 3).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                  <IconCart className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    Sale to {s.customer}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {s.lines.length} item{s.lines.length === 1 ? "" : "s"} · {s.time}
                  </p>
                </div>
              </div>
              <span className="text-sm font-semibold text-neutral-900">
                {currency} {s.total.toLocaleString()}
              </span>
            </div>
          ))}
          {payments.slice(0, 3).map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-950 text-white">
                  <IconCard className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    Payment · {p.customer}
                  </p>
                  <p className="text-xs capitalize text-neutral-500">
                    {p.status} · {p.time}
                  </p>
                </div>
              </div>
              <span className="text-sm font-semibold text-neutral-900">
                {currency} {p.amount.toLocaleString()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}