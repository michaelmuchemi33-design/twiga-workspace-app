import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useStore, uid } from "@/lib/store";
import {
  IconPlus,
  IconHelp,
  IconBell,
  IconClose,
  IconCheck,
  IconSparkle,
  IconBox,
  IconUsers,
  IconCard,
  IconChat,
} from "@/components/Icons";

interface Shop {
  id: string;
  name: string;
  location: string;
  staff: number;
}

const seedShops: Shop[] = [
  { id: "s1", name: "Nairobi Style Studio", location: "Kimathi Street", staff: 6 },
  { id: "s2", name: "Westlands Branch", location: "Sarit Centre", staff: 4 },
];

const helpTopics = [
  {
    icon: IconCard,
    title: "Collect a payment",
    body: "Open Pay, add your PalPlus key, then generate a link and push it to the customer's phone.",
  },
  {
    icon: IconBox,
    title: "Add products",
    body: "Go to Products, choose Seller or Service, set a price and stock, then add it to the catalog.",
  },
  {
    icon: IconUsers,
    title: "Follow up with customers",
    body: "People shows every customer in rows with a follow-up timer. Tap Follow up to reach out.",
  },
  {
    icon: IconChat,
    title: "Send WhatsApp updates",
    body: "Inbox holds all outbound messages. Compose delivery updates and they queue instantly.",
  },
];

export default function TopBar() {
  const { payments, tasks, customers } = useStore();
  const [shops, setShops] = useState<Shop[]>(seedShops);
  const [activeShop, setActiveShop] = useState("s1");
  const [panel, setPanel] = useState<"none" | "shop" | "help" | "alerts">("none");
  const [newShop, setNewShop] = useState("");
  const [newLocation, setNewLocation] = useState("");

  const alertCount =
    payments.filter((p) => p.status !== "paid").length +
    tasks.filter((t) => t.status === "failed").length +
    customers.filter((c) => c.followUpIn === 0).length;

  const addShop = () => {
    if (!newShop.trim()) return;
    const shop: Shop = {
      id: uid(),
      name: newShop.trim(),
      location: newLocation.trim() || "New location",
      staff: 0,
    };
    setShops((s) => [...s, shop]);
    setActiveShop(shop.id);
    setNewShop("");
    setNewLocation("");
    setPanel("none");
  };

  const current = shops.find((s) => s.id === activeShop) ?? shops[0];

  return (
    <div className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm shadow-orange-500/30">
            <IconSparkle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">
              {current.name}
            </p>
            <p className="truncate text-xs text-neutral-500">
              {current.location} · {current.staff} staff
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPanel((p) => (p === "shop" ? "none" : "shop"))}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors",
              panel === "shop"
                ? "border-orange-200 bg-orange-50 text-orange-600"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
            )}
          >
            <IconPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Shop</span>
          </button>

          <button
            onClick={() => setPanel((p) => (p === "help" ? "none" : "help"))}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors",
              panel === "help"
                ? "border-orange-200 bg-orange-50 text-orange-600"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
            )}
          >
            <IconHelp className="h-4 w-4" />
            <span className="hidden sm:inline">Help</span>
          </button>

          <button
            onClick={() => setPanel((p) => (p === "alerts" ? "none" : "alerts"))}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
              panel === "alerts"
                ? "border-orange-200 bg-orange-50 text-orange-600"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
            )}
          >
            <IconBell className="h-4 w-4" />
            {alertCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-xs font-bold text-white">
                {alertCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {panel !== "none" && (
        <div className="mx-auto max-w-7xl px-4 pb-4 sm:px-6">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg shadow-neutral-950/5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-900">
                {panel === "shop" && "Your shops"}
                {panel === "help" && "Quick help"}
                {panel === "alerts" && "Needs attention"}
              </p>
              <button
                onClick={() => setPanel("none")}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            {panel === "shop" && (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {shops.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveShop(s.id)}
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                        activeShop === s.id
                          ? "border-orange-200 bg-orange-50"
                          : "border-neutral-200 bg-white hover:bg-neutral-50"
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium text-neutral-900">
                          {s.name}
                        </p>
                        <p className="text-xs text-neutral-500">{s.location}</p>
                      </div>
                      {activeShop === s.id && (
                        <IconCheck className="h-4 w-4 text-orange-500" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-2 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      New shop name
                    </Label>
                    <Input
                      value={newShop}
                      onChange={(e) => setNewShop(e.target.value)}
                      placeholder="e.g. Mombasa Branch"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Location
                    </Label>
                    <Input
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      placeholder="e.g. Nyali"
                    />
                  </div>
                  <Button
                    onClick={addShop}
                    disabled={!newShop.trim()}
                    className={cn(
                      "bg-orange-500 text-white hover:bg-orange-600",
                      !newShop.trim() && "opacity-50"
                    )}
                  >
                    <IconPlus className="mr-1.5 h-4 w-4" /> Add
                  </Button>
                </div>
              </div>
            )}

            {panel === "help" && (
              <div className="grid gap-2 sm:grid-cols-2">
                {helpTopics.map((h) => (
                  <div
                    key={h.title}
                    className="flex gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white">
                      <h.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-neutral-900">
                        {h.title}
                      </p>
                      <p className="text-xs text-neutral-500">{h.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {panel === "alerts" && (
              <div className="space-y-2">
                {alertCount === 0 && (
                  <div className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                      <IconCheck className="h-4 w-4" />
                    </span>
                    <p className="text-sm text-neutral-600">
                      You're all caught up.
                    </p>
                  </div>
                )}
                {payments
                  .filter((p) => p.status !== "paid")
                  .slice(0, 3)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                          <IconCard className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-medium text-neutral-900">
                            {p.customer}
                          </p>
                          <p className="text-xs capitalize text-neutral-500">
                            Payment {p.status}
                          </p>
                        </div>
                      </div>
                      <Badge className="border-orange-200 bg-orange-50 text-orange-600">
                        {p.status}
                      </Badge>
                    </div>
                  ))}
                {customers
                  .filter((c) => c.followUpIn === 0)
                  .slice(0, 2)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-950 text-white">
                          <IconUsers className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-medium text-neutral-900">
                            {c.name}
                          </p>
                          <p className="text-xs text-neutral-500">
                            Follow-up due today
                          </p>
                        </div>
                      </div>
                      <Badge className="border-neutral-200 bg-neutral-100 text-neutral-700">
                        {c.stage}
                      </Badge>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}