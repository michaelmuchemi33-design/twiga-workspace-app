import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  IconLogout,
  IconCheck,
  IconSparkle,
  IconPhone,
  IconCard,
  IconChat,
  IconUsers,
  IconShield,
} from "@/components/Icons";

const summary = [
  { icon: IconPhone, label: "Calls handled", value: "149" },
  { icon: IconCard, label: "Payments collected", value: "KSh 8,200" },
  { icon: IconChat, label: "Messages sent", value: "36" },
  { icon: IconUsers, label: "Customers served", value: "24" },
];

export default function Logout({ onCancel }: { onCancel: () => void }) {
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");

  const confirm = () => {
    setState("saving");
    window.setTimeout(() => setState("done"), 1200);
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="logout-card overflow-hidden rounded-3xl border border-orange-500/20 bg-neutral-950 shadow-2xl shadow-orange-950/30">
          <div className="relative px-8 pb-10 pt-8 text-center">
            <div className="pointer-events-none absolute inset-0 opacity-60">
              <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-orange-500/30 blur-3xl" />
              <div className="absolute -bottom-16 right-0 h-40 w-40 rounded-full bg-orange-500/20 blur-3xl" />
            </div>
            <div className="relative">
              <span className="logout-badge mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/40">
                {state === "done" ? (
                  <IconCheck className="h-8 w-8" />
                ) : (
                  <IconLogout className="h-8 w-8" />
                )}
              </span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
                {state === "done" ? "Signed out" : "Log out?"}
              </h1>
              <p className="mt-1 text-sm text-neutral-400">
                {state === "done"
                  ? "Your session has ended safely."
                  : "Your AI receptionist keeps working while you're away."}
              </p>
            </div>
          </div>

          <div className="border-t border-orange-500/10 px-8 py-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500/70">
              Today's summary
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {summary.map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-orange-500/15 bg-white/5 p-3 transition-colors hover:border-orange-500/30 hover:bg-orange-500/10"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
                    <s.icon className="h-4 w-4" />
                  </span>
                  <p className="mt-2 text-lg font-bold text-white">{s.value}</p>
                  <p className="text-xs text-neutral-400">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-2">
              {state !== "done" ? (
                <>
                  <Button
                    onClick={confirm}
                    disabled={state === "saving"}
                    className={cn(
                      "logout-primary w-full rounded-xl bg-orange-500 py-6 text-base font-semibold text-white hover:bg-orange-600",
                      state === "saving" && "opacity-70"
                    )}
                  >
                    {state === "saving" ? (
                      <>
                        <IconSparkle className="mr-2 h-5 w-5 animate-spin" />
                        Signing out…
                      </>
                    ) : (
                      <>
                        <IconLogout className="mr-2 h-5 w-5" />
                        Confirm log out
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={onCancel}
                    variant="outline"
                    className="w-full rounded-xl border-orange-500/30 bg-transparent py-6 text-base font-medium text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
                  >
                    Stay signed in
                  </Button>
                </>
              ) : (
                <Button
                  onClick={onCancel}
                  className="w-full rounded-xl bg-orange-500 py-6 text-base font-semibold text-white hover:bg-orange-600"
                >
                  <IconSparkle className="mr-2 h-5 w-5" />
                  Sign back in
                </Button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-neutral-400">
          <IconShield className="h-3.5 w-3.5 text-orange-500" />
          Protected session · AI Front Desk
        </p>
      </div>
    </div>
  );
}