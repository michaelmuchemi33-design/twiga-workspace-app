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
import { cn } from "@/lib/utils";
import { useStore, uid, type Product, type SellMode } from "@/lib/store";
import AnimatedNumber from "@/components/AnimatedNumber";
import {
  IconBox,
  IconPlus,
  IconTrash,
  IconSearch,
  IconSparkle,
  IconTag,
  IconAlert,
  IconCoin,
} from "@/components/Icons";

type Filter = "all" | SellMode;

export default function Products() {
  const { products, addProduct, removeProduct, settings } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("10");
  const [category, setCategory] = useState("Retail");
  const [kind, setKind] = useState<SellMode>("seller");

  const currency = settings.business.currency;

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchKind = filter === "all" || p.kind === filter;
      const matchQuery = p.name.toLowerCase().includes(query.trim().toLowerCase());
      return matchKind && matchQuery;
    });
  }, [products, filter, query]);

  const lowStock = products.filter((p) => p.kind === "seller" && p.stock <= 5);
  const inventoryValue = products
    .filter((p) => p.kind === "seller")
    .reduce((sum, p) => sum + p.price * p.stock, 0);

  const submit = () => {
    const value = Number(price);
    if (!name.trim() || !value) return;
    const p: Product = {
      id: uid(),
      name: name.trim(),
      price: value,
      category,
      stock: kind === "service" ? 99 : Number(stock) || 0,
      source: "manual",
      kind,
    };
    addProduct(p);
    setName("");
    setPrice("");
    setStock("10");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
            Inventory
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            Products &amp; Services
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {products.length} items in your catalog
          </p>
        </div>
        <div className="flex gap-3">
          <MiniStat
            label="Inventory value"
            value={inventoryValue}
            currency={currency}
            tone="orange"
          />
          <MiniStat
            label="Low stock"
            value={lowStock.length}
            tone="dark"
          />
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
            <IconAlert className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              {lowStock.length} item{lowStock.length === 1 ? "" : "s"} running low
            </p>
            <p className="text-xs text-neutral-600">
              {lowStock.map((p) => p.name).join(", ")} — restock soon.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl border-neutral-200 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-semibold">
                <IconBox className="h-5 w-5 text-orange-500" /> Catalog
              </CardTitle>
              <CardDescription>Everything your AI can sell</CardDescription>
            </div>
            <Badge className="border-neutral-900 bg-neutral-950 text-white">
              {filtered.length}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search catalog…"
                  className="pl-9"
                />
              </div>
              <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-1">
                {(["all", "seller", "service"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                      filter === f
                        ? "bg-orange-500 text-white"
                        : "text-neutral-500 hover:text-neutral-900"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 && (
              <p className="rounded-xl border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-400">
                No items match your filters
              </p>
            )}

            <div className="space-y-2">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  className="group flex items-center gap-3 rounded-xl border border-neutral-100 bg-white px-4 py-3 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      p.kind === "service"
                        ? "bg-orange-50 text-orange-500"
                        : "bg-neutral-950 text-white"
                    )}
                  >
                    {p.kind === "service" ? (
                      <IconSparkle className="h-4 w-4" />
                    ) : (
                      <IconBox className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {p.name}
                    </p>
                    <p className="flex items-center gap-1 truncate text-xs text-neutral-500">
                      <IconTag className="h-3 w-3" /> {p.category}
                      {p.kind === "seller" && ` · ${p.stock} in stock`}
                    </p>
                  </div>
                  {p.kind === "seller" && p.stock <= 5 && (
                    <Badge className="border-orange-200 bg-orange-50 text-orange-600">
                      Low
                    </Badge>
                  )}
                  <span className="text-sm font-semibold text-neutral-900">
                    {currency} {p.price.toLocaleString()}
                  </span>
                  <button
                    onClick={() => removeProduct(p.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <IconTrash className="h-4 w-4 text-neutral-400 hover:text-orange-500" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="sticky top-6 h-fit rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <IconPlus className="h-5 w-5 text-orange-500" /> Add item
            </CardTitle>
            <CardDescription className="text-neutral-400">
              Add a product or service to the catalog
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex rounded-xl border border-neutral-700 bg-neutral-900 p-1">
              {(["seller", "service"] as SellMode[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    kind === k
                      ? "bg-orange-500 text-white"
                      : "text-neutral-400 hover:text-white"
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Name
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === "service" ? "e.g. Kids Cut" : "e.g. Hair Oil"}
                className="border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Price ({currency})
                </Label>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="1000"
                  className="border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  {kind === "service" ? "Category" : "Stock"}
                </Label>
                {kind === "service" ? (
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Hair"
                    className="border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500"
                  />
                ) : (
                  <Input
                    type="number"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="10"
                    className="border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500"
                  />
                )}
              </div>
            </div>
            {kind === "seller" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Category
                </Label>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Retail"
                  className="border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500"
                />
              </div>
            )}
            <Button
              onClick={submit}
              disabled={!name.trim() || !price}
              className={cn(
                "w-full bg-orange-500 text-white hover:bg-orange-600",
                (!name.trim() || !price) && "opacity-50"
              )}
            >
              <IconPlus className="mr-2 h-4 w-4" /> Add to catalog
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: number;
  currency?: string;
  tone: "orange" | "dark";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        tone === "orange"
          ? "border-orange-200 bg-orange-50"
          : "border-neutral-200 bg-neutral-50"
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 flex items-center gap-1 text-lg font-bold",
          tone === "orange" ? "text-orange-600" : "text-neutral-900"
        )}
      >
        <IconCoin className="h-4 w-4" />
        {currency ? (
          <AnimatedNumber value={value} prefix={`${currency} `} />
        ) : (
          value
        )}
      </p>
    </div>
  );
}