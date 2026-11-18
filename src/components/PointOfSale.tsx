import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";

type Item = {
  id: string; name: string; sku?: string | null; barcode?: string | null; category?: string; description?: string;
  price: number; cost_price?: number | null; stock_quantity: number; low_stock_threshold?: number;
  unit?: string; image_key?: string | null; imageUrl?: string | null; item_type: string; track_stock: boolean; currency?: string;
};
type SaleRow = { id: string; sale_number: string; customer_name: string; customer_phone: string | null; items: any[]; subtotal: number; discount_amount: number; tax_amount: number; total_amount: number; cost_total: number; gross_profit: number; payment_method: string; payment_status: string; notes: string | null; status: string; created_at: string };
type ExpenseRow = { id: string; expense_date: string; category: string; description: string; amount: number; payment_method: string; receipt_reference: string | null; created_at: string };
type Movement = { id: string; product_id: string; movement_type: string; quantity_change: number; quantity_before: number; quantity_after: number; notes: string | null; created_at: string };
type CartLine = { product_id: string; name: string; price: number; quantity: number; stock: number; trackStock: boolean; imageUrl?: string | null };
type Tab = "sell" | "sales" | "expenses" | "stock";

const fmt = (value: number) => "KSh " + Number(value || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 });
const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
const localDay = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
const safeDate = (value: string) => new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

