import { useEffect, useState } from "react";
import { IconCheck, IconDownload } from "@/components/Icons";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __twigaInstallPrompt?: InstallPrompt | null;
  }
}

// Capture this at module load, before AuthGate finishes restoring the session.
// Otherwise Chrome can fire beforeinstallprompt before the dashboard mounts.
if (typeof window !== "undefined" && !window.__twigaInstallPrompt) {
  window.addEventListener("beforeinstallprompt", (event: Event) => {
    event.preventDefault();
    window.__twigaInstallPrompt = event as InstallPrompt;
    window.dispatchEvent(new Event("twiga-install-available"));
  });
}

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(() =>
    typeof window !== "undefined" ? window.__twigaInstallPrompt || null : null
  );
  const [installed, setInstalled] = useState(() =>
    typeof window !== "undefined" && (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    )
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => setPrompt(window.__twigaInstallPrompt || null);
    const installedHandler = () => {
      setInstalled(true);
      setPrompt(null);
      window.__twigaInstallPrompt = null;
    };
    window.addEventListener("twiga-install-available", refresh);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("twiga-install-available", refresh);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const install = async () => {
    const available = prompt || (typeof window !== "undefined" ? window.__twigaInstallPrompt || null : null);
    if (!available || busy) return;
    setBusy(true);
    try {
      await available.prompt();
      const choice = await available.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPrompt(null);
      window.__twigaInstallPrompt = null;
    } finally {
      setBusy(false);
    }
  };

  if (installed) return (
    <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-sm font-semibold text-emerald-800" aria-label="TWIGA app installed">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-600 text-white"><IconCheck className="h-5 w-5" /></span>
      <span>App installed</span>
    </span>
  );

  return (
    <button
      type="button"
      onClick={() => void install()}
      disabled={!prompt || busy}
      aria-label="Install TWIGA app"
      title={!prompt ? "Install prompt is not available in this browser" : "Install TWIGA on this device"}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 text-sm font-semibold text-neutral-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
    >
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-500 text-white"><IconDownload className="h-5 w-5" /></span>
      <span>{busy ? "Opening installer…" : "Install app"}</span>
    </button>
  );
}
