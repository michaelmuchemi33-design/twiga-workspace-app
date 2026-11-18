import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";

export type TaskStatus = "done" | "pending" | "failed";
export type PaymentStatus = "paid" | "pending" | "expired";
export type MessageStatus = "queued" | "sent" | "delivered";
export type CallStatus = "live" | "completed" | "missed" | "transferred";
export type SellMode = "seller" | "service";

export interface Task {
  id: string;
  label: string;
  detail: string;
  status: TaskStatus;
  time: string;
}

export interface SaleLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export interface Sale {
  id: string;
  lines: SaleLine[];
  total: number;
  customer: string;
  time: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  source: "manual" | "website";
  kind: SellMode;
  description?: string;
  duration?: string;
  sku?: string;
  barcode?: string;
  costPrice?: number;
  unit?: string;
  lowStockThreshold?: number;
  imageKey?: string | null;
  imageUrl?: string | null;
  trackStock?: boolean;
  itemType?: "product" | "service";
  currency?: string;
}

export interface Payment {
  id: string;
  customer: string;
  phone: string;
  amount: number;
  note?: string;
  status: PaymentStatus;
  link: string;
  time: string;
}

export interface Message {
  id: string;
  to: string;
  phone?: string;
  body: string;
  status: MessageStatus;
  time: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  stage: "VIP" | "Active" | "At Risk" | "New";
  spend: number;
  lastVisit: string;
  followUpIn: number;
}

export interface LiveCall {
  id: string;
  caller: string;
  phone: string;
  intent: string;
  duration: string;
  sentiment: "positive" | "neutral" | "negative";
}

export interface CallRecord {
  id: string;
  provider: string;
  provider_call_id: string;
  channel: string;
  direction: string;
  from_number: string | null;
  to_number: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  summary: string | null;
  structured_data: Record<string, unknown>;
  cost_usd: number | null;
  created_at: string;
}

export interface Settings {
  business: {
    name: string;
    currency: string;
    dateFormat: string;
    timezone: string;
    openTime: string;
    closeTime: string;
    holidayOverride: boolean;
    address: string;
    parking: string;
    website: string;
    faqs: string;
  };
  persona: {
    voice: string;
    accent: string;
    speed: number;
    greeting: string;
    closing: string;
    tone: string;
    primaryLang: string;
    fallbackLang: string;
  };
  routing: {
    forwardOnAngry: boolean;
    forwardOnManager: boolean;
    forwardOnComplex: boolean;
    escalationNumber: string;
    vipNumbers: string;
    vipKeywords: string;
    maxDuration: number;
    silenceTimeout: number;
  };
  scheduling: {
    calendar: string;
    bufferMinutes: number;
    minNotice: number;
    cancellationPolicy: string;
    notifySms: boolean;
    notifyEmail: boolean;
    notifySlack: boolean;
    notifyPush: boolean;
    recording: boolean;
    disclaimer: string;
  };
}

interface StoreValue {
  demoMode: boolean;
  businessId?: string;
  tasks: Task[];
  products: Product[];
  sales: Sale[];
  payments: Payment[];
  messages: Message[];
  customers: Customer[];
  liveCalls: LiveCall[];
  callRecords: CallRecord[];
  settings: Settings;
  catalogSource: string;
  sellMode: SellMode;
  palplusKey: string;
  setPalplusKey: (key: string) => void;
  setSellMode: (m: SellMode) => void;
  completeTask: (id: string) => void;
  addSale: (sale: Sale) => void;
  addPayment: (p: Payment) => void;
  markPaid: (id: string) => void;
  addMessage: (m: Message) => void;
  advanceCustomer: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  addProduct: (p: Product) => void;
  removeProduct: (id: string) => void;
  replaceProducts: (items: Product[]) => void;
  importCatalog: (items: Product[], source: string) => void;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

export const stamp = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const demoNow = Date.now();
const demoAgo = (minutes: number) => new Date(demoNow - minutes * 60_000).toISOString();
const demoTime = (minutes: number) => new Date(demoNow - minutes * 60_000).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });

