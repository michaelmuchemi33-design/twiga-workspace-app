import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { receptionistFunctions } from "@/data/seed";
import {
  IconSparkle,
  IconPhone,
  IconCalendar,
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
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 rounded-2xl border border-neutral-800 bg-[#050505] p-6 text-white shadow-none sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-orange-400">
            <IconSparkle className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-400">Capabilities</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">10 core functions</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-300">
              A clear view of the jobs TWIGA is designed to handle. Actual availability depends on this business’s phone, Google and payment connections.
            </p>
          </div>
        </div>
        <Badge className="w-fit border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100">
          {receptionistFunctions.length} capabilities
        </Badge>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {receptionistFunctions.map((fn) => {
          const Icon = iconFor[fn.id] ?? IconSparkle;
          return (
            <Card key={fn.id} className="rounded-2xl border border-neutral-800 bg-[#050505] text-white shadow-none">
              <CardHeader className="flex min-h-[190px] flex-col items-center justify-center gap-3 space-y-0 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900">
                  <Icon className="h-6 w-6 text-orange-400" />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Function {String(fn.id).padStart(2, "0")}</p>
                <CardTitle className="text-base font-semibold text-white">{fn.name}</CardTitle>
                <CardDescription className="max-w-sm text-sm leading-6 text-neutral-300">{fn.detail}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
