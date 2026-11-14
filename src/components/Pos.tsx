import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { seedProducts, seedSales } from "@/data/seed";
import type { CartLine, Product, Sale } from "@/types";
import {
  IconCart,
  IconCheck,
  IconCoin,
  IconPlus,
  IconTrash,
} from "@/components/Icons";

function money(n: number) {
  return `KSh ${n.toLocaleString()}`;
}

export function Pos() {
  const [products] = useState<Product[]>(seedProducts);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sales, setSales] = useState<Sale[]>(seedSales);
  const [method, setMethod] = useState<Sale["method"]>("mpesa");

  const total = useMemo(
    () => cart.reduce((s, l) => s + l.price * l.qty, 0),
    [cart],
  );

  const add = (p: Product) => {
    setCart((prev) => {
      const found = prev.find((l) => l.productId === p.id);
      if (found) {
        return prev.map((l) =>
          l.productId === p.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [...prev, { productId: p.id, name: p.name, price: p.price, qty: 1 }];
    });
  };

  const remove = (id: string) =>
    setCart((prev) => prev.filter((l) => l.productId !== id));

  const checkout = () => {
    if (!cart.length) return;
    const sale: Sale = {
      id: `s${Date.now()}`,
      lines: cart,
      total,
      method,
      soldAt: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setSales((prev) => [sale, ...prev]);
    setCart([]);
  };

  const todayTotal = sales.reduce((s, x) => s + x.total, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="border-slate-200 bg-white shadow-sm lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <IconCart className="h-5 w-5 text-emerald-600" />
            Sell items & services
          </CardTitle>
          <Badge variant="outline" className="border-emerald-200 text-emerald-700">
            {products.length} items
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => add(p)}
                className="group rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={
                      p.category === "Service"
                        ? "rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700"
                        : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                    }
                  >
                    {p.category}
                  </span>
                  <IconPlus className="h-4 w-4 text-slate-400 transition group-hover:text-emerald-600" />
                </div>
                <p className="mt-2 font-semibold text-slate-900">{p.name}</p>
                <p className="text-sm font-medium text-emerald-700">
                  {money(p.price)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.stock > 90 ? "Unlimited" : `${p.stock} in stock`}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <IconCoin className="h-5 w-5 text-emerald-600" />
              Current sale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <IconCart className="mx-auto h-6 w-6 text-slate-400" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Tap an item to add it to the sale.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((l) => (
                  <div
                    key={l.productId}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {l.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {l.qty} × {money(l.price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {money(l.price * l.qty)}
                      </span>
                      <button
                        onClick={() => remove(l.productId)}
                        className="text-slate-400 transition hover:text-rose-600"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-sm font-medium text-muted-foreground">
                Total
              </span>
              <span className="text-2xl font-bold text-slate-900">
                {money(total)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["mpesa", "cash", "card"] as Sale["method"][]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={
                    method === m
                      ? "rounded-lg border border-emerald-500 bg-emerald-50 px-2 py-2 text-xs font-semibold capitalize text-emerald-700"
                      : "rounded-lg border border-slate-200 px-2 py-2 text-xs font-medium capitalize text-slate-600 transition hover:border-slate-300"
                  }
                >
                  {m}
                </button>
              ))}
            </div>

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={!cart.length}
              onClick={checkout}
            >
              <IconCheck className="mr-2 h-4 w-4" />
              Complete sale
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg font-semibold text-slate-900">
              Today's sales
            </CardTitle>
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              {money(todayTotal)}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {sales.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">
                    {money(s.total)}
                  </span>
                  <span className="text-xs capitalize text-muted-foreground">
                    {s.method} · {s.soldAt}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}