const demoProducts: Product[] = [
  { id: "demo-haircut", name: "Classic haircut", price: 500, category: "Barber services", stock: 99, source: "manual", kind: "service", duration: "30 min" },
  { id: "demo-beard", name: "Beard trim", price: 300, category: "Barber services", stock: 99, source: "manual", kind: "service", duration: "20 min" },
  { id: "demo-braids", name: "Knotless braids", price: 4500, category: "Salon services", stock: 99, source: "manual", kind: "service", duration: "3 hr" },
  { id: "demo-shampoo", name: "Moisture shampoo", price: 850, category: "Hair care", stock: 18, source: "manual", kind: "seller" },
  { id: "demo-oil", name: "Natural hair oil", price: 650, category: "Hair care", stock: 4, source: "manual", kind: "seller" },
  { id: "demo-conditioner", name: "Daily conditioner", price: 950, category: "Hair care", stock: 12, source: "manual", kind: "seller" },
  { id: "demo-gel", name: "Styling gel", price: 400, category: "Styling", stock: 2, source: "manual", kind: "seller" },
  { id: "demo-wash", name: "Wash & blow-dry", price: 1200, category: "Salon services", stock: 99, source: "manual", kind: "service", duration: "45 min" },
];

const demoTasks: Task[] = [
  { id: "demo-task-1", label: "Confirm Amina's haircut booking", detail: "Check the 10:30 AM slot and confirm the barber is available.", status: "pending", time: "Due in 15 min" },
  { id: "demo-task-2", label: "Call back Brian about a quote", detail: "Customer explicitly requested a callback after 2:00 PM. Approval is still required.", status: "pending", time: "Today · 2:00 PM" },
  { id: "demo-task-3", label: "Restock natural hair oil", detail: "Only four bottles remain in the sample inventory.", status: "pending", time: "Today" },
  { id: "demo-task-4", label: "Send order update to Wanjiku", detail: "Prepare an order status update for staff review.", status: "done", time: "Yesterday" },
];

const demoCustomers: Customer[] = [
  { id: "demo-customer-1", name: "Amina Njeri", phone: "+254712345601", stage: "VIP", spend: 18500, lastVisit: "Today", followUpIn: 0 },
  { id: "demo-customer-2", name: "Brian Otieno", phone: "+254712345602", stage: "Active", spend: 7200, lastVisit: "Yesterday", followUpIn: 1 },
  { id: "demo-customer-3", name: "Wanjiku Mwangi", phone: "+254712345603", stage: "Active", spend: 12400, lastVisit: "2 days ago", followUpIn: 3 },
  { id: "demo-customer-4", name: "Kevin Kiptoo", phone: "+254712345604", stage: "At Risk", spend: 3200, lastVisit: "34 days ago", followUpIn: 0 },
  { id: "demo-customer-5", name: "Faith Wambui", phone: "+254712345605", stage: "New", spend: 0, lastVisit: "New lead", followUpIn: 2 },
  { id: "demo-customer-6", name: "David Kamau", phone: "+254712345606", stage: "Active", spend: 5600, lastVisit: "Last week", followUpIn: 5 },
];

const demoSales: Sale[] = [
  { id: "demo-sale-1", lines: [{ productId: "demo-haircut", name: "Classic haircut", price: 500, qty: 1 }, { productId: "demo-beard", name: "Beard trim", price: 300, qty: 1 }], total: 800, customer: "Amina Njeri", time: demoTime(35) },
  { id: "demo-sale-2", lines: [{ productId: "demo-braids", name: "Knotless braids", price: 4500, qty: 1 }], total: 4500, customer: "Wanjiku Mwangi", time: demoTime(110) },
  { id: "demo-sale-3", lines: [{ productId: "demo-shampoo", name: "Moisture shampoo", price: 850, qty: 2 }], total: 1700, customer: "Walk-in customer", time: demoTime(190) },
];

const demoPayments: Payment[] = [
  { id: "demo-payment-1", customer: "Amina Njeri", phone: "+254712345601", amount: 800, note: "Haircut and beard trim", status: "paid", link: "#demo-payment-1", time: demoTime(30) },
  { id: "demo-payment-2", customer: "Wanjiku Mwangi", phone: "+254712345603", amount: 4500, note: "Knotless braids deposit", status: "pending", link: "#demo-payment-2", time: demoTime(85) },
  { id: "demo-payment-3", customer: "David Kamau", phone: "+254712345606", amount: 1200, note: "Wash and blow-dry", status: "expired", link: "#demo-payment-3", time: demoTime(220) },
];

