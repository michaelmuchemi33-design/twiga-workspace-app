import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconCart,
  IconPlus,
  IconTrash,
  IconCoin,
  IconBox,
  IconCheck,
  IconLink,
  IconSwap,
  IconSparkle,
  IconSearch,
  IconFile,
  IconClock,
  IconTag,
} from "@/components/Icons";
import {
  useStore,
  uid,
  stamp,
  type SaleLine,
  type Product,
  type SellMode,
} from "@/lib/store";
import { cn } from "@/lib/utils";

type CatalogTab = "sell" | "manage";

export default function PointOfSale() {
  const {
    products,
    sales,
    addSale,
    addProduct,
    removeProduct,
    importCatalog,
    catalogSource,
    sellMode,
    setSellMode,
  } = useStore();

  const [tab, setTab] = useState<CatalogTab>("sell");
  const [cart, setCart] = useState<SaleLine[]>([]);
  const [customer, setCustomer] = useState("Walk-in");
  const [query, setQuery] = useState("");

  const modeProducts = useMemo(
    () => products.filter((p) => p.kind === sellMode),
    [products, sellMode]
  );

  const total = useMemo(
    () => cart.reduce((sum, l) => sum + l.price * l.qty, 0),
    [cart]
  );

  const itemCount = useMemo(
    () => cart.reduce((sum, l) => sum + l.qty, 0),
    [cart]
  );

  const filtered = useMemo(
    () =>
      modeProducts.filter((p) =>
        p.name.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [modeProducts, query]
  );

  const addToCart = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setCart((c) => {
      const found = c.find((l) => l.productId === p.id);
      if (found)
        return c.map((l) =>
          l.productId === p.id ? { ...l, qty: l.qty + 1 } : l
        );
      return [...c, { productId: p.id, name: p.name, price: p.price, qty: 1 }];
    });
  };

  const changeQty = (id: string, delta: number) =>
    setCart((c) =>
      c
        .map((l) => (l.productId === id ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );

  const checkout = () => {
    if (!cart.length) return;
    addSale({ id: uid(), lines: cart, total, customer, time: stamp() });
    setCart([]);
    setCustomer("Walk-in");
  };

  const switchMode = (m: SellMode) => {
    setSellMode(m);
    setCart([]);
    setQuery("");
  };

  const isSeller = sellMode === "seller";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm">
            {isSeller ? (
              <IconBox className="h-6 w-6" />
            ) : (
              <IconSparkle className="h-6 w-6" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              Point of Sale
            </h1>
            <p className="text-sm text-neutral-500">
              {isSeller
                ? `${modeProducts.length} products in hand`
                : `${modeProducts.length} services offered`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-1">
            <ModeButton
              active={isSeller}
              onClick={() => switchMode("seller")}
              icon={<IconBox className="h-4 w-4" />}
              label="Seller"
            />
            <ModeButton
              active={!isSeller}
              onClick={() => switchMode("service")}
              icon={<IconSparkle className="h-4 w-4" />}
              label="Service"
            />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2">
            <IconLink className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-semibold text-orange-600">
              {catalogSource}
            </span>
          </div>
        </div>
      </div>

      <div className="flex rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
        <TabButton active={tab === "sell"} onClick={() => setTab("sell")}>
          Sell
        </TabButton>
        <TabButton active={tab === "manage"} onClick={() => setTab("manage")}>
          Catalog
        </TabButton>
      </div>

      {tab === "sell" ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card className="rounded-2xl border-neutral-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-lg font-semibold">
                  {isSeller ? "Products in Hand" : "Services Offered"}
                </CardTitle>
                <Badge className="border-neutral-900 bg-neutral-950 text-white">
                  {filtered.length}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={isSeller ? "Search products…" : "Search services…"}
                    className="pl-9"
                  />
                </div>

                {filtered.length === 0 && (
                  <p className="rounded-xl border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-400">
                    No items match "{query}"
                  </p>
                )}

                {isSeller ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {filtered.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addToCart(p.id)}
                        className="group flex flex-col rounded-xl border border-neutral-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md active:translate-y-0"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                            <IconBox className="h-5 w-5" />
                          </div>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-semibold",
                              p.stock <= 5
                                ? "bg-red-50 text-red-600"
                                : "bg-neutral-100 text-neutral-500"
                            )}
                          >
                            {p.stock}
                          </span>
                        </div>
                        <p className="mt-3 truncate text-sm font-medium text-neutral-900">
                          {p.name}
                        </p>
                        <p className="truncate text-xs text-neutral-400">
                          {p.category}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-sm font-bold text-orange-600">
                            KSh {p.price.toLocaleString()}
                          </span>
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-950 text-white opacity-0 transition-opacity group-hover:opacity-100">
                            <IconPlus className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 transition-all hover:border-orange-300 hover:shadow-sm"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                          <IconSparkle className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-neutral-900">
                            {p.name}
                          </p>
                          <p className="truncate text-xs text-neutral-500">
                            {p.description}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                              <IconTag className="h-3 w-3" /> {p.category}
                            </span>
                            {p.duration && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                                <IconClock className="h-3 w-3" /> {p.duration}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-sm font-bold text-orange-600">
                            KSh {p.price.toLocaleString()}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => addToCart(p.id)}
                            className="bg-neutral-950 text-white hover:bg-neutral-800"
                          >
                            <IconPlus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-neutral-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Recent Sales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sales.length === 0 && (
                  <p className="rounded-lg border border-dashed border-neutral-200 py-6 text-center text-sm text-neutral-400">
                    No sales recorded yet
                  </p>
                )}
                {sales.slice(0, 4).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-neutral-900">{s.customer}</p>
                      <p className="text-xs text-neutral-500">
                        {s.lines.length} item{s.lines.length === 1 ? "" : "s"} · {s.time}
                      </p>
                    </div>
                    <span className="font-semibold text-orange-600">
                      KSh {s.total.toLocaleString()}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-6 rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <IconCart className="h-5 w-5 text-orange-500" /> Current Sale
                  </CardTitle>
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-neutral-300">
                    {itemCount} item{itemCount === 1 ? "" : "s"}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className="border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500"
                  placeholder="Customer name"
                />

                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {cart.length === 0 && (
                    <p className="rounded-lg border border-dashed border-neutral-700 py-8 text-center text-sm text-neutral-500">
                      Tap the catalog to start a sale
                    </p>
                  )}
                  {cart.map((l) => (
                    <div
                      key={l.productId}
                      className="flex items-center justify-between gap-2 rounded-lg bg-neutral-900 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="text-xs text-neutral-400">
                          KSh {l.price.toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => changeQty(l.productId, -1)}
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-800 text-sm hover:bg-neutral-700"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-sm">{l.qty}</span>
                        <button
                          onClick={() => changeQty(l.productId, 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-800 text-sm hover:bg-neutral-700"
                        >
                          +
                        </button>
                        <button
                          onClick={() => changeQty(l.productId, -l.qty)}
                          className="ml-1 flex h-6 w-6 items-center justify-center rounded-md bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-neutral-800 pt-4">
                  <span className="text-sm text-neutral-400">Total</span>
                  <span className="text-2xl font-bold text-orange-500">
                    KSh {total.toLocaleString()}
                  </span>
                </div>

                <Button
                  onClick={checkout}
                  disabled={!cart.length}
                  className={cn(
                    "w-full bg-orange-500 text-white hover:bg-orange-600",
                    !cart.length && "opacity-50"
                  )}
                >
                  <IconCheck className="mr-2 h-4 w-4" /> Complete Sale
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <CatalogManager
          products={products}
          sellMode={sellMode}
          onAdd={addProduct}
          onRemove={removeProduct}
          onImport={importCatalog}
        />
      )}
    </div>
  );
}

function CatalogManager({
  products,
  sellMode,
  onAdd,
  onRemove,
  onImport,
}: {
  products: Product[];
  sellMode: SellMode;
  onAdd: (p: Product) => void;
  onRemove: (id: string) => void;
  onImport: (items: Product[], source: string) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("Retail");
  const [stock, setStock] = useState("10");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("30 min");
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  const isService = sellMode === "service";

  const submit = () => {
    const value = Number(price);
    if (!name.trim() || !value) return;
    onAdd({
      id: uid(),
      name: name.trim(),
      price: value,
      category,
      stock: isService ? 99 : Number(stock) || 0,
      source: "manual",
      kind: sellMode,
      description: description.trim() || undefined,
      duration: isService ? duration : undefined,
    });
    setName("");
    setPrice("");
    setStock("10");
    setDescription("");
  };

  const runImport = () => {
    if (!url.trim()) return;
    setImporting(true);
    setImported(false);
    window.setTimeout(() => {
      const scraped: Product[] = isService
        ? [
            { id: uid(), name: "Scalp Massage", price: 1600, category: "Treatment", stock: 99, source: "website", kind: "service", description: "Relaxing scalp massage with warm oils.", duration: "30 min" },
            { id: uid(), name: "Hot Towel Shave", price: 1300, category: "Grooming", stock: 99, source: "website", kind: "service", description: "Classic shave with hot towel prep.", duration: "25 min" },
          ]
        : [
            { id: uid(), name: "Argan Repair Mask", price: 1800, category: "Retail", stock: 30, source: "website", kind: "seller", description: "Weekly repair mask for damaged hair." },
            { id: uid(), name: "Styling Gel 200ml", price: 1100, category: "Retail", stock: 45, source: "website", kind: "seller", description: "Strong-hold gel with a matte finish." },
          ];
      onImport(scraped, url.replace(/^https?:\/\//, "").replace(/\/$/, ""));
      setImporting(false);
      setImported(true);
      setUrl("");
    }, 1400);
  };

  const list = products.filter((p) => p.kind === sellMode);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card className="rounded-2xl border-neutral-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg font-semibold">
              {isService ? "Service Database" : "Product Database"}
            </CardTitle>
            <Badge className="border-neutral-900 bg-neutral-950 text-white">
              {list.length}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {list.map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-3 rounded-xl border border-neutral-100 bg-white px-4 py-3 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                  {isService ? (
                    <IconSparkle className="h-4 w-4" />
                  ) : (
                    <IconBox className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {p.name}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {isService
                      ? `${p.category}${p.duration ? ` · ${p.duration}` : ""}`
                      : `${p.category} · ${p.stock} in stock`}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    p.source === "website"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-neutral-100 text-neutral-600"
                  )}
                >
                  {p.source === "website" ? "Web" : "Manual"}
                </span>
                <span className="text-sm font-semibold text-neutral-900">
                  KSh {p.price.toLocaleString()}
                </span>
                <button
                  onClick={() => onRemove(p.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <IconTrash className="h-4 w-4 text-neutral-400 hover:text-orange-500" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <IconLink className="h-4 w-4 text-orange-500" /> Connect Website
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourstore.co.ke"
              className="border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500"
            />
            <Button
              onClick={runImport}
              disabled={!url.trim() || importing}
              className={cn(
                "w-full bg-orange-500 text-white hover:bg-orange-600",
                (!url.trim() || importing) && "opacity-50"
              )}
            >
              {importing ? (
                <>
                  <IconSwap className="mr-2 h-4 w-4 animate-spin" /> Syncing…
                </>
              ) : (
                <>
                  <IconSwap className="mr-2 h-4 w-4" /> Import{" "}
                  {isService ? "services" : "catalog"}
                </>
              )}
            </Button>
            {imported && (
              <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3">
                <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-xs text-emerald-300">
                  Synced. New items are now available to your AI.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-neutral-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <IconFile className="h-4 w-4 text-orange-500" /> Add Manually
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                {isService ? "Service name" : "Item name"}
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isService ? "e.g. Kids Cut" : "e.g. Hair Oil 100ml"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Price (KSh)
                </Label>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="1000"
                />
              </div>
              {isService ? (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Duration
                  </Label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["15 min", "30 min", "45 min", "1 hr", "2 hr"].map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Stock
                  </Label>
                  <Input
                    type="number"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="10"
                  />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Category
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isService
                    ? ["Hair", "Grooming", "Treatment", "Colour", "Package"]
                    : ["Retail", "Tools", "Consumables", "Package"]
                  ).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                {isService ? "What it includes" : "Description"}
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  isService
                    ? "Describe the service so the AI can explain it…"
                    : "Short product description…"
                }
                rows={3}
              />
            </div>
            <Button
              onClick={submit}
              disabled={!name.trim() || !price}
              className={cn(
                "w-full bg-neutral-950 text-white hover:bg-neutral-800",
                (!name.trim() || !price) && "opacity-50"
              )}
            >
              <IconPlus className="mr-2 h-4 w-4" /> Add to{" "}
              {isService ? "services" : "catalog"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-orange-500 text-white shadow-sm"
          : "text-neutral-500 hover:text-neutral-900"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        active ? "bg-neutral-950 text-white" : "text-neutral-500 hover:text-neutral-900"
      )}
    >
      {children}
    </button>
  );
}