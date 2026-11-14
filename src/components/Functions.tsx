import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { receptionistFunctions } from "@/data/seed";
import {
  IconCheck,
  IconSparkle,
  IconPhone,
  IconCalendar,
  IconCard,
  IconChat,
  IconUsers,
  IconSwap,
  IconClock,
  IconAlert,
  IconMic,
  IconFile,
} from "@/components/Icons";

const iconFor: Record<number, typeof IconPhone> = {
  1: IconPhone,
  2: IconUsers,
  3: IconCalendar,
  4: IconChat,
  5: IconFile,
  6: IconSwap,
  7: IconClock,
  8: IconFile,
  9: IconAlert,
  10: IconMic,
};

export default function Functions() {
  const [active, setActive] = useState<number[]>(
    receptionistFunctions.map((f) => f.id)
  );

  const toggle = (id: number) =>
    setActive((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const allOn = active.length === receptionistFunctions.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm shadow-orange-500/40">
            <IconSparkle className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
              Capabilities
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
              The 10 core functions
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600">
              Every capability a human front desk performs, mapped to the AI
              equivalent. Toggle one off to simulate it being disabled.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="border-orange-200 bg-white text-orange-600">
            {active.length} of {receptionistFunctions.length} active
          </Badge>
          <Button
            onClick={() =>
              setActive(
                allOn ? [] : receptionistFunctions.map((f) => f.id)
              )
            }
            className="rounded-xl bg-neutral-950 text-white hover:bg-neutral-800"
          >
            {allOn ? "Disable all" : "Enable all"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {receptionistFunctions.map((fn) => {
          const on = active.includes(fn.id);
          const Icon = iconFor[fn.id] ?? IconSparkle;
          return (
            <Card
              key={fn.id}
              className={cn(
                "rounded-2xl shadow-sm transition-all duration-300",
                on
                  ? "border-neutral-200 bg-white hover:-translate-y-0.5 hover:shadow-md"
                  : "border-neutral-200 bg-neutral-50 opacity-70"
              )}
            >
              <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors",
                    on
                      ? "bg-orange-500 text-white shadow-sm shadow-orange-500/40"
                      : "bg-neutral-200 text-neutral-500"
                  )}
                >
                  {fn.id}
                </div>
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-neutral-900">
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        on ? "text-orange-500" : "text-neutral-400"
                      )}
                    />
                    {fn.name}
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    {fn.detail}
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => toggle(fn.id)}
                  className={cn(
                    "rounded-lg",
                    on
                      ? "bg-neutral-950 text-white hover:bg-neutral-800"
                      : "bg-orange-500 text-white hover:bg-orange-600"
                  )}
                >
                  {on ? <IconCheck className="h-4 w-4" /> : "Off"}
                </Button>
              </CardHeader>
              <CardContent className="pt-0">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                    on
                      ? "bg-orange-50 text-orange-600"
                      : "bg-neutral-100 text-neutral-500"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      on ? "bg-orange-500" : "bg-neutral-400"
                    )}
                  />
                  {on ? "Live in production" : "Disabled"}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}