const demoMessages: Message[] = [
  { id: "demo-message-1", to: "Amina Njeri", phone: "+254712345601", body: "Your haircut booking request has been received. Our team will confirm your time shortly.", status: "delivered", time: demoTime(18) },
  { id: "demo-message-2", to: "Wanjiku Mwangi", phone: "+254712345603", body: "Your order is being prepared. We will update you when it is ready for collection.", status: "sent", time: demoTime(70) },
  { id: "demo-message-3", to: "Brian Otieno", phone: "+254712345602", body: "Thanks for contacting us. Would 2:00 PM work for the callback you requested?", status: "queued", time: demoTime(130) },
];

const demoLiveCalls: LiveCall[] = [
  { id: "demo-live-1", caller: "Amina Njeri", phone: "+254712345601", intent: "Appointment request", duration: "2m 14s", sentiment: "positive" },
  { id: "demo-live-2", caller: "Brian Otieno", phone: "+254712345602", intent: "Service pricing", duration: "1m 08s", sentiment: "neutral" },
];

const demoCallRecords: CallRecord[] = [
  { id: "demo-call-1", provider: "demo", provider_call_id: "sample-001", channel: "phone", direction: "inbound", from_number: "+254712345601", to_number: "+254700000000", status: "completed", started_at: demoAgo(18), ended_at: demoAgo(16), duration_seconds: 134, summary: "Customer requested a haircut and beard trim. Appointment request saved for staff confirmation.", structured_data: { appointment_request: true, customer_name: "Amina Njeri" }, cost_usd: 0, created_at: demoAgo(18) },
  { id: "demo-call-2", provider: "demo", provider_call_id: "sample-002", channel: "phone", direction: "inbound", from_number: "+254712345602", to_number: "+254700000000", status: "completed", started_at: demoAgo(63), ended_at: demoAgo(62), duration_seconds: 68, summary: "Asked about haircut and styling prices. AI answered from the sample catalogue.", structured_data: {}, cost_usd: 0, created_at: demoAgo(63) },
  { id: "demo-call-3", provider: "demo", provider_call_id: "sample-003", channel: "phone", direction: "outbound", from_number: "+254700000000", to_number: "+254712345603", status: "no_answer", started_at: demoAgo(150), ended_at: demoAgo(149), duration_seconds: 0, summary: "Sample callback attempt. No answer.", structured_data: {}, cost_usd: 0, created_at: demoAgo(150) },
  { id: "demo-call-4", provider: "demo", provider_call_id: "sample-004", channel: "phone", direction: "inbound", from_number: "+254712345604", to_number: "+254700000000", status: "missed", started_at: demoAgo(240), ended_at: null, duration_seconds: 0, summary: "Missed call. Create an internal task; callback requires customer consent and owner approval.", structured_data: {}, cost_usd: 0, created_at: demoAgo(240) },
  { id: "demo-call-5", provider: "demo", provider_call_id: "sample-005", channel: "phone", direction: "inbound", from_number: "+254712345605", to_number: "+254700000000", status: "completed", started_at: demoAgo(350), ended_at: demoAgo(348), duration_seconds: 108, summary: "New customer requested information about salon services.", structured_data: { lead_captured: true }, cost_usd: 0, created_at: demoAgo(350) },
];

const demoSettings: Settings = {
  business: { name: "TWIGA Sample Salon & Barber", currency: "KSh", dateFormat: "DD/MM/YYYY", timezone: "Africa/Nairobi", openTime: "08:00", closeTime: "19:00", holidayOverride: false, address: "Nairobi, Kenya · Sample location", parking: "Sample parking details", website: "https://example.com", faqs: "Sample prices, bookings, opening hours and payment questions." },
  persona: { voice: "Woman", accent: "Kenyan English and Kiswahili", speed: 1, greeting: "Hello, karibu! Thank you for calling. How can I help you today?", closing: "Asante for calling. Have a lovely day!", tone: "Warm and professional", primaryLang: "English", fallbackLang: "Kiswahili" },
  routing: { forwardOnAngry: true, forwardOnManager: true, forwardOnComplex: true, escalationNumber: "+254700000001", vipNumbers: "", vipKeywords: "manager,complaint,urgent", maxDuration: 20, silenceTimeout: 8 },
  scheduling: { calendar: "Google Calendar · sample only", bufferMinutes: 15, minNotice: 2, cancellationPolicy: "Sample bookings require staff confirmation.", notifySms: true, notifyEmail: true, notifySlack: false, notifyPush: true, recording: false, disclaimer: "This is sample data. No real calls or messages are sent." },
};

const StoreContext = createContext<StoreValue | null>(null);

