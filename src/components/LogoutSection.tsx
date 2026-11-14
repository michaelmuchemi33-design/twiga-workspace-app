import { useState } from "react";
import { cn } from "@/lib/utils";
import { IconLogout, IconCheck } from "@/components/Icons";

export default function LogoutSection() {
  const [confirming, setConfirming] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);

  if (loggedOut) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
            <IconCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              You've been logged out
            </p>
            <button
              onClick={() => setLoggedOut(false)}
              className="text-xs font-medium text-orange-600 hover:underline"
            >
              Sign back in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="relative">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-950 text-sm font-bold text-white">
            AM
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-orange-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">
            Alex Mwangi
          </p>
          <p className="truncate text-xs text-neutral-500">
            Owner · Nairobi Style Studio
          </p>
        </div>
        <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-600">
          Pro
        </span>
      </div>

      {confirming ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-neutral-500">
            Are you sure you want to log out?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setLoggedOut(true)}
              className="flex-1 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
            >
              Yes, log out
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className={cn(
            "mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 transition-colors",
            "hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
          )}
        >
          <IconLogout className="h-4 w-4" />
          Log out
        </button>
      )}
    </div>
  );
}