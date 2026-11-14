import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { IconSparkle, IconCheck } from "@/components/Icons";

const steps = [
  "Reading your business details…",
  "Training on your services & prices…",
  "Connecting WhatsApp & payments…",
  "Account ready — you're live!",
];

export default function SetupWithAi() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (step >= steps.length) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), 900);
    return () => window.clearTimeout(t);
  }, [open, step]);

  const start = () => {
    setStep(0);
    setOpen(true);
  };

  const done = step >= steps.length;

  return (
    <>
      <button
        onClick={start}
        className="setup-glare group relative mt-3 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-orange-400/40 bg-orange-500/15 px-4 py-2.5 text-sm font-semibold text-orange-300 backdrop-blur-md transition-colors hover:border-orange-400/70 hover:bg-orange-500/25 sm:w-auto"
      >
        <span className="setup-glare__sheen" aria-hidden />
        <span className="relative z-10 flex items-center gap-2">
          <IconSparkle className="h-4 w-4" />
          Set up with AI
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-neutral-950/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 p-6 text-white shadow-2xl shadow-neutral-950/50">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-500/30">
                <IconSparkle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-base font-semibold">AI Account Setup</p>
                <p className="text-xs text-neutral-400">
                  Your assistant is building your account
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {steps.map((s, i) => {
                const active = i === step;
                const complete = i < step;
                return (
                  <div
                    key={s}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
                      complete
                        ? "border-orange-500/30 bg-orange-500/10"
                        : active
                        ? "border-orange-500/50 bg-white/5"
                        : "border-neutral-800 bg-white/[0.02]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
                        complete
                          ? "bg-orange-500 text-white"
                          : active
                          ? "bg-orange-500/20 text-orange-400"
                          : "bg-neutral-800 text-neutral-500"
                      )}
                    >
                      {complete ? (
                        <IconCheck className="h-3.5 w-3.5" />
                      ) : active ? (
                        <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-sm",
                        complete || active ? "text-white" : "text-neutral-500"
                      )}
                    >
                      {s}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-orange-500 transition-all duration-700"
                style={{ width: `${(Math.min(step, steps.length) / steps.length) * 100}%` }}
              />
            </div>

            <button
              onClick={() => setOpen(false)}
              className={cn(
                "mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                done
                  ? "bg-orange-500 text-white hover:bg-orange-600"
                  : "bg-white/10 text-neutral-300 hover:bg-white/20"
              )}
            >
              {done ? "Go to dashboard" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}