const emptySettings: Settings = {
  business: {
    name: "", currency: "KSh", dateFormat: "DD/MM/YYYY", timezone: "Africa/Nairobi",
    openTime: "", closeTime: "", holidayOverride: false, address: "", parking: "", website: "", faqs: "",
  },
  persona: {
    voice: "", accent: "Kenyan English", speed: 1, greeting: "", closing: "", tone: "Friendly",
    primaryLang: "English", fallbackLang: "Kiswahili",
  },
  routing: {
    forwardOnAngry: false, forwardOnManager: false, forwardOnComplex: false, escalationNumber: "",
    vipNumbers: "", vipKeywords: "", maxDuration: 20, silenceTimeout: 8,
  },
  scheduling: {
    calendar: "Google Calendar", bufferMinutes: 15, minNotice: 2, cancellationPolicy: "",
    notifySms: false, notifyEmail: true, notifySlack: false, notifyPush: true,
    recording: false, disclaimer: "",
  },
};

export function StoreProvider({
  children,
  demo = false,
  userId,
  businessId,
}: {
  children: ReactNode;
  demo?: boolean;
  userId?: string;
  businessId?: string;
}) {
  const [tasks, setTasks] = useState<Task[]>(demo ? demoTasks : []);
  const [products, setProducts] = useState<Product[]>(demo ? demoProducts : []);
  const [sales, setSales] = useState<Sale[]>(demo ? demoSales : []);
  const [payments, setPayments] = useState<Payment[]>(demo ? demoPayments : []);
  const [messages, setMessages] = useState<Message[]>(demo ? demoMessages : []);
  const [customers, setCustomers] = useState<Customer[]>(demo ? demoCustomers : []);
  const [callRecords, setCallRecords] = useState<CallRecord[]>(demo ? demoCallRecords : []);
  const [settings, setSettings] = useState<Settings>(demo ? demoSettings : emptySettings);
  const [catalogSource, setCatalogSource] = useState(demo ? "Sample catalogue" : "Not configured");
  const [sellMode, setSellMode] = useState<SellMode>("seller");
  const [palplusKey, setPalplusKey] = useState("");
  const [workspaceReady, setWorkspaceReady] = useState(demo || !businessId || !supabase);
  const hydrated = useRef(demo || !businessId || !supabase);

  useEffect(() => {
    if (demo) {
      hydrated.current = true;
      setWorkspaceReady(true);
      return;
    }
    if (!userId || !businessId || !supabase) {
      hydrated.current = false;
      setTasks([]);
      setProducts([]);
      setSales([]);
      setPayments([]);
      setMessages([]);
      setCustomers([]);
      setCallRecords([]);
      setSettings(emptySettings);
      setCatalogSource("Not configured");
      setSellMode("seller");
      setWorkspaceReady(true);
      return;
    }
    let cancelled = false;
    const callChannel = supabase.channel(`twiga-call-records-${businessId}`).on("postgres_changes", { event: "*", schema: "public", table: "twiga_call_records", filter: `business_id=eq.${businessId}` }, (payload) => {
      if (payload.eventType === "DELETE") {
        const old = payload.old as Partial<CallRecord>;
        setCallRecords((current) => current.filter((call) => call.id !== old.id));
        return;
      }
      const next = payload.new as CallRecord;
      setCallRecords((current) => [next, ...current.filter((call) => call.id !== next.id)].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 30));
    }).subscribe();
    hydrated.current = false;
    setWorkspaceReady(false);
    setTasks([]);
    setProducts([]);
    setSales([]);
    setPayments([]);
    setMessages([]);
    setCustomers([]);
    setCallRecords([]);
    setSettings(emptySettings);
    setCatalogSource("Manual entry");
    setSellMode("seller");
    const load = async () => {
      const { data, error } = await supabase
        .from("twiga_business_workspace_data")
        .select("workspace_data")
        .eq("business_id", businessId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("Unable to load this business workspace", error.message);
        setWorkspaceReady(true);
        return;
      }
      const saved = data?.workspace_data as Partial<{
        tasks: Task[]; products: Product[]; sales: Sale[]; payments: Payment[];
        messages: Message[]; customers: Customer[]; settings: Settings;
        catalogSource: string; sellMode: SellMode;
      }> | undefined;
      setTasks(saved?.tasks ?? []);
      setProducts(saved?.products ?? []);
      const { data: catalogueRows, error: catalogueError } = await supabase
        .from("twiga_products")
        .select("id,name,sku,description,category,price,cost_price,currency,unit,stock_quantity,low_stock_threshold,image_key,barcode,item_type,track_stock")
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (!cancelled && !catalogueError && catalogueRows) {
        const mapped = await Promise.all(catalogueRows.map(async (row: any) => {
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
            costPrice: row.cost_price == null ? undefined : Number(row.cost_price),
            unit: row.unit || "piece", lowStockThreshold: Number(row.low_stock_threshold || 0),
            imageKey: row.image_key || null, imageUrl, trackStock: row.track_stock !== false,
            itemType: row.item_type === "service" ? "service" as const : "product" as const,
            currency: row.currency || "KES",
          } satisfies Product;
        }));
        setProducts(mapped);
      }
      setSales(saved?.sales ?? []);
      setPayments(saved?.payments ?? []);
      setMessages(saved?.messages ?? []);
      setCustomers(saved?.customers ?? []);
      setSettings(saved?.settings ? { ...emptySettings, ...saved.settings } : emptySettings);
      setCatalogSource(saved?.catalogSource ?? "Manual entry");
      setSellMode(saved?.sellMode ?? "seller");
      const { data: calls, error: callsError } = await supabase.from("twiga_call_records").select("id,provider,provider_call_id,channel,direction,from_number,to_number,status,started_at,ended_at,duration_seconds,summary,structured_data,cost_usd,created_at").eq("business_id", businessId).order("created_at", { ascending: false }).limit(30);
      if (!callsError) setCallRecords((current) => {
        const merged = new Map<string, CallRecord>();
        for (const call of (calls || []) as CallRecord[]) merged.set(call.id, call);
        for (const call of current) merged.set(call.id, call);
        return Array.from(merged.values()).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 30);
      });
      hydrated.current = true;
      setWorkspaceReady(true);
    };
    void load();
    return () => { cancelled = true; void supabase.removeChannel(callChannel); };
  }, [demo, userId, businessId]);

  useEffect(() => {
    if (demo || !userId || !businessId || !supabase || !hydrated.current) return;
    const timeout = window.setTimeout(async () => {
      const workspace_data = { tasks, sales, payments, messages, customers, settings, catalogSource, sellMode };
      const { error } = await supabase
        .from("twiga_business_workspace_data")
        .upsert({ business_id: businessId, updated_by: userId, workspace_data }, { onConflict: "business_id" });
      if (error) console.error("Unable to save business workspace", error.message);
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [demo, userId, businessId, tasks, sales, payments, messages, customers, settings, catalogSource, sellMode]);

  const value = useMemo<StoreValue>(
    () => ({
      demoMode: demo,
      businessId,
      tasks,
      products,
      sales,
      payments,
      messages,
      customers,
      liveCalls: demo ? demoLiveCalls : [],
      callRecords,
      settings,
      catalogSource,
      sellMode,
      palplusKey,
      setPalplusKey,
      setSellMode,
      completeTask: (id) => setTasks((t) => t.map((x) => (x.id === id ? { ...x, status: "done" } : x))),
      addSale: (sale) => setSales((s) => [sale, ...s]),
      addPayment: (p) => setPayments((s) => [p, ...s]),
      markPaid: (id) => setPayments((s) => s.map((p) => (p.id === id ? { ...p, status: "paid" } : p))),
      addMessage: (m) => setMessages((s) => [m, ...s]),
      advanceCustomer: (id) => setCustomers((s) => s.map((c) => c.id === id ? { ...c, followUpIn: c.followUpIn === 0 ? 7 : Math.max(0, c.followUpIn - 1) } : c)),
      updateSettings: (patch) => setSettings((s) => ({ ...s, ...patch })),
      addProduct: (p) => setProducts((s) => [p, ...s]),
      removeProduct: (id) => setProducts((s) => s.filter((p) => p.id !== id)),
      replaceProducts: (items) => setProducts(items),
      importCatalog: (items, source) => {
        setProducts((s) => {
          const existing = new Set(s.map((p) => p.name.toLowerCase()));
          return [...items.filter((i) => !existing.has(i.name.toLowerCase())), ...s];
        });
        setCatalogSource(source);
      },
    }),
    [demo, businessId, tasks, products, sales, payments, messages, customers, callRecords, settings, catalogSource, sellMode, palplusKey]
  );

  if (!workspaceReady && !demo) {
    return <div className="grid min-h-[70vh] place-items-center"><div className="rounded-2xl border bg-white px-6 py-5 text-sm text-neutral-500 shadow-sm">Opening your secure workspace…</div></div>;
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}