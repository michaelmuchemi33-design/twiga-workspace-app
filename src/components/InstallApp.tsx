import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function InstallGlyph({ installed = false }: { installed?: boolean }) {
  return installed
    ? <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
    : <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 17v3h14v-3" /></svg>;
}

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const before = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const installedHandler = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const install = async () => {
    if (!prompt) { setHelp(true); return; }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setPrompt(null);
  };

  return <>
    <button type="button" onClick={install} aria-label={installed ? "TWIGA app installed" : "Install TWIGA app"} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-orange-300 bg-white px-3.5 text-sm font-bold text-orange-800 shadow-sm transition hover:border-orange-400 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-500 text-white"><InstallGlyph installed={installed} /></span>
      <span>{installed ? "App installed" : "Install app"}</span>
    </button>
    {help && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4" onClick={() => setHelp(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="twiga-install-title" onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-500 text-white"><InstallGlyph /></div>
        <h2 id="twiga-install-title" className="mt-4 text-lg font-bold text-neutral-950">Install TWIGA</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">TWIGA installs as a Progressive Web App (PWA) from this website — no APK is needed. On Android or desktop Chrome, open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. On iPhone, open this page in Safari, tap Share, then <strong>Add to Home Screen</strong>.</p>
        <button type="button" onClick={() => setHelp(false)} className="mt-5 h-11 w-full rounded-xl bg-orange-500 font-semibold text-white transition hover:bg-orange-600">Got it</button>
      </div>
    </div>}
  </>;
}
