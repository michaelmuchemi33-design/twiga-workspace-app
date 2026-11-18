import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  IconHome,
  IconCart,
  IconCard,
  IconUsers,
  IconChat,
  IconSwap,
  IconChart,
  IconBox,
  IconGear,
  IconBell,
  IconFile,
  IconLogout,
  IconSparkle,
  IconPhone,
} from "@/components/Icons";

interface TabDef {
  id: string;
  label: string;
  icon: typeof IconHome;
}

const groups: { title: string; items: TabDef[] }[] = [
  {
    title: "Front Desk",
    items: [
      { id: "dashboard", label: "Home", icon: IconHome },
      { id: "setup", label: "Set up with AI", icon: IconSparkle },
      { id: "phone", label: "Phone & AI", icon: IconChat },
      { id: "outreach", label: "Outreach", icon: IconPhone },
      { id: "connections", label: "Connections", icon: IconUsers },
      { id: "organizer", label: "Organize", icon: IconSwap },
      { id: "functions", label: "Functions", icon: IconSparkle },
    ],
  },
  {
    title: "Money",
    items: [
      { id: "pos", label: "Money", icon: IconCart },
      { id: "payments", label: "Payments", icon: IconCard },
      { id: "products", label: "Products & services", icon: IconBox },
      { id: "reports", label: "Reports", icon: IconFile },
    ],
  },
  {
    title: "People",
    items: [
      { id: "customers", label: "People", icon: IconUsers },
      { id: "whatsapp", label: "Inbox", icon: IconChat },
    ],
  },
  {
    title: "System",
    items: [
      { id: "analytics", label: "Stats", icon: IconChart },
      { id: "alerts", label: "Alerts", icon: IconBell },
      { id: "profile", label: "Profile", icon: IconUsers },
      { id: "settings", label: "Settings", icon: IconGear },
    ],
  },
];

export default function SideRail({
  tab,
  onSelect,
}: {
  tab: string;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="fixed left-3 top-1/2 z-40 hidden -translate-y-1/2 lg:block"
    >
      <div
        className={cn(
          "rail-shell flex flex-col gap-1 rounded-3xl border border-neutral-800 bg-neutral-950 p-2 shadow-xl",
          expanded ? "w-56" : "w-16"
        )}
      >
        <div className="mb-1 flex items-center gap-2 px-1.5 py-2">
          <span className="rail-logo flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
            <IconSparkle className="h-5 w-5" />
          </span>
          <span
            className={cn(
              "whitespace-nowrap text-sm font-semibold text-white transition-all duration-300",
              expanded ? "opacity-100" : "w-0 overflow-hidden opacity-0"
            )}
          >
            AI Front Desk
          </span>
        </div>

        <div className="mx-1 h-px bg-neutral-800" />

        <div className="rail-scroll flex max-h-[62vh] flex-col gap-3 overflow-y-auto py-1">
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-1">
              <p
                className={cn(
                  "px-2 text-xs font-semibold uppercase tracking-widest text-orange-500/60 transition-all duration-300",
                  expanded ? "opacity-100" : "h-0 overflow-hidden opacity-0"
                )}
              >
                {g.title}
              </p>
              {g.items.map((item, i) => {
                const active = tab === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    style={{ animationDelay: `${i * 60}ms` }}
                    className={cn(
                      "rail-item group relative flex items-center gap-3 w-full rounded-xl px-2.5 py-2.5 text-left",
                      active
                        ? "bg-orange-500 text-white"
                        : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
                    )}
                  >
                    <span
                      className="rail-icon flex h-6 w-6 shrink-0 items-center justify-center"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span
                      className={cn(
                        "whitespace-nowrap text-sm font-medium transition-all duration-300",
                        expanded ? "opacity-100" : "w-0 overflow-hidden opacity-0"
                      )}
                    >
                      {item.label}
                    </span>
                    {!expanded && (
                      <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-lg border border-orange-500/30 bg-neutral-950 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 lg:block">
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mx-1 h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />

        <button
          onClick={() => onSelect("logout")}
          className={cn(
            "rail-item group relative flex items-center gap-3 w-full rounded-xl px-2.5 py-2.5 text-left",
            tab === "logout"
              ? "bg-orange-500 text-white shadow-lg shadow-orange-500/40"
              : "text-neutral-400 hover:bg-orange-500/10 hover:text-orange-400"
          )}
        >
          <span
            className="rail-icon flex h-6 w-6 shrink-0 items-center justify-center"
          >
            <IconLogout className="h-5 w-5" />
          </span>
          <span
            className={cn(
              "whitespace-nowrap text-sm font-medium transition-all duration-300",
              expanded ? "opacity-100" : "w-0 overflow-hidden opacity-0"
            )}
          >
            Log out
          </span>
        </button>
      </div>
    </aside>
  );
}