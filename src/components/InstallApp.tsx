import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const before = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const installedHandler = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", installedHandler);
    if (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) setInstalled(true);
    return () => { window.removeEventListener("beforeinstallprompt", before); window.removeEventListener("appinstalled", installedHandler); };
  }, []);

  const install = async () => {
    if (!prompt) { setHelp(true); return; }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setPrompt(null);
  };

  return <>
    <button type="button" onClick={install} aria-label={installed ? "TWIGA app installed" : "Install TWIGA app"} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 text-sm font-semibold text-orange-800 shadow-sm transition hover:border-orange-300 hover:bg-orange-100">
      {installed ? <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg> : <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M12 7v8m-3-3 3 3 3-3M9 18h6"/></svg>}
      {installed ? "App installed" : "Install app"}
    </button>
    {help && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setHelp(false)}><div role="dialog" aria-modal="true" aria-labelledby="install-twiga-title" onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-500 text-white"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M12 7v8m-3-3 3 3 3-3"/></svg></div><h2 id="install-twiga-title" className="mt-4 text-lg font-bold text-neutral-950">Install TWIGA</h2><p className="mt-2 text-sm leading-6 text-neutral-600">On Android or desktop Chrome, open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. On iPhone, open this page in Safari, tap Share, then Add to Home Screen.</p><button type="button" onClick={() => setHelp(false)} className="mt-5 h-11 w-full rounded-xl bg-orange-500 font-semibold text-white transition hover:bg-orange-600">Got it</button></div></div>}
  </>;
}
