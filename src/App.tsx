import { useCallback, useEffect, useRef, useState } from "react";
import type { GoogleAuthContext } from "@/components/AuthGate";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase";
import InstallApp from "@/components/InstallApp";
import DemoInterest from "@/components/DemoInterest";
import { StoreProvider } from "@/lib/store";
import { cn } from "@/lib/utils";
import Dashboard from "@/components/Dashboard";
import PointOfSale from "@/components/PointOfSale";
import Payments from "@/components/Payments";
import Customers from "@/components/Customers";
import WhatsAppOutbox from "@/components/WhatsAppOutbox";
import Organizer from "@/components/Organizer";
import Analytics from "@/components/Analytics";
import Settings from "@/components/Settings";
import Profile from "@/components/Profile";
import PhoneDesk from "@/components/PhoneDesk";
import Connections from "@/components/Connections";
import Products from "@/components/Products";
import Reports from "@/components/Reports";
import Alerts from "@/components/Alerts";
import Functions from "@/components/Functions";
import Logout from "@/components/Logout";
import SideRail from "@/components/SideRail";
import SetupPage from "@/components/SetupPage";
import {
  IconHome,
  IconCart,
  IconCard,
  IconSwap,
  IconChart,
  IconBox,
  IconGear,
  IconBell,
  IconFile,
  IconSparkle,
  IconLogout,
  IconClose,
  IconUsers,
  IconChat,
} from "@/components/Icons";

const footerTabs = [
  { id: "dashboard", label: "Home", icon: IconHome },
  { id: "pos", label: "Sell", icon: IconCart },
  { id: "payments", label: "Pay", icon: IconCard },
];

const moreTabs = [
  { id: "setup", label: "Set up with AI", icon: IconSparkle },
  { id: "phone", label: "Phone & AI", icon: IconChat },
  { id: "connections", label: "Connections", icon: IconUsers },
  { id: "organizer", label: "Organize", icon: IconSwap },
  { id: "functions", label: "Functions", icon: IconSparkle },
  { id: "customers", label: "People", icon: IconUsers },
  { id: "whatsapp", label: "Inbox", icon: IconChat },
  { id: "analytics", label: "Stats", icon: IconChart },
  { id: "products", label: "Products", icon: IconBox },
  { id: "reports", label: "Reports", icon: IconFile },
  { id: "alerts", label: "Alerts", icon: IconBell },
  { id: "profile", label: "Profile", icon: IconUsers },
  { id: "settings", label: "Settings", icon: IconGear },
  { id: "logout", label: "Log out", icon: IconLogout },
];

export default function App({ demo = false, userId, googleAuth, onSignOut }: { demo?: boolean; userId?: string; googleAuth?: GoogleAuthContext; onSignOut?: () => void }) {
  const [tab, setTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [businessesLoaded, setBusinessesLoaded] = useState(false);
  const [businessesError, setBusinessesError] = useState("");
  const [googleSetupMessage, setGoogleSetupMessage] = useState("");
  const [autoProvisioning, setAutoProvisioning] = useState(false);
  const autoProvisioned = useRef<string | null>(null);
  const googleConnectAttempted = useRef<string | null>(null);
  const isNativeApp = Capacitor.isNativePlatform();

  const refreshBusinesses = useCallback(async () => {
    if (demo || !userId || !supabase) return;
    setBusinessesLoaded(false);
    const { data, error } = await supabase.functions.invoke("twiga-business-workspaces", { body: { action: "list" } });
    if (error) { console.error("Could not load TWIGA businesses", error.message); setBusinessesError(error.message); setBusinessesLoaded(true); return; }
    const next = Array.isArray(data?.businesses) ? data.businesses : [];
    setBusinessesError("");
    setBusinesses(next);
    setBusinessId((current) => current && next.some((b: any) => b.id === current) ? current : (next[0]?.id || ""));
    setBusinessesLoaded(true);
  }, [demo, userId]);

  useEffect(() => { void refreshBusinesses(); }, [refreshBusinesses]);
  useEffect(() => {
    if (demo || !userId || !businessesLoaded || businesses.length > 0) return;
    if (businessesError) {
      setTab("setup");
      setGoogleSetupMessage("We could not check your saved workspace. Refresh the page and try again.");
      return;
    }
    if (!googleAuth?.isGoogleUser) { setTab("setup"); return; }
    if (autoProvisioned.current === userId || !supabase) return;
    autoProvisioned.current = userId;
    const createFirstWorkspace = async () => {
      setAutoProvisioning(true);
      setGoogleSetupMessage("Preparing your private TWIGA dashboard…");
      try {
        const { data, error } = await supabase.functions.invoke("twiga-business-workspaces", {
          body: {
            action: "create",
            name: "My Business",
            businessType: "general",
            profile: {
              owner_name: googleAuth.profile.fullName,
              owner_email: googleAuth.profile.email,
            },
          },
        });
        if (error) throw error;
        const created = data?.business;
        if (!created?.id) throw new Error("TWIGA could not create your private workspace.");
        setBusinesses([created]);
        setBusinessId(created.id);
        setBusinessesLoaded(true);
        setTab("dashboard");
        setGoogleSetupMessage(googleAuth.tokens?.accessToken
          ? "Your dashboard is ready. Securing your Calendar, Contacts, Sheets and Drive connection…"
          : "Your dashboard is ready. Connect Calendar, Contacts, Sheets and Drive from Connections when you are ready.");
      } catch (e) {
        setGoogleSetupMessage(e instanceof Error ? e.message : "Your Google account is signed in, but the workspace could not be created.");
        setTab("setup");
        autoProvisioned.current = null;
      } finally {
        setAutoProvisioning(false);
      }
    };
    void createFirstWorkspace();
  }, [demo, userId, businessesLoaded, businesses.length, businessesError, googleAuth]);

  useEffect(() => {
    if (demo || !userId || !googleAuth?.isGoogleUser || !googleAuth.tokens?.accessToken || !businessId || !supabase) return;
    if (googleConnectAttempted.current === businessId) return;
    googleConnectAttempted.current = businessId;
    const connect = async () => {
      try {
        const { data: status, error: statusError } = await supabase.functions.invoke("google-workspace", {
          body: { action: "status", businessId },
        });
        if (statusError) throw statusError;
        const scopes = Array.isArray(status?.scopes) ? status.scopes as string[] : [];
        const hasCalendar = scopes.some((scope) => scope.includes("calendar.events.owned") || scope.includes("calendar.events"));
        const hasContacts = scopes.some((scope) => scope.includes("contacts.readonly") || scope.endsWith("/auth/contacts"));
        const hasSheets = scopes.includes("https://www.googleapis.com/auth/spreadsheets");
        const hasDrive = scopes.includes("https://www.googleapis.com/auth/drive.file");
        if (status?.connected && hasCalendar && hasContacts && hasSheets && hasDrive) {
          setGoogleSetupMessage("");
          return;
        }
        const { data, error } = await supabase.functions.invoke("google-workspace", {
          body: {
            action: "connect",
            businessId,
            accessToken: googleAuth.tokens.accessToken,
            refreshToken: googleAuth.tokens.refreshToken,
            googleEmail: googleAuth.profile.email,
          },
        });
        if (error) throw error;
        if (!data?.connected) throw new Error(data?.message || "Google did not grant all requested Google Workspace permissions.");
        setGoogleSetupMessage(data.refreshReady
          ? ""
          : "Calendar and Contacts are connected. Reconnect Google from Connections if its access expires.");
      } catch (e) {
        setGoogleSetupMessage("Your dashboard is ready. Google connection needs attention: " + (e instanceof Error ? e.message : "Reconnect Google from Connections."));
      }
    };
    void connect();
  }, [demo, userId, googleAuth, businessId]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && !localStorage.getItem("twiga_session_started_at")) {
        localStorage.setItem("twiga_session_started_at", String(Date.now()));
      }
    });
    const timer = window.setInterval(() => {
      const started = Number(localStorage.getItem("twiga_session_started_at") || 0);
      if (started && Date.now() - started >= 7 * 24 * 60 * 60 * 1000) {
        void supabase.auth.signOut();
      }
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);



  const businessCreated = async (id: string) => {
    await refreshBusinesses();
    setBusinessId(id);
    setTab("dashboard");
  };

  const go = (id: string) => {
    setTab(id);
    setMenuOpen(false);
  };

  const isMoreActive = moreTabs.some((t) => t.id === tab);
  const isSetup = tab === "setup";

  return (
    <StoreProvider demo={demo} userId={userId} businessId={businessId}>
      <div
        className={cn(
          "min-h-screen bg-neutral-50 text-neutral-900 transition-all duration-500",
          isSetup ? "pb-10" : isNativeApp ? "pb-32" : "pb-8"
        )}
      >
        {!isNativeApp && <SideRail tab={tab} onSelect={go} />}

        <main className={cn("mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8", !isNativeApp && "lg:pl-24")}>
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-lg font-black text-white">T</div>
              <div><p className="font-bold tracking-tight text-neutral-950">TWIGA</p><p className="text-xs text-neutral-500">{demo ? "Interactive product preview · sample data" : "Your private business workspace"}</p></div>
              {demo && <span className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-orange-700">Demo</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isNativeApp && <select aria-label="Navigate workspace" value={tab} onChange={(e) => go(e.target.value)} className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700 outline-none focus:border-orange-400 lg:hidden"><option value="dashboard">Home</option><option value="setup">AI setup</option><option value="phone">Phone & AI</option><option value="connections">Connections</option><option value="organizer">Organize</option><option value="functions">Functions</option><option value="pos">Sell</option><option value="payments">Payments</option><option value="customers">People</option><option value="whatsapp">Inbox</option><option value="analytics">Stats</option><option value="products">Products</option><option value="reports">Reports</option><option value="alerts">Alerts</option><option value="profile">Profile</option><option value="settings">Settings</option></select>}
              {!demo && googleAuth?.profile && <div className="mr-1 flex items-center gap-2 rounded-xl bg-neutral-50 py-1.5 pl-1.5 pr-2.5">
                {googleAuth.profile.avatarUrl ? <img src={googleAuth.profile.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full border border-neutral-200 object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-orange-100 text-xs font-bold text-orange-800">{(googleAuth.profile.fullName || googleAuth.profile.email || "T").slice(0,1).toUpperCase()}</span>}
                <span className="hidden max-w-[180px] sm:block"><span className="block truncate text-xs font-semibold text-neutral-800">{googleAuth.profile.fullName || "Your account"}</span><span className="block truncate text-[10px] text-neutral-500">{googleAuth.profile.email}</span></span>
              </div>}
              <InstallApp />{demo && <DemoInterest />}{!demo && onSignOut && <button onClick={onSignOut} className="h-10 rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-50">Sign out</button>}
            </div>
          </div>
          {googleSetupMessage && !demo && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-950"><span>{autoProvisioning && <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-orange-500" />}{googleSetupMessage}</span>{googleSetupMessage.includes("Google connection needs attention") && <button onClick={() => go("connections")} className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-bold">Open Google connections</button>}{googleSetupMessage.includes("could not be created") && <button onClick={() => { autoProvisioned.current = null; void refreshBusinesses(); }} className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-bold">Retry</button>}</div>}
          {demo && <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-900"><strong>This is a sample workspace.</strong> Explore the screens and test the controls. Demo changes are temporary and are not connected to a real customer's business account.</div>}
          {tab === "dashboard" && <Dashboard onSetup={() => go("setup")} />}
          {tab === "setup" && <SetupPage demo={demo} onDone={() => go("dashboard")} onBusinessCreated={businessCreated} />}
          {tab === "phone" && <PhoneDesk businessId={businessId} demo={demo} onOpenProfile={() => go("profile")} />}
          {tab === "connections" && <Connections businessId={businessId} demo={demo} googleAuth={googleAuth} />}
          {tab === "organizer" && <Organizer />}
          {tab === "functions" && <Functions />}
          {tab === "pos" && <PointOfSale />}
          {tab === "payments" && <Payments />}
          {tab === "customers" && <Customers />}
          {tab === "whatsapp" && <WhatsAppOutbox />}
          {tab === "analytics" && <Analytics />}
          {tab === "products" && <Products />}
          {tab === "reports" && <Reports />}
          {tab === "alerts" && <Alerts />}
          {tab === "profile" && <Profile userId={userId} businessId={businessId} businesses={businesses} onBusinessChange={setBusinessId} onRefreshBusinesses={refreshBusinesses} onCreateBusiness={() => go("setup")} />}
          {tab === "settings" && <Settings businessId={businessId} demo={demo} onOpenProfile={() => go("profile")} />}
          {tab === "logout" && <Logout onCancel={() => setTab("dashboard")} />}
        </main>

        {menuOpen && (
          <div
            className="fixed inset-0 z-40 bg-neutral-950/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
        )}

        {isNativeApp && <nav
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-5 transition-all duration-500",
            isSetup
              ? "pointer-events-none translate-y-40 opacity-0"
              : "translate-y-0 opacity-100"
          )}
        >
          <div className="relative w-full max-w-md">
            {menuOpen && (
              <div className="footer-panel absolute bottom-full left-0 right-0 mb-3 overflow-hidden rounded-3xl border border-orange-500/20 bg-neutral-950 p-3 shadow-2xl shadow-orange-950/40">
                <div className="mb-2 flex items-center justify-between px-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-orange-500/70">
                    More
                  </span>
                  <button
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                  >
                    <IconClose className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {moreTabs.map((t, i) => {
                    const active = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => go(t.id)}
                        style={{ animationDelay: `${i * 45}ms` }}
                        className={cn(
                          "footer-tile flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-medium transition-all duration-200 active:scale-90",
                          active
                            ? "bg-orange-500 text-white shadow-lg shadow-orange-500/40"
                            : "text-neutral-300 hover:bg-orange-500/10 hover:text-orange-400"
                        )}
                      >
                        <span className="footer-icon flex h-5 w-5 items-center justify-center">
                          <t.icon className="h-5 w-5" />
                        </span>
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-1 rounded-3xl border border-orange-500/20 bg-neutral-950 p-2 shadow-2xl shadow-orange-950/40">
              {footerTabs.map((t, i) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => go(t.id)}
                    style={{ animationDelay: `${i * 60}ms` }}
                    className={cn(
                      "footer-tile flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-xs font-medium transition-all duration-200 active:scale-90",
                      active
                        ? "bg-orange-500 text-white shadow-lg shadow-orange-500/40"
                        : "text-neutral-400 hover:bg-orange-500/10 hover:text-orange-400"
                    )}
                  >
                    <span className="footer-icon flex h-5 w-5 items-center justify-center">
                      <t.icon className="h-5 w-5" />
                    </span>
                    <span>{t.label}</span>
                  </button>
                );
              })}

              <button
                onClick={() => setMenuOpen((o) => !o)}
                className={cn(
                  "footer-tile flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-xs font-medium transition-all duration-200 active:scale-90",
                  menuOpen || isMoreActive
                    ? "bg-orange-500 text-white shadow-lg shadow-orange-500/40"
                    : "text-neutral-400 hover:bg-orange-500/10 hover:text-orange-400"
                )}
              >
                <span className="footer-icon flex h-5 w-5 items-center justify-center">
                  <IconSparkle className="h-5 w-5" />
                </span>
                <span>More</span>
              </button>
            </div>
          </div>
        </nav>}
      </div>
    </StoreProvider>
  );
}