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
import { useStore } from "@/lib/store";
import {
  IconChart,
  IconTrend,
  IconPhone,
  IconCard,
  IconUsers,
} from "@/components/Icons";

export default function Analytics() {
  const { sales, payments, tasks, customers } = useStore();

  const revenue = sales.reduce((s, x) => s + x.total, 0);
  const collected = payments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const conversion = tasks.length
    ? Math.round((doneTasks / tasks.length) * 100)
    : 0;

  const data = [
    { day: "Mon", revenue: 3200, calls: 18 },
    { day: "Tue", revenue: 4100, calls: 22 },
    { day: "Wed", revenue: 2800, calls: 15 },
    { day: "Thu", revenue: 5200, calls: 27 },
    { day: "Fri", revenue: 6400, calls: 31 },
    { day: "Sat", revenue: 4800, calls: 24 },
    { day: "Sun", revenue, calls: 12 },
  ];

  const kpis = [
    { label: "Tasks completed", value: `${doneTasks}/${tasks.length}`, icon: IconTrend, accent: true },
    { label: "Calls handled", value: "149", icon: IconPhone },
    { label: "Payments collected", value: `KSh ${collected.toLocaleString()}`, icon: IconCard },
    { label: "Customers", value: `${customers.length}`, icon: IconUsers },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card
            key={k.label}
            className={
              k.accent
                ? "rounded-2xl border-orange-200 bg-orange-50 shadow-sm"
                : "rounded-2xl border-neutral-200 shadow-sm"
            }
          >
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {k.label}
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
                  {k.value}
                </p>
              </div>
              <div
                className={
                  k.accent
                    ? "flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white"
                    : "flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-950 text-white"
                }
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
              <IconChart className="h-5 w-5 text-orange-500" /> Weekly Performance
            </CardTitle>
            <CardDescription>Revenue (KSh) and calls handled this week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="#737373" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#737373" />
                  <Tooltip
                    cursor={{ fill: "#fafafa" }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e5e5e5",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="revenue" fill="#f97316" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="calls" fill="#171717" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <IconTrend className="h-5 w-5 text-orange-500" /> Resolution Rate
            </CardTitle>
            <CardDescription className="text-neutral-400">
              Tasks your AI closed out
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-end gap-2">
              <span className="text-5xl font-bold tracking-tight text-orange-500">
                {conversion}%
              </span>
              <span className="pb-2 text-sm text-neutral-400">completed</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-orange-500 transition-all"
                style={{ width: `${conversion}%` }}
              />
            </div>
            <div className="space-y-3 border-t border-white/10 pt-4 text-sm">
              <Row label="Revenue today" value={`KSh ${revenue.toLocaleString()}`} />
              <Row label="Collected" value={`KSh ${collected.toLocaleString()}`} />
              <Row label="Avg. response" value="1.2s" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}