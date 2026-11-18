import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useStore, uid, type Product, type SellMode } from "@/lib/store";

type ProductRow = {
  id: string; name: string; sku: string | null; description: string; category: string; price: number;
  cost_price: number | null; currency: string; unit: string; stock_quantity: number;
  low_stock_threshold: number; image_key: string | null; barcode: string | null;
  item_type: string; track_stock: boolean; is_active: boolean;
};
const blank = { name: "", sku: "", barcode: "", description: "", category: "General", price: "", costPrice: "", stock: "0", lowStockThreshold: "5", unit: "piece", kind: "seller" as SellMode };

async function shrinkPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = source;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The selected image could not be opened.")); });
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Image processing is not available on this device.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.84));
    if (!blob) throw new Error("The product photo could not be compressed.");
    if (blob.size > 4.8 * 1024 * 1024) throw new Error("This photo is still too large. Choose a smaller image.");
    return blob;
  } finally { URL.revokeObjectURL(source); }
}

export default function Products() {
  const { businessId, demoMode, products, replaceProducts, addProduct, removeProduct, settings } = useStore();
  const [rows, setRows] = useState<Product[]>(products);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | SellMode>("all");
  const [form, setForm] = useState(blank);
  const [photo, setPhoto] = useState<File | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const currency = settings.business.currency || "KSh";

  const load = useCallback(async () => {
    if (demoMode) { setRows(products); return; }
    if (!supabase || !businessId) { setRows([]); return; }
    const { data, error } = await supabase.from("twiga_products").select("*").eq("business_id", businessId).eq("is_active", true).order("name");
    if (error) throw error;
    const mapped = await Promise.all(((data || []) as ProductRow[]).map(async (row) => {
      let imageUrl: string | null = null;
      if (row.image_key) {
        const { data: signed } = await supabase.storage.from("twiga-product-images").createSignedUrl(row.image_key, 3600);
        imageUrl = signed?.signedUrl || null;
      }
      return {
        id: row.id, name: row.name, price: Number(row.price || 0), category: row.category || "General",
        stock: Number(row.stock_quantity || 0), source: "manual" as const,
        kind: row.item_type === "service" ? "service" as const : "seller" as const,
        description: row.description || "", sku: row.sku || "", barcode: row.barcode || "",
        costPrice: row.cost_price == null ? undefined : Number(row.cost_price), unit: row.unit || "piece",
        lowStockThreshold: Number(row.low_stock_threshold || 0), imageKey: row.image_key, imageUrl,
        trackStock: row.track_stock !== false, itemType: row.item_type === "service" ? "service" as const : "product" as const,
        currency: row.currency || "KES",
      } satisfies Product;
    }));
    setRows(mapped); replaceProducts(mapped);
  }, [businessId, demoMode, products, replaceProducts]);

  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load your catalogue.")); }, [load]);
  const filtered = useMemo(() => rows.filter((p) => {
    const matchesKind = filter === "all" || p.kind === filter;
    const text = (p.name + " " + (p.sku || "") + " " + p.category + " " + (p.barcode || "")).toLowerCase();
    return matchesKind && text.includes(query.trim().toLowerCase());
  }), [rows, filter, query]);
  const lowStock = rows.filter((p) => p.kind === "seller" && p.trackStock !== false && p.stock <= (p.lowStockThreshold ?? 5));
  const inventoryValue = rows.reduce((sum, p) => sum + (p.kind === "seller" ? p.price * p.stock : 0), 0);

  const reset = () => { setEditing(null); setForm(blank); setPhoto(null); };
  const startEdit = (p: Product) => {
    setEditing(p.id);
    setForm({ name: p.name, sku: p.sku || "", barcode: p.barcode || "", description: p.description || "", category: p.category || "General",
      price: String(p.price), costPrice: p.costPrice == null ? "" : String(p.costPrice), stock: String(p.stock),
      lowStockThreshold: String(p.lowStockThreshold ?? 5), unit: p.unit || (p.kind === "service" ? "service" : "piece"), kind: p.kind });
    setPhoto(null); setMessage("");
  };

  const save = async () => {
    if (!form.name.trim() || !Number.isFinite(Number(form.price)) || Number(form.price) < 0) { setMessage("Enter an item name and a valid selling price."); return; }
    if (!demoMode && (!supabase || !businessId)) { setMessage("Open a business workspace before saving products."); return; }
    setBusy(true); setMessage("");
    try {
      if (demoMode) {
        const item: Product = { id: editing || uid(), name: form.name.trim(), price: Number(form.price), category: form.category.trim() || "General",
          stock: form.kind === "service" ? 0 : Math.max(0, Number(form.stock) || 0), source: "manual", kind: form.kind,
          sku: form.sku.trim(), barcode: form.barcode.trim(), description: form.description.trim(),
          costPrice: form.costPrice === "" ? undefined : Number(form.costPrice), unit: form.unit,
          lowStockThreshold: Number(form.lowStockThreshold) || 0, trackStock: form.kind === "seller", itemType: form.kind === "service" ? "service" : "product" };
        if (editing) replaceProducts(rows.map((x) => x.id === editing ? item : x)); else addProduct(item);
        setRows((current) => editing ? current.map((x) => x.id === editing ? item : x) : [item, ...current]);
        reset(); setMessage("Sample catalogue item saved. Demo changes are not sent to customers."); return;
      }
      const id = editing || crypto.randomUUID();
      let imageKey = rows.find((x) => x.id === id)?.imageKey || null;
      if (photo) {
        const compressed = await shrinkPhoto(photo);
        const path = businessId + "/" + id + "/" + crypto.randomUUID() + ".webp";
        const { error: uploadError } = await supabase!.storage.from("twiga-product-images").upload(path, compressed, { contentType: "image/webp", upsert: false });
        if (uploadError) throw uploadError;
        imageKey = path;
      }
      const user = await supabase!.auth.getUser();
      const payload = {
        business_id: businessId, name: form.name.trim(), sku: form.sku.trim() || null, barcode: form.barcode.trim() || null,
        description: form.description.trim(), category: form.category.trim() || "General", price: Number(form.price),
        cost_price: form.costPrice === "" ? null : Number(form.costPrice), currency: "KES", unit: form.unit.trim() || "piece",
        stock_quantity: form.kind === "service" ? 0 : Math.max(0, Number(form.stock) || 0), low_stock_threshold: Number(form.lowStockThreshold) || 0,
        image_key: imageKey, item_type: form.kind === "service" ? "service" : "product", track_stock: form.kind !== "service",
        is_active: true, created_by: user.data.user?.id || null, updated_at: new Date().toISOString(),
      };
      const queryResult = editing
        ? await supabase!.from("twiga_products").update(payload).eq("business_id", businessId).eq("id", id).select("id").single()
        : await supabase!.from("twiga_products").insert({ id, ...payload }).select("id").single();
      if (queryResult.error) throw queryResult.error;
      await load();
      const sync = await supabase!.functions.invoke("twiga-sautikit", { body: { action: "sync_catalog", businessId } });
      setMessage(sync.error || sync.data?.error ? "Saved to your catalogue. The receptionist catalogue will sync when its SautiKit agent is available." : "Saved. Your SautiKit receptionist catalogue has been updated without changing the working phone route.");
      reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this catalogue item."); }
    finally { setBusy(false); }
  };

  const archive = async (id: string) => {
    if (!window.confirm("Remove this item from the active catalogue? Past sales are kept.")) return;
    if (demoMode) { removeProduct(id); setRows((current) => current.filter((x) => x.id !== id)); return; }
    if (!supabase || !businessId) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("twiga_products").update({ is_active: false, updated_at: new Date().toISOString() }).eq("business_id", businessId).eq("id", id);
      if (error) throw error;
      await load();
      const sync = await supabase.functions.invoke("twiga-sautikit", { body: { action: "sync_catalog", businessId } });
      setMessage(sync.error ? "Item archived. Receptionist sync will retry when SautiKit is connected." : "Item archived. Old sales remain in the ledger.");
      if (editing === id) reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not archive item."); }
    finally { setBusy(false); }
  };
  const onPhoto = (event: ChangeEvent<HTMLInputElement>) => setPhoto(event.target.files?.[0] || null);

  return <div className="space-y-6">
    <header className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Business catalogue</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-950">Products & services</h1><p className="mt-1 text-sm text-neutral-500">One catalogue powers checkout, stock records and SautiKit receptionist knowledge.</p></div>
        <button onClick={() => { reset(); document.getElementById("twiga-product-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600">+ Add product or service</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-neutral-50 p-4"><p className="text-xs text-neutral-500">Active catalogue</p><p className="mt-1 text-2xl font-bold text-neutral-950">{rows.length}</p></div>
        <div className="rounded-xl bg-neutral-50 p-4"><p className="text-xs text-neutral-500">Retail stock value</p><p className="mt-1 text-2xl font-bold text-neutral-950">{currency} {inventoryValue.toLocaleString()}</p></div>
        <div className="rounded-xl bg-neutral-50 p-4"><p className="text-xs text-neutral-500">Low stock alerts</p><p className="mt-1 text-2xl font-bold text-orange-600">{lowStock.length}</p></div>
      </div>
    </header>
    {lowStock.length > 0 && <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950"><strong>Stock running low:</strong> {lowStock.map((p) => p.name + " (" + p.stock + ")").join(", ")}</div>}
    <div id="twiga-product-form" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-950">Your catalogue</h2><p className="mt-1 text-xs text-neutral-500">{rows.length} live items · business-only access</p></div>
          <div className="flex gap-1 rounded-xl bg-neutral-100 p-1">{(["all","seller","service"] as const).map((x) => <button key={x} onClick={() => setFilter(x)} className={"rounded-lg px-3 py-1.5 text-xs font-semibold capitalize " + (filter === x ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500")}>{x === "all" ? "All" : x === "seller" ? "Products" : "Services"}</button>)}</div></div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, SKU, barcode or category…" className="mt-4 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400" />
        <div className="mt-4 space-y-2">
          {filtered.length === 0 && <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-12 text-center text-sm text-neutral-500">No catalogue items yet. Add a product or service to start.</div>}
          {filtered.map((p) => <article key={p.id} className="flex items-center gap-3 rounded-xl border border-neutral-100 p-3 hover:border-neutral-200">
            {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="h-14 w-14 rounded-lg object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-lg bg-orange-50 text-lg">{p.kind === "service" ? "✦" : "□"}</div>}
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-neutral-950">{p.name}</strong><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">{p.kind === "service" ? "Service" : "Product"}</span></div>
              <p className="mt-1 truncate text-xs text-neutral-500">{p.category}{p.sku ? " · SKU " + p.sku : ""}{p.barcode ? " · " + p.barcode : ""}</p>
              <p className="mt-1 text-xs text-neutral-600">{p.kind === "service" || p.trackStock === false ? "No stock tracking" : p.stock + " " + (p.unit || "units") + " in stock · low at " + (p.lowStockThreshold ?? 5)}</p></div>
            <div className="text-right"><strong className="text-sm text-neutral-950">{currency} {p.price.toLocaleString()}</strong><p className="mt-1 text-[10px] text-neutral-400">Selling price</p></div>
            <div className="flex flex-col gap-1"><button onClick={() => startEdit(p)} className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700">Edit</button><button onClick={() => void archive(p.id)} disabled={busy} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-neutral-500 hover:bg-neutral-100">Archive</button></div>
          </article>)}
        </div>
      </section>
      <section className="h-fit rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">{editing ? "Update item" : "New item"}</p><h2 className="mt-1 text-lg font-semibold text-neutral-950">{editing ? "Edit catalogue" : "Add to catalogue"}</h2></div>{editing && <button onClick={reset} className="text-xs font-semibold text-neutral-500">Cancel</button>}</div>
        <div className="mt-4 space-y-3">
          <div><label className="text-xs font-semibold text-neutral-600">Item type</label><div className="mt-1 grid grid-cols-2 gap-2">{(["seller","service"] as SellMode[]).map((v) => <button key={v} onClick={() => setForm((x) => ({ ...x, kind: v, unit: v === "service" ? "service" : "piece" }))} className={"rounded-lg border px-3 py-2 text-sm font-semibold " + (form.kind === v ? "border-orange-400 bg-orange-50 text-orange-800" : "border-neutral-200 text-neutral-600")}>{v === "seller" ? "Product" : "Service"}</button>)}</div></div>
          <label className="block text-xs font-semibold text-neutral-600">Name *<input value={form.name} onChange={(e) => setForm((x) => ({...x,name:e.target.value}))} placeholder="e.g. Hair treatment" className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label>
          <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-semibold text-neutral-600">Selling price *<input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm((x) => ({...x,price:e.target.value}))} placeholder="0" className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label><label className="block text-xs font-semibold text-neutral-600">Cost price<input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => setForm((x) => ({...x,costPrice:e.target.value}))} placeholder="Optional" className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label></div>
          <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-semibold text-neutral-600">Category<input value={form.category} onChange={(e) => setForm((x) => ({...x,category:e.target.value}))} placeholder="General" className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label><label className="block text-xs font-semibold text-neutral-600">Unit<input value={form.unit} onChange={(e) => setForm((x) => ({...x,unit:e.target.value}))} placeholder="piece" className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label></div>
          <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-semibold text-neutral-600">SKU<input value={form.sku} onChange={(e) => setForm((x) => ({...x,sku:e.target.value}))} placeholder="Optional" className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label><label className="block text-xs font-semibold text-neutral-600">Barcode<input value={form.barcode} onChange={(e) => setForm((x) => ({...x,barcode:e.target.value}))} placeholder="Optional" className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label></div>
          {form.kind === "seller" && <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-semibold text-neutral-600">Opening stock<input type="number" min="0" step="0.001" value={form.stock} onChange={(e) => setForm((x) => ({...x,stock:e.target.value}))} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label><label className="block text-xs font-semibold text-neutral-600">Low stock alert at<input type="number" min="0" step="1" value={form.lowStockThreshold} onChange={(e) => setForm((x) => ({...x,lowStockThreshold:e.target.value}))} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm font-normal" /></label></div>}
          <label className="block text-xs font-semibold text-neutral-600">Description for your receptionist<textarea value={form.description} onChange={(e) => setForm((x) => ({...x,description:e.target.value}))} rows={3} placeholder="What it includes, sizes, variations, usage or service duration…" className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-normal" /></label>
          <label className="block text-xs font-semibold text-neutral-600">Product photo<input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="mt-1 block w-full text-xs font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-orange-700" /><span className="mt-1 block text-[11px] font-normal text-neutral-400">Take a photo with your phone or upload one. Saved privately to this business.</span></label>
          {photo && <p className="text-xs text-neutral-600">Selected: {photo.name}</p>}
          <button onClick={() => void save()} disabled={busy} className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : editing ? "Save changes" : "Add to catalogue"}</button>
          <p className="text-[11px] leading-5 text-neutral-400">The receptionist receives the saved item name, description, price and available stock when its catalogue is published. It will not invent information that is missing.</p>
        </div>
      </section>
    </div>
    {message && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-700">{message}</p>}
  </div>;
}
