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
  saveStatus: "idle" | "pending" | "saving" | "saved" | "error" | "demo";
  workspaceError: string | null;
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
  importCatalog: (items: Product[], source: string) => void;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

export const stamp = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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

const demoSeed: {
  tasks: Task[]; products: Product[]; sales: Sale[]; payments: Payment[];
  messages: Message[]; customers: Customer[]; settings: Settings;
  catalogSource: string; sellMode: SellMode;
} = {
  tasks: [
    { id: "demo-task-1", label: "Confirm a haircut booking", detail: "Sample appointment request", status: "pending", time: "10:30" },
    { id: "demo-task-2", label: "Reply to a WhatsApp enquiry", detail: "Customer asked about opening hours", status: "done", time: "09:45" },
    { id: "demo-task-3", label: "Follow up with a returning customer", detail: "Send a service reminder", status: "pending", time: "14:00" },
  ],
  products: [
    { id: "demo-product-haircut", name: "Haircut", price: 500, category: "Hair", stock: 12, source: "manual", kind: "service", duration: "30 min" },
    { id: "demo-product-beard", name: "Beard trim", price: 300, category: "Grooming", stock: 8, source: "manual", kind: "service", duration: "20 min" },
    { id: "demo-product-wash", name: "Hair wash", price: 250, category: "Hair", stock: 10, source: "manual", kind: "service", duration: "15 min" },
    { id: "demo-product-oil", name: "Hair oil", price: 450, category: "Retail", stock: 20, source: "manual", kind: "seller" },
  ],
  sales: [
    { id: "demo-sale-1", lines: [{ productId: "demo-product-haircut", name: "Haircut", price: 500, qty: 1 }], total: 500, customer: "Sample customer", time: "Today" },
  ],
  payments: [],
  messages: [
    { id: "demo-message-1", to: "Sample customer", phone: "Demo only", body: "Your appointment request has been received. Our team will confirm shortly.", status: "queued", time: "Today" },
  ],
  customers: [
    { id: "demo-customer-1", name: "Sample customer", phone: "Demo only", stage: "Active", spend: 1250, lastVisit: "Today", followUpIn: 2 },
    { id: "demo-customer-2", name: "New enquiry", phone: "Demo only", stage: "New", spend: 0, lastVisit: "—", followUpIn: 0 },
    { id: "demo-customer-3", name: "Returning customer", phone: "Demo only", stage: "VIP", spend: 3200, lastVisit: "Yesterday", followUpIn: 7 },
  ],
  settings: {
    ...emptySettings,
    business: { ...emptySettings.business, name: "Sample Salon", address: "Nairobi, Kenya", openTime: "09:00", closeTime: "18:00" },
    persona: { ...emptySettings.persona, greeting: "Hello, thank you for calling Sample Salon. How can I help you today?" },
  },
  catalogSource: "Sample catalogue",
  sellMode: "service",
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
  const [tasks, setTasks] = useState<Task[]>(demo ? demoSeed.tasks : []);
  const [products, setProducts] = useState<Product[]>(demo ? demoSeed.products : []);
  const [sales, setSales] = useState<Sale[]>(demo ? demoSeed.sales : []);
  const [payments, setPayments] = useState<Payment[]>(demo ? demoSeed.payments : []);
  const [messages, setMessages] = useState<Message[]>(demo ? demoSeed.messages : []);
  const [customers, setCustomers] = useState<Customer[]>(demo ? demoSeed.customers : []);
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [settings, setSettings] = useState<Settings>(demo ? demoSeed.settings : emptySettings);
  const [catalogSource, setCatalogSource] = useState(demo ? demoSeed.catalogSource : "Not configured");
  const [sellMode, setSellMode] = useState<SellMode>(demo ? demoSeed.sellMode : "seller");
  const [palplusKey, setPalplusKey] = useState("");
  const [saveStatus, setSaveStatus] = useState<StoreValue["saveStatus"]>(demo ? "demo" : "idle");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(demo || !businessId || !supabase);
  const hydrated = useRef(demo || !businessId || !supabase);

  useEffect(() => {
    if (demo) {
      hydrated.current = true;
      setWorkspaceError(null);
      setSaveStatus("demo");
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
      setWorkspaceError(null);
      setSaveStatus("idle");
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
    setWorkspaceError(null);
    setSaveStatus("idle");
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
        setWorkspaceError("This workspace could not be loaded. Your edits are not being saved. Refresh to try again.");
        setSaveStatus("error");
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
      setWorkspaceError(null);
      setSaveStatus("idle");
      setWorkspaceReady(true);
    };
    void load();
    return () => { cancelled = true; void supabase.removeChannel(callChannel); };
  }, [demo, userId, businessId]);

  useEffect(() => {
    if (demo || !userId || !businessId || !supabase || !hydrated.current) return;
    setSaveStatus("pending");
    const timeout = window.setTimeout(async () => {
      setSaveStatus("saving");
      const workspace_data = { tasks, products, sales, payments, messages, customers, settings, catalogSource, sellMode };
      const { error } = await supabase
        .from("twiga_business_workspace_data")
        .upsert({ business_id: businessId, updated_by: userId, workspace_data }, { onConflict: "business_id" });
      if (error) {
        console.error("Unable to save business workspace", error.message);
        setWorkspaceError("Your changes could not be saved. Check your connection and try again.");
        setSaveStatus("error");
      } else {
        setWorkspaceError(null);
        setSaveStatus("saved");
      }
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [demo, userId, businessId, tasks, products, sales, payments, messages, customers, settings, catalogSource, sellMode]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timeout = window.setTimeout(() => setSaveStatus("idle"), 2200);
    return () => window.clearTimeout(timeout);
  }, [saveStatus]);

  const value = useMemo<StoreValue>(
    () => ({
      demoMode: demo,
      saveStatus,
      workspaceError,
      businessId,
      tasks,
      products,
      sales,
      payments,
      messages,
      customers,
      liveCalls: [],
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
      importCatalog: (items, source) => {
        setProducts((s) => {
          const existing = new Set(s.map((p) => p.name.toLowerCase()));
          return [...items.filter((i) => !existing.has(i.name.toLowerCase())), ...s];
        });
        setCatalogSource(source);
      },
    }),
    [demo, businessId, tasks, products, sales, payments, messages, customers, callRecords, settings, catalogSource, sellMode, palplusKey, saveStatus, workspaceError]
  );

  if (!workspaceReady && !demo) {
    return <div className="grid min-h-[70vh] place-items-center"><div className="rounded-2xl border bg-white px-6 py-5 text-sm text-neutral-500 shadow-sm">Opening your secure workspace…</div></div>;
  }
  return (
    <StoreContext.Provider value={value}>
      {!demo && saveStatus !== "idle" && saveStatus !== "demo" && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-4 top-4 z-[120] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur ${saveStatus === "error" ? "border-red-200 bg-red-50 text-red-700" : saveStatus === "saved" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 bg-white/95 text-neutral-700"}`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${saveStatus === "error" ? "bg-red-500" : saveStatus === "saved" ? "bg-emerald-500" : "bg-orange-500"}`} />
          <span>{saveStatus === "pending" || saveStatus === "saving" ? "Saving changes…" : saveStatus === "saved" ? "Saved" : workspaceError || "Workspace save failed."}</span>
        </div>
      )}
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}