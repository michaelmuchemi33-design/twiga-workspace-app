import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import {
  IconBell,
  IconAlert,
  IconCheck,
  IconClock,
  IconCard,
  IconBox,
  IconUsers,
  IconSparkle,
} from "@/components/Icons";

type Severity = "high" | "medium" | "low";

interface Alert {
  id: string;
  title: string;
  detail: string;
  severity: Severity;
  icon: typeof IconBell;
  time: string;
}

const severityMeta: Record<Severity, { chip: string; label: string }> = {
  high: { chip: "border-orange-200 bg-orange-50 text-orange-600", label: "High" },
  medium: { chip: "border-neutral-200 bg-neutral-100 text-neutral-700", label: "Medium" },
  low: { chip: "border-neutral-200 bg-white text-neutral-500", label: "Low" },
};

export default function Alerts() {
  const { payments, products, customers, tasks } = useStore();
  const [dismissed, setDismissed] = useState<string[]>([]);

  const overdue = payments.filter((p) => p.status === "pending");
  const expired = payments.filter((p) => p.status === "expired");
  const lowStock = products.filter((p) => p.kind === "seller" && p.stock <= 5);
  const dueFollowUps = customers.filter((c) => c.followUpIn === 0);
  const failedTasks = tasks.filter((t) => t.status === "failed");

  const alerts: Alert[] = [
    ...expired.map((p) => ({
      id: `exp-${p.id}`,
      title: `Payment link expired — ${p.customer}`,
      detail: `KSh ${p.amount.toLocaleString()} link needs to be re-sent`,
      severity: "high" as Severity,
      icon: IconCard,
      time: p.time,
    })),
    ...overdue.map((p) => ({
      id: `due-${p.id}`,
      title: `Payment pending — ${p.customer}`,
      detail: `KSh ${p.amount.toLocaleString()} still outstanding`,
      severity: "medium" as Severity,
      icon: IconClock,
      time: p.time,
    })),
    ...lowStock.map((p) => ({
      id: `stock-${p.id}`,
      title: `Low stock — ${p.name}`,
      detail: `Only ${p.stock} left in inventory`,
      severity: "medium" as Severity,
      icon: IconBox,
      time: "now",
    })),
    ...dueFollowUps.map((c) => ({
      id: `fu-${c.id}`,
      title: `Follow-up due — ${c.name}`,
      detail: `Last visit ${c.lastVisit} · reach out today`,
      severity: "low" as Severity,
      icon: IconUsers,
      time: "today",
    })),
    ...failedTasks.map((t) => ({
      id: `task-${t.id}`,
      title: t.label,
      detail: t.detail,
      severity: "high" as Severity,
      icon: IconAlert,
      time: t.time,
    })),
  ].filter((a) => !dismissed.includes(a.id));

  const counts = {
    high: alerts.filter((a) => a.severity === "high").length,
    medium: alerts.filter((a) => a.severity === "medium").length,
    low: alerts.filter((a) => a.severity === "low").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
            Notifications
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            Alerts
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {alerts.length} thing{alerts.length === 1 ? "" : "s"} need your attention
          </p>
        </div>
        <div className="flex gap-3">
          <CountChip label="High" value={counts.high} tone="orange" />
          <CountChip label="Medium" value={counts.medium} tone="dark" />
          <CountChip label="Low" value={counts.low} tone="light" />
        </div>
      </div>

      <Card className="rounded-2xl border-neutral-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <IconBell className="h-5 w-5 text-orange-500" /> Action Center
            </CardTitle>
            <CardDescription>Resolve or dismiss each alert</CardDescription>
          </div>
          {dismissed.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDismissed([])}
              className="rounded-lg border-neutral-200"
            >
              Restore all
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500">
                <IconCheck className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-semibold text-neutral-900">
                All clear
              </p>
              <p className="text-xs text-neutral-500">
                Nothing needs your attention right now.
              </p>
            </div>
          )}
          {alerts.map((a) => {
            const meta = severityMeta[a.severity];
            const Icon = a.icon;
            return (
              <div
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-neutral-100 bg-white px-4 py-3 transition-colors hover:border-neutral-200 hover:bg-neutral-50 sm:flex-row sm:items-center"
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
                    {a.title}
                  </p>
                  <p className="truncate text-xs text-neutral-500">{a.detail}</p>
                </div>
                <Badge className={cn("border", meta.chip)}>{meta.label}</Badge>
                <span className="hidden text-xs text-neutral-400 sm:block">
                  {a.time}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDismissed((d) => [...d, a.id])}
                  className="rounded-lg border-neutral-200 text-neutral-700 hover:bg-orange-50 hover:text-orange-600"
                >
                  Dismiss
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-orange-200 bg-orange-50 shadow-sm">
        <CardContent className="flex items-start gap-3 p-5">
          <IconSparkle className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              AI recommendation
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">
              Re-send {expired.length} expired link{expired.length === 1 ? "" : "s"} and
              prompt {overdue.length} pending payment{overdue.length === 1 ? "" : "s"} to
              recover outstanding revenue faster.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CountChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "orange" | "dark" | "light";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-center",
        tone === "orange"
          ? "border-orange-200 bg-orange-50"
          : tone === "dark"
          ? "border-neutral-900 bg-neutral-950"
          : "border-neutral-200 bg-neutral-50"
      )}
    >
      <p
        className={cn(
          "text-lg font-bold",
          tone === "orange"
            ? "text-orange-600"
            : tone === "dark"
            ? "text-white"
            : "text-neutral-900"
        )}
      >
        {value}
      </p>
      <p
        className={cn(
          "text-xs font-medium uppercase tracking-wide",
          tone === "dark" ? "text-neutral-400" : "text-neutral-500"
        )}
      >
        {label}
      </p>
    </div>
  );
}