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
    <button onClick={install} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 text-sm font-semibold text-orange-800 transition hover:bg-orange-100">
      <span aria-hidden>＋</span>{installed ? "PWA installed" : "Install TWIGA PWA PWA"}
    </button>
    {help && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" onClick={()=>setHelp(false)}><div onClick={e=>e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold">Install TWIGA PWA</h2><p className="mt-2 text-sm leading-6 text-neutral-600">On Android or desktop Chrome, open the browser menu and choose <strong>Install TWIGA PWA PWA</strong> or <strong>Add to Home screen</strong>. On iPhone, open this page in Safari, tap Share, then Add to Home Screen.</p><button onClick={()=>setHelp(false)} className="mt-5 h-10 w-full rounded-xl bg-orange-500 font-semibold text-white">Got it</button></div></div>}
  </>;
}