const CLOUDFLARE_POS_BASE = "https://twiga-business-files.twiga-ke.workers.dev/v1";
async function twigaCloudflare(businessId: string, path: string, options: RequestInit = {}) {
  if (!supabase) throw new Error("TWIGA sign-in is not ready.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sign in again before using the Money workspace.");
  const headers = {
    Authorization: `Bearer ${data.session.access_token}`,
    ...((options.headers || {}) as Record<string, string>),
    ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
  };
  const response = await fetch(`${CLOUDFLARE_POS_BASE}${path}`, { ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(result.error || "Cloudflare could not complete this Money action."));
  return result;
}

export default function PointOfSale({ onManageProducts }: { onManageProducts?: () => void }) {
  const { businessId, demoMode, products: demoProducts, sales: demoSales, settings } = useStore();
  const [tab, setTab] = useState<Tab>("sell");
  const [items, setItems] = useState<Item[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "product" | "service">("all");
  const [customer, setCustomer] = useState("Walk-in");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [expenseForm, setExpenseForm] = useState({ category: "Supplies", description: "", amount: "", payment_method: "cash", receipt_reference: "", notes: "" });
  const [stockProduct, setStockProduct] = useState("");
  const [stockChange, setStockChange] = useState("1");
  const [stockCost, setStockCost] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [stockType, setStockType] = useState("stock_in");
  const [lastReceipt, setLastReceipt] = useState<SaleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const currency = settings.business.currency || "KSh";

  const load = useCallback(async () => {
    if (demoMode) {
      const sample = demoProducts.map((p: any) => ({
        id: p.id, name: p.name, price: p.price, category: p.category, description: p.description || "",
        stock_quantity: p.stock, cost_price: p.costPrice || 0, low_stock_threshold: p.lowStockThreshold || 5,
        unit: p.unit || "piece", item_type: p.kind === "service" ? "service" : "product", track_stock: p.kind !== "service",
        currency: "KES", image_key: p.imageKey || null, imageUrl: p.imageUrl || null, sku: p.sku || "",
      }));
      setItems(sample);
      return;
    }
    if (!supabase || !businessId) { setItems([]); setSales([]); setExpenses([]); setMovements([]); return; }
    const [catalogue, pos] = await Promise.all([
      twigaCloudflare(businessId, `/products/${encodeURIComponent(businessId)}`),
      twigaCloudflare(businessId, `/pos/${encodeURIComponent(businessId)}?range=week`),
    ]);
    const mapped: Item[] = (Array.isArray(catalogue.products) ? catalogue.products : []).map((p: any) => ({
      id: String(p.id), name: String(p.name || ""), sku: p.sku || "", barcode: p.barcode || "",
      category: p.category || "General", description: p.description || "", price: Number(p.price || 0),
      cost_price: Number(p.costPrice || 0), stock_quantity: Number(p.stock || 0), low_stock_threshold: Number(p.lowStockThreshold || 5),
      unit: p.unit || "piece", image_key: p.imageKey || null, imageUrl: p.imageUrl || null,
      item_type: p.itemType === "service" ? "service" : "product", track_stock: p.trackStock !== false, currency: p.currency || "KES",
    }));
    setItems(mapped);
    setSales((pos.sales || []) as SaleRow[]);
    setExpenses((pos.expenses || []) as ExpenseRow[]);
    setMovements((pos.movements || []) as Movement[]);
    if (!stockProduct && mapped.length) setStockProduct(mapped[0].id);
  }, [businessId, demoMode, demoProducts, stockProduct]);

  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load Money records.")); }, [load]);

  const filtered = useMemo(() => items.filter((p) => {
    const matchesType = kind === "all" || p.item_type === kind;
    const haystack = (p.name + " " + (p.sku || "") + " " + (p.category || "") + " " + (p.barcode || "")).toLowerCase();
    return p.item_type !== "archived" && matchesType && haystack.includes(query.trim().toLowerCase());
  }), [items, query, kind]);
  const cartTotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const cartQty = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = Math.max(0, cartTotal - Math.max(0, Number(discount) || 0) + Math.max(0, Number(tax) || 0));
  const todaySales = sales.filter((x) => localDay(x.created_at) === todayKey() && x.status !== "voided");
  const todayRevenue = todaySales.filter((x) => x.payment_status === "paid").reduce((sum, x) => sum + Number(x.total_amount), 0);
  const todayExpenses = expenses.filter((x) => x.expense_date === todayKey()).reduce((sum, x) => sum + Number(x.amount), 0);
  const todayProfit = todaySales.filter((x) => x.payment_status === "paid").reduce((sum, x) => sum + Number(x.gross_profit), 0);
  const lowStock = items.filter((x) => x.track_stock && x.stock_quantity <= Number(x.low_stock_threshold || 0));

  const add = (p: Item) => setCart((current) => {
    const found = current.find((x) => x.product_id === p.id);
    const nextQty = (found?.quantity || 0) + 1;
    if (p.track_stock && nextQty > p.stock_quantity) { setMessage("Only " + p.stock_quantity + " " + (p.unit || "units") + " of " + p.name + " are available."); return current; }
    return found
      ? current.map((x) => x.product_id === p.id ? { ...x, quantity: nextQty } : x)
      : [...current, { product_id: p.id, name: p.name, price: p.price, quantity: 1, stock: p.stock_quantity, trackStock: p.track_stock, imageUrl: p.imageUrl }];
  });
  const changeQty = (id: string, delta: number) => setCart((current) => current.map((x) => {
    if (x.product_id !== id) return x;
    const quantity = x.quantity + delta;
    const source = items.find((p) => p.id === id);
    if (source?.track_stock && quantity > source.stock_quantity) { setMessage("Not enough stock for " + x.name + "."); return x; }
    return { ...x, quantity };
  }).filter((x) => x.quantity > 0));

  const checkout = async () => {
    if (!cart.length || demoMode) { if (demoMode) setMessage("Demo mode is view-only. Create a live business workspace to record real sales."); return; }
    if (!supabase || !businessId) { setMessage("Choose a business workspace first."); return; }
    if (Number(discount) < 0 || Number(tax) < 0 || Number(discount) > cartTotal) { setMessage("Check discount and tax values."); return; }
    setBusy(true); setMessage("");
    const paymentStatus = paymentMethod === "mpesa" ? "pending" : paymentMethod === "credit" ? "credit" : "paid";
    const confirmedPaid = paymentStatus === "paid";
    try {
      const result = await twigaCloudflare(businessId, `/pos/${encodeURIComponent(businessId)}/checkout`, {
        method: "POST",
        body: JSON.stringify({
          orderId: crypto.randomUUID(), date: todayKey(), items: cart.map((x) => ({ productId: x.product_id, qty: x.quantity, price: x.price })),
          customer: customer.trim() || "Walk-in", phone: customerPhone.trim(), method: paymentMethod,
          paymentStatus, confirmedPaid, deductStock: paymentStatus !== "pending",
          discountAmount: Number(discount) || 0, taxAmount: Number(tax) || 0,
        }),
      });
      const receipt: SaleRow = {
        id: result.orderId, sale_number: result.receipt || result.orderId, customer_name: customer.trim() || "Walk-in",
        customer_phone: customerPhone || null,
        items: (result.items || []).map((x: any) => ({ name: x.name, quantity: Number(x.qty), unit_price: Number(x.unitPrice), line_total: Number(x.total) })),
        subtotal: Number(result.subtotal || cartTotal), discount_amount: Number(result.discount || 0), tax_amount: Number(result.tax || 0),
        total_amount: Number(result.total || total), cost_total: 0, gross_profit: 0, payment_method: paymentMethod,
        payment_status: result.paymentStatus || paymentStatus, notes: null, status: result.status || "pending", created_at: result.createdAt || new Date().toISOString(),
      };
      await load(); setLastReceipt(receipt);
      setCart([]); setCustomer("Walk-in"); setCustomerPhone(""); setDiscount("0"); setTax("0");
      setMessage(paymentMethod === "mpesa"
        ? "Sale saved as pending. Use the Payments screen to request M-Pesa; only settle it after the provider confirms payment."
        : paymentMethod === "credit"
          ? "Sale recorded as customer credit. Stock was updated, but this is not counted as money collected."
          : "Sale completed in Cloudflare and stock was updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not complete this sale."); }
    finally { setBusy(false); }
  };

  const saveExpense = async () => {
    if (!expenseForm.description.trim() || Number(expenseForm.amount) <= 0) { setMessage("Add an expense description and amount greater than zero."); return; }
    if (demoMode) { setMessage("Demo mode does not save real expenses."); return; }
    if (!supabase || !businessId) return;
    setBusy(true); setMessage("");
    try {
      await twigaCloudflare(businessId, `/pos/${encodeURIComponent(businessId)}/expense`, {
        method: "POST",
        body: JSON.stringify({ category: expenseForm.category.trim() || "Other", description: expenseForm.description.trim(),
          amount: Number(expenseForm.amount), method: expenseForm.payment_method, notes: expenseForm.notes.trim(),
          receiptReference: expenseForm.receipt_reference.trim(), date: todayKey() }),
      });
      setExpenseForm({ category: "Supplies", description: "", amount: "", payment_method: "cash", receipt_reference: "", notes: "" });
      await load(); setMessage("Expense recorded in Cloudflare.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save expense."); }
    finally { setBusy(false); }
  };

  const adjustStock = async () => {
    if (!stockProduct || !Number(stockChange)) { setMessage("Choose an item and enter a stock quantity."); return; }
    if (demoMode) { setMessage("Demo mode does not update real stock."); return; }
    if (!supabase || !businessId) return;
    setBusy(true); setMessage("");
    try {
      await twigaCloudflare(businessId, `/pos/${encodeURIComponent(businessId)}/stock-movement`, {
        method: "POST",
        body: JSON.stringify({ itemId: stockProduct, quantityChange: Number(stockChange), unitCost: stockCost.trim() ? Number(stockCost) : 0,
          movementType: stockType, notes: stockNote.trim() }),
      });
      setStockChange("1"); setStockCost(""); setStockNote("");
      await load(); setMessage("Stock movement saved to Cloudflare and inventory updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update stock."); }
    finally { setBusy(false); }
  };

  const printReceipt = () => window.print();

  return <div className="space-y-5">
    <style>{'@media print { body * { visibility:hidden !important; } .twiga-print-receipt, .twiga-print-receipt * { visibility:visible !important; } .twiga-print-receipt { position:absolute !important; inset:0 !important; width:100% !important; padding:24px !important; background:white !important; color:#111 !important; } }'}</style>
    <header className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Money workspace</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-950">Point of Sale</h1><p className="mt-1 text-sm text-neutral-500">Sell products and services, manage stock, record expenses and print receipts.</p></div>
        <button onClick={() => void load()} disabled={busy} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700">Refresh records</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[["Collected today",fmt(todayRevenue)],["Sales today",String(todaySales.length)],["Gross profit",fmt(todayProfit)],["Expenses today",fmt(todayExpenses)],["Low stock",String(lowStock.length)]].map(([label,value]) => <div key={label} className="rounded-xl bg-neutral-50 p-4"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-xl font-bold text-neutral-950">{value}</p></div>)}
      </div>
    </header>

    <nav className="flex flex-wrap gap-1 rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
      {([["sell","Sell"],["sales","Sales history"],["expenses","Expenses"],["stock","Inventory"]] as [Tab,string][]).map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={"rounded-lg px-4 py-2 text-sm font-semibold " + (tab === id ? "bg-neutral-950 text-white" : "text-neutral-600 hover:bg-neutral-50")}>{label}</button>)}
    </nav>

    {tab === "sell" && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-950">Choose items</h2><p className="mt-1 text-xs text-neutral-500">{items.length} active products and services</p></div><div className="flex gap-1 rounded-lg bg-neutral-100 p-1">{(["all","product","service"] as const).map((x) => <button key={x} onClick={() => setKind(x)} className={"rounded-md px-3 py-1.5 text-xs font-semibold capitalize " + (kind === x ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500")}>{x === "all" ? "All" : x === "product" ? "Products" : "Services"}</button>)}</div></div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find product, SKU or service…" className="mt-4 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((p) => <button key={p.id} onClick={() => add(p)} disabled={p.track_stock && p.stock_quantity <= 0} className="rounded-xl border border-neutral-200 p-3 text-left transition hover:border-orange-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-45">
            <div className="flex items-start gap-3">{p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="h-14 w-14 rounded-lg object-cover" /> : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-orange-50 text-lg text-orange-600">{p.item_type === "service" ? "✦" : "□"}</div>}
              <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold text-neutral-950">{p.name}</p><p className="mt-1 text-xs text-neutral-500">{p.category || "General"}</p><p className="mt-2 text-sm font-bold text-orange-700">{fmt(p.price)}</p><p className="mt-1 text-[11px] text-neutral-400">{p.item_type === "service" || !p.track_stock ? "Service · no stock tracking" : p.stock_quantity + " " + (p.unit || "units") + " available"}</p></div>
            </div>
          </button>)}
          {filtered.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-500">No matching items. Add them in Products & services.</div>}
        </div>
      </section>
      <section className="h-fit rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-neutral-950">Current sale</h2><p className="text-xs text-neutral-500">{cartQty} item units</p></div><button onClick={() => setCart([])} disabled={!cart.length} className="text-xs font-semibold text-neutral-500 disabled:opacity-40">Clear</button></div>
        <div className="mt-4 space-y-2">{cart.length === 0 && <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">Tap a product or service to add it here.</div>}
          {cart.map((x) => <div key={x.product_id} className="flex items-center gap-2 rounded-xl bg-neutral-50 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-neutral-900">{x.name}</p><p className="text-xs text-neutral-500">{fmt(x.price)} each</p></div><div className="flex items-center gap-2"><button onClick={() => changeQty(x.product_id,-1)} className="grid h-7 w-7 place-items-center rounded-lg border bg-white">−</button><span className="w-5 text-center text-sm font-semibold">{x.quantity}</span><button onClick={() => changeQty(x.product_id,1)} className="grid h-7 w-7 place-items-center rounded-lg border bg-white">+</button></div><strong className="w-20 text-right text-sm">{fmt(x.price*x.quantity)}</strong></div>)}
        </div>
        <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
          <label className="block text-xs font-semibold text-neutral-600">Customer name<input value={customer} onChange={(e) => setCustomer(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" placeholder="Walk-in" /></label>
          <label className="block text-xs font-semibold text-neutral-600">Customer phone (optional)<input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" placeholder="+254 7xx xxx xxx" /></label>
          <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-semibold text-neutral-600">Discount (KES)<input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label><label className="block text-xs font-semibold text-neutral-600">Tax / surcharge<input type="number" min="0" value={tax} onChange={(e) => setTax(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label></div>
          <label className="block text-xs font-semibold text-neutral-600">Payment method<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal"><option value="cash">Cash</option><option value="mpesa">M-Pesa · pending until confirmed</option><option value="card">Card</option><option value="credit">Customer credit</option><option value="bank">Bank transfer</option></select></label>
          <div className="flex justify-between text-sm text-neutral-500"><span>Items subtotal</span><span>{fmt(cartTotal)}</span></div><div className="flex justify-between text-sm text-neutral-500"><span>Discount & tax</span><span>{fmt((Number(tax)||0)-(Number(discount)||0))}</span></div>
          <div className="flex justify-between border-t pt-3"><strong className="text-sm">Total</strong><strong className="text-2xl text-neutral-950">{fmt(total)}</strong></div>
          <button onClick={() => void checkout()} disabled={!cart.length || busy || demoMode} className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-orange-600 disabled:opacity-40">{busy ? "Saving sale…" : "Complete sale"}</button>
          {demoMode && <p className="text-xs text-neutral-500">Sample data is view-only. Real checkout is disabled in demo mode.</p>}
          {paymentMethod === "mpesa" && <p className="text-xs leading-5 text-orange-800">This records the sale as pending. Use Payments to initiate the actual M-Pesa request; a prompt is not proof of payment.</p>}
        </div>
      </section>
    </div>}

    {tab === "sales" && <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-950">Sales ledger</h2><p className="mt-1 text-xs text-neutral-500">Every completed sale, item breakdown, profit and payment state.</p></div><strong className="text-sm text-neutral-700">{sales.length} records</strong></div>
      <div className="mt-4 space-y-2">{sales.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-sm text-neutral-500">No live sales have been recorded yet.</p>}
        {sales.map((s) => <article key={s.id} className="rounded-xl border border-neutral-100 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong className="text-sm text-neutral-950">{s.sale_number || "Sale"}</strong><p className="mt-1 text-xs text-neutral-500">{s.customer_name} · {safeDate(s.created_at)}</p></div><div className="text-right"><strong className="text-base text-neutral-950">{fmt(Number(s.total_amount))}</strong><p className="mt-1 text-xs text-neutral-500">Profit {fmt(Number(s.gross_profit))}</p></div></div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">{(s.items || []).map((x: any, i: number) => <span key={i} className="rounded-lg bg-neutral-50 px-2 py-1 text-neutral-700">{x.quantity} × {x.name}</span>)}</div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-neutral-500">{String(s.payment_method).toUpperCase()} · {String(s.payment_status).toUpperCase()}</span><button onClick={() => setLastReceipt(s)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold">View receipt</button></div>
        </article>)}
      </div>
    </section>}

    {tab === "expenses" && <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <section className="h-fit rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-neutral-950">Record an expense</h2><p className="mt-1 text-xs text-neutral-500">Keep shop running costs separate from sales.</p>
        <div className="mt-4 space-y-3"><label className="block text-xs font-semibold text-neutral-600">Category<select value={expenseForm.category} onChange={(e) => setExpenseForm((x) => ({...x,category:e.target.value}))} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal"><option>Supplies</option><option>Rent</option><option>Utilities</option><option>Transport</option><option>Staff</option><option>Marketing</option><option>Repairs</option><option>Other</option></select></label>
          <label className="block text-xs font-semibold text-neutral-600">Description<input value={expenseForm.description} onChange={(e) => setExpenseForm((x) => ({...x,description:e.target.value}))} placeholder="What was paid for?" className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label>
          <label className="block text-xs font-semibold text-neutral-600">Amount (KES)<input type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm((x) => ({...x,amount:e.target.value}))} placeholder="0" className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label>
          <label className="block text-xs font-semibold text-neutral-600">Paid with<select value={expenseForm.payment_method} onChange={(e) => setExpenseForm((x) => ({...x,payment_method:e.target.value}))} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="card">Card</option></select></label>
          <label className="block text-xs font-semibold text-neutral-600">Receipt / reference<input value={expenseForm.receipt_reference} onChange={(e) => setExpenseForm((x) => ({...x,receipt_reference:e.target.value}))} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label>
          <label className="block text-xs font-semibold text-neutral-600">Notes<textarea rows={2} value={expenseForm.notes} onChange={(e) => setExpenseForm((x) => ({...x,notes:e.target.value}))} className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-normal" /></label>
          <button onClick={() => void saveExpense()} disabled={busy || demoMode} className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Save expense</button>
        </div>
      </section>
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-neutral-950">Expense history</h2><p className="mt-1 text-xs text-neutral-500">Latest business expenses</p></div><strong className="text-lg">{fmt(expenses.reduce((sum,x)=>sum+Number(x.amount),0))}</strong></div>
        <div className="mt-4 space-y-2">{expenses.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-500">No expenses recorded.</p>}
          {expenses.map((x) => <div key={x.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-100 p-3"><div><strong className="text-sm text-neutral-900">{x.description}</strong><p className="mt-1 text-xs text-neutral-500">{x.category} · {x.expense_date} · {x.payment_method}</p>{x.receipt_reference && <p className="mt-1 text-[11px] text-neutral-400">Receipt {x.receipt_reference}</p>}</div><strong className="text-sm">{fmt(Number(x.amount))}</strong></div>)}
        </div>
      </section>
    </div>}

    {tab === "stock" && <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <section className="h-fit rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-neutral-950">Update stock</h2><p className="mt-1 text-xs text-neutral-500">Stock changes are recorded with quantity before and after.</p>
        <div className="mt-4 space-y-3"><label className="block text-xs font-semibold text-neutral-600">Product<select value={stockProduct} onChange={(e) => setStockProduct(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal">{items.filter((x) => x.track_stock).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.stock_quantity} {p.unit || ""}</option>)}</select></label>
          <label className="block text-xs font-semibold text-neutral-600">Movement<select value={stockType} onChange={(e) => { setStockType(e.target.value); setStockChange(e.target.value === "waste" ? "-1" : "1"); }} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal"><option value="stock_in">Stock received</option><option value="adjustment">Adjustment (positive or negative)</option><option value="return">Customer return</option><option value="waste">Waste / damaged</option></select></label>
          <label className="block text-xs font-semibold text-neutral-600">Quantity change (+ / −)<input type="number" step="0.001" value={stockChange} onChange={(e) => setStockChange(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label>
          <label className="block text-xs font-semibold text-neutral-600">Unit cost (optional)<input type="number" min="0" step="0.01" value={stockCost} onChange={(e) => setStockCost(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label>
          <label className="block text-xs font-semibold text-neutral-600">Note / supplier / reference<input value={stockNote} onChange={(e) => setStockNote(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label>
          <button onClick={() => void adjustStock()} disabled={busy || demoMode || !items.some((x) => x.track_stock)} className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Save stock movement</button>
        </div>
      </section>
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div><h2 className="text-lg font-semibold text-neutral-950">Inventory levels</h2><p className="mt-1 text-xs text-neutral-500">Current stock and reorder thresholds.</p></div>
        <div className="mt-4 space-y-2">{items.filter((x) => x.track_stock).map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-100 p-3"><div><strong className="text-sm text-neutral-900">{p.name}</strong><p className="mt-1 text-xs text-neutral-500">{p.sku || "No SKU"} · Alert below {p.low_stock_threshold || 0}</p></div><div className="text-right"><strong className={"text-sm " + (p.stock_quantity <= Number(p.low_stock_threshold || 0) ? "text-orange-700" : "text-neutral-950")}>{p.stock_quantity} {p.unit || "units"}</strong><p className="text-[10px] text-neutral-400">{p.stock_quantity <= Number(p.low_stock_threshold || 0) ? "Reorder" : "Available"}</p></div></div>)}</div>
        <div className="mt-5 border-t border-neutral-100 pt-4"><h3 className="text-sm font-semibold text-neutral-900">Recent stock activity</h3><div className="mt-2 space-y-2">{movements.slice(0,20).map((m) => <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs"><span className="text-neutral-600">{items.find((p)=>p.id===m.product_id)?.name || "Product"} · {m.movement_type} · {safeDate(m.created_at)}</span><strong className={Number(m.quantity_change)<0 ? "text-orange-700" : "text-neutral-900"}>{Number(m.quantity_change)>0?"+":""}{m.quantity_change}</strong></div>)}</div></div>
      </section>
    </div>}

    {lastReceipt && <div className="twiga-print-receipt fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-neutral-200 bg-white p-4 shadow-xl print:static print:max-w-full print:border-0 print:shadow-none">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">TWIGA · Receipt</p><h3 className="mt-1 text-lg font-bold text-neutral-950">{lastReceipt.sale_number || "Sale receipt"}</h3></div><button onClick={() => setLastReceipt(null)} className="text-xs text-neutral-400 print:hidden">Close</button></div>
      <p className="mt-2 text-xs text-neutral-500">{lastReceipt.customer_name} · {safeDate(lastReceipt.created_at || new Date().toISOString())}</p>
      <div className="my-3 space-y-2 border-y border-dashed py-3">{(lastReceipt.items || []).map((x:any,i:number)=><div key={i} className="flex justify-between gap-3 text-sm"><span>{x.quantity} × {x.name}</span><strong>{fmt(Number(x.line_total || Number(x.unit_price)*Number(x.quantity)))}</strong></div>)}</div>
      <div className="flex justify-between text-sm text-neutral-500"><span>Subtotal</span><span>{fmt(Number(lastReceipt.subtotal))}</span></div><div className="mt-1 flex justify-between text-sm text-neutral-500"><span>Discount</span><span>{fmt(Number(lastReceipt.discount_amount))}</span></div>
      <div className="mt-2 flex justify-between text-base font-bold text-neutral-950"><span>Total</span><span>{fmt(Number(lastReceipt.total_amount))}</span></div>
      <p className="mt-2 text-xs text-neutral-500">{String(lastReceipt.payment_method || "").toUpperCase()} · {String(lastReceipt.payment_status || "").toUpperCase()}</p>
      <button onClick={printReceipt} className="mt-4 w-full rounded-lg bg-neutral-950 px-3 py-2 text-sm font-semibold text-white print:hidden">Print receipt</button>
    </div>}
    {message && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-700">{message}</p>}
  </div>;
}
