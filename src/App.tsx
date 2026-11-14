import { useState } from "react";
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
import Products from "@/components/Products";
import Reports from "@/components/Reports";
import Alerts from "@/components/Alerts";
import Functions from "@/components/Functions";
import Logout from "@/components/Logout";
import SideRail from "@/components/SideRail";
import ControlDock from "@/components/ControlDock";
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
  { id: "organizer", label: "Organize", icon: IconSwap },
  { id: "functions", label: "Functions", icon: IconSparkle },
  { id: "customers", label: "People", icon: IconUsers },
  { id: "whatsapp", label: "Inbox", icon: IconChat },
  { id: "analytics", label: "Stats", icon: IconChart },
  { id: "products", label: "Products", icon: IconBox },
  { id: "reports", label: "Reports", icon: IconFile },
  { id: "alerts", label: "Alerts", icon: IconBell },
  { id: "settings", label: "Settings", icon: IconGear },
  { id: "logout", label: "Log out", icon: IconLogout },
];

export default function App({ demo = false, userId, onSignOut }: { demo?: boolean; userId?: string; onSignOut?: () => void }) {
  const [tab, setTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (id: string) => {
    setTab(id);
    setMenuOpen(false);
  };

  const isMoreActive = moreTabs.some((t) => t.id === tab);
  const isSetup = tab === "setup";

  return (
    <StoreProvider demo={demo} userId={userId}>
      <div
        className={cn(
          "min-h-screen bg-neutral-50 text-neutral-900 transition-all duration-500",
          isSetup ? "pb-10" : "pb-32"
        )}
      >
        <ControlDock />
        <SideRail tab={tab} onSelect={go} />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:pl-24">
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-lg font-black text-white">T</div>
              <div><p className="font-bold tracking-tight text-neutral-950">TWIGA</p><p className="text-xs text-neutral-500">{demo ? "Interactive product preview · sample data" : "Your private business workspace"}</p></div>
              {demo && <span className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-orange-700">Demo</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2"><InstallApp />{demo && <DemoInterest />}{!demo && onSignOut && <button onClick={onSignOut} className="h-10 rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-50">Sign out</button>}</div>
          </div>
          {demo && <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-900"><strong>This is a sample workspace.</strong> Explore the screens and test the controls. Demo changes are temporary and are not connected to a real customer's business account.</div>}
          {tab === "dashboard" && <Dashboard onSetup={() => go("setup")} />}
          {tab === "setup" && <SetupPage onDone={() => go("dashboard")} />}
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
          {tab === "settings" && <Settings />}
          {tab === "logout" && <Logout onCancel={() => setTab("dashboard")} />}
        </main>

        {menuOpen && (
          <div
            className="fixed inset-0 z-40 bg-neutral-950/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
        )}

        <nav
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
        </nav>
      </div>
    </StoreProvider>
  );
}