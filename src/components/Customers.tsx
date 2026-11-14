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
import { useStore, type Customer } from "@/lib/store";
import {
  IconUsers,
  IconPhone,
  IconSend,
  IconClock,
  IconSparkle,
  IconAlert,
  IconTrend,
} from "@/components/Icons";

const stageMeta: Record<
  Customer["stage"],
  { chip: string; icon: typeof IconUsers }
> = {
  VIP: { chip: "border-orange-200 bg-orange-50 text-orange-600", icon: IconTrend },
  Active: { chip: "border-neutral-200 bg-neutral-100 text-neutral-700", icon: IconSparkle },
  "At Risk": { chip: "border-neutral-900 bg-neutral-950 text-white", icon: IconAlert },
  New: { chip: "border-neutral-200 bg-white text-neutral-600", icon: IconUsers },
};

export default function Customers() {
  const { customers, advanceCustomer } = useStore();

  const due = customers.filter((c) => c.followUpIn === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
            Relationships
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            Customers
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Rows ready for follow-ups and outreach
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <IconClock className="h-5 w-5 text-orange-500" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Due now
            </p>
            <p className="text-lg font-bold text-orange-600">{due} people</p>
          </div>
        </div>
      </div>

      <Card className="rounded-2xl border-neutral-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <IconUsers className="h-5 w-5 text-orange-500" /> Customer Pipeline
            </CardTitle>
            <CardDescription>Tap follow up to advance the relationship</CardDescription>
          </div>
          <Badge className="border-neutral-900 bg-neutral-950 text-white">
            {customers.length} people
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {customers.map((c) => {
            const meta = stageMeta[c.stage];
            const StageIcon = meta.icon;
            const isDue = c.followUpIn === 0;
            return (
              <div
                key={c.id}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border px-4 py-3 transition-colors sm:flex-row sm:items-center",
                  isDue
                    ? "border-orange-200 bg-orange-50/60"
                    : "border-neutral-100 bg-white hover:border-neutral-200 hover:bg-neutral-50"
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-sm font-bold text-white">
                  {c.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {c.name}
                  </p>
                  <p className="flex items-center gap-1 truncate text-xs text-neutral-500">
                    <IconPhone className="h-3 w-3" /> {c.phone} · last visit {c.lastVisit}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold text-neutral-900">
                    KSh {c.spend.toLocaleString()}
                  </p>
                  <p className="text-xs text-neutral-500">lifetime</p>
                </div>
                <Badge className={cn("border", meta.chip)}>
                  <StageIcon className="mr-1 h-3 w-3" /> {c.stage}
                </Badge>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      isDue ? "font-medium text-orange-600" : "text-neutral-400"
                    )}
                  >
                    <IconClock className="h-3 w-3" />
                    {isDue ? "Due now" : `in ${c.followUpIn}d`}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => advanceCustomer(c.id)}
                    className={cn(
                      isDue
                        ? "bg-orange-500 text-white hover:bg-orange-600"
                        : "bg-neutral-950 text-white hover:bg-neutral-800"
                    )}
                  >
                    <IconSend className="mr-1 h-3.5 w-3.5" /> Follow up
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}