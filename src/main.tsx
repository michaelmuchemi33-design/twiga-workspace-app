import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthGate from "@/components/AuthGate";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import "./index.css";

const demo = window.location.hostname === "demo.twiga.co.ke" || import.meta.env.VITE_APP_MODE === "demo";

function Root() {
  if (demo) return <App demo />;
  return <AuthGate>{(session) => <App userId={session.user.id} onSignOut={async () => { await supabase?.auth.signOut(); }} />}</AuthGate>;
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch((error) => console.warn("PWA service worker registration failed", error)));
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><Root /></React.StrictMode>);
