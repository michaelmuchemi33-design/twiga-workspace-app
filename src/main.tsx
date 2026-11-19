import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthGate from "@/components/AuthGate";
import { supabase } from "@/lib/supabase";
import "./index.css";

const demo = window.location.hostname === "demo.twiga.co.ke" || import.meta.env.VITE_APP_MODE === "demo";

if (window.location.hostname === "demo.twiga.co.ke") {
  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (favicon) { favicon.href = "https://twiga.co.ke/favicon-192.png"; favicon.type = "image/png"; }
}

function Root() {
  if (demo) return <App demo />;
  return <AuthGate>{(session, googleAuth) => <App userId={session.user.id} googleAuth={googleAuth} onSignOut={async () => { if (!supabase) throw new Error("Authentication is not configured."); const { error } = await supabase.auth.signOut(); if (error) throw error; try { localStorage.removeItem("twiga_session_started_at"); } catch { /* storage may be unavailable */ } }} />}</AuthGate>;
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch((error) => console.warn("PWA service worker registration failed", error)));
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><Root /></React.StrictMode>);
