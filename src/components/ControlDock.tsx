import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  IconPlus,
  IconSearch,
  IconBell,
  IconMic,
  IconCommand,
  IconClose,
  IconPhone,
  IconChat,
  IconCard,
  IconCalendar,
  IconUsers,
  IconSparkle,
  IconGear,
} from "@/components/Icons";

const quickActions = [
  { icon: IconPhone, label: "Log call", hint: "C" },
  { icon: IconChat, label: "Send WhatsApp", hint: "W" },
  { icon: IconCard, label: "Request payment", hint: "P" },
  { icon: IconCalendar, label: "Book appointment", hint: "B" },
  { icon: IconUsers, label: "Add customer", hint: "A" },
  { icon: IconSparkle, label: "Ask AI", hint: "K" },
];

export default function ControlDock() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-neutral-950/30 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="fixed right-4 top-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:top-6">
        {open && (
          <div className="w-80 origin-top-right overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl shadow-neutral-950/40">
            <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
              <IconSearch className="h-4 w-4 text-neutral-500" />
              <input
                autoFocus
                placeholder="Search anything..."
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-500"
              />
              <kbd className="rounded border border-neutral-700 px-1.5 py-0.5 text-xs text-neutral-500">
                ESC
              </kbd>
            </div>

            <div className="p-2">
              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                Quick actions
              </p>
              {quickActions.map((a) => (
                <button
                  key={a.label}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-neutral-800"
                >
                  <a.icon className="h-4 w-4 text-orange-500" />
                  <span className="flex-1 text-sm text-neutral-200">{a.label}</span>
                  <kbd className="rounded border border-neutral-700 px-1.5 py-0.5 text-xs text-neutral-500 group-hover:border-neutral-600">
                    {a.hint}
                  </kbd>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-neutral-800 px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                AI online
              </span>
              <button className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white">
                <IconGear className="h-3.5 w-3.5" /> Settings
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950 p-1.5 shadow-xl shadow-neutral-950/30">
          <button
            onClick={() => setOpen((o) => !o)}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full transition-all",
              open
                ? "bg-orange-500 text-white"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            )}
          >
            {open ? <IconClose className="h-5 w-5" /> : <IconCommand className="h-5 w-5" />}
          </button>

          <div className="h-6 w-px bg-neutral-800" />

          <button className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white">
            <IconMic className="h-5 w-5" />
          </button>
          <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white">
            <IconBell className="h-5 w-5" />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-orange-500" />
          </button>
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white transition-colors hover:bg-orange-600">
            <IconPlus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </>
  );
}