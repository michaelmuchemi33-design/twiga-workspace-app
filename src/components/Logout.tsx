import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconLogout, IconShield } from "@/components/Icons";

export default function Logout({ onCancel, onConfirm }: {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      // AuthGate observes Supabase SIGNED_OUT and returns to the sign-in screen.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "TWIGA could not sign you out. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[65vh] items-center justify-center px-3">
      <section className="w-full max-w-md overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-xl">
        <div className="bg-neutral-950 px-8 py-9 text-center text-white">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-orange-500 text-white">
            <IconLogout className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-2xl font-bold">Sign out of TWIGA?</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-300">Your business workspace and receptionist settings stay saved. You can sign in again at any time.</p>
        </div>
        <div className="space-y-3 p-7">
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button onClick={confirm} disabled={busy} className="w-full rounded-xl bg-orange-500 py-6 text-base font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
            <IconLogout className="mr-2 h-5 w-5" />{busy ? "Signing out…" : "Confirm sign out"}
          </Button>
          <Button onClick={onCancel} disabled={busy} variant="outline" className="w-full rounded-xl py-6 text-base">Stay signed in</Button>
          <p className="flex items-center justify-center gap-2 pt-2 text-xs text-neutral-500"><IconShield className="h-4 w-4 text-orange-500" />Your session is protected</p>
        </div>
      </section>
    </div>
  );
}
