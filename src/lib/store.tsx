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

const seedTasks: Task[] = [
  { id: "t1", label: "Answered call from Grace M.", detail: "Booked haircut for Fri 3pm", status: "done", time: "09:12" },
  { id: "t2", label: "Sent payment link to Brian K.", detail: "KSh 4,500 · awaiting payment", status: "pending", time: "09:24" },
  { id: "t3", label: "WhatsApp delivery update", detail: "Order #1042 out for delivery", status: "done", time: "09:41" },
  { id: "t4", label: "Captured new lead", detail: "Walk-in enquiry about pricing", status: "done", time: "10:03" },
  { id: "t5", label: "Missed call from unknown", detail: "No voicemail left", status: "failed", time: "10:18" },
  { id: "t6", label: "Rescheduled appointment", detail: "Moved to Sat 11am per request", status: "done", time: "10:35" },
];

const seedProducts: Product[] = [
  { id: "p1", name: "Signature Cut", price: 1500, category: "Hair", stock: 99, source: "manual", kind: "service", description: "Precision cut with consultation, wash and blow-dry finish.", duration: "45 min" },
  { id: "p2", name: "Beard Trim", price: 800, category: "Grooming", stock: 99, source: "manual", kind: "service", description: "Shape and line-up with hot towel and beard oil.", duration: "20 min" },
  { id: "p3", name: "Deep Conditioning", price: 2200, category: "Treatment", stock: 40, source: "manual", kind: "service", description: "Intensive moisture treatment for dry or damaged hair.", duration: "60 min" },
  { id: "p4", name: "Hair Oil 100ml", price: 1200, category: "Retail", stock: 24, source: "manual", kind: "seller", description: "Cold-pressed argan oil for daily shine and repair." },
  { id: "p5", name: "Shampoo 250ml", price: 950, category: "Retail", stock: 18, source: "manual", kind: "seller", description: "Sulphate-free shampoo for coloured and treated hair." },
  { id: "p6", name: "Full Colour", price: 4500, category: "Colour", stock: 99, source: "manual", kind: "service", description: "Full-head colour with gloss and aftercare advice.", duration: "2 hr" },
];

const seedPayments: Payment[] = [
  { id: "pay1", customer: "Grace Mwangi", phone: "+254 733 987 654", amount: 4500, note: "Full colour", status: "paid", link: "https://pay.palplus.io/a1b2c3", time: "08:50" },
  { id: "pay2", customer: "Brian Kimani", phone: "+254 722 111 222", amount: 2200, note: "Deep conditioning", status: "pending", link: "https://pay.palplus.io/d4e5f6", time: "09:24" },
  { id: "pay3", customer: "Aisha Noor", phone: "+254 711 333 444", amount: 1500, note: "Signature cut", status: "pending", link: "https://pay.palplus.io/g7h8i9", time: "09:55" },
  { id: "pay4", customer: "Tom Otieno", phone: "+254 700 555 666", amount: 800, note: "Beard trim", status: "expired", link: "https://pay.palplus.io/j1k2l3", time: "07:30" },
];

const seedMessages: Message[] = [
  { id: "m1", to: "Grace M.", phone: "+254 733 987 654", body: "Hi Grace, your appointment is confirmed for Fri 3pm. See you!", status: "delivered", time: "09:13" },
  { id: "m2", to: "Brian K.", phone: "+254 722 111 222", body: "Please pay KSh 2,200 here: https://pay.palplus.io/d4e5f6", status: "sent", time: "09:25" },
  { id: "m3", to: "Order #1042", phone: "+254 711 333 444", body: "Your order is on the way 🚚 ETA 30 mins.", status: "delivered", time: "09:41" },
];

const seedCustomers: Customer[] = [
  { id: "c1", name: "Grace Mwangi", phone: "+254 733 987 654", stage: "VIP", spend: 48000, lastVisit: "2 days ago", followUpIn: 0 },
  { id: "c2", name: "Brian Kimani", phone: "+254 722 111 222", stage: "Active", spend: 18500, lastVisit: "1 week ago", followUpIn: 2 },
  { id: "c3", name: "Aisha Noor", phone: "+254 711 333 444", stage: "New", spend: 1500, lastVisit: "today", followUpIn: 5 },
  { id: "c4", name: "Tom Otieno", phone: "+254 700 555 666", stage: "At Risk", spend: 9200, lastVisit: "6 weeks ago", followUpIn: 0 },
  { id: "c5", name: "Lucy Wanjiru", phone: "+254 745 888 999", stage: "Active", spend: 26400, lastVisit: "3 days ago", followUpIn: 1 },
];

const seedLiveCalls: LiveCall[] = [
  { id: "lc1", caller: "Unknown caller", phone: "+254 7xx xxx 118", intent: "Booking enquiry", duration: "00:42", sentiment: "positive" },
  { id: "lc2", caller: "Peter Njoroge", phone: "+254 720 445 118", intent: "Reschedule request", duration: "01:15", sentiment: "neutral" },
  { id: "lc3", caller: "Aisha Noor", phone: "+254 711 333 444", intent: "Price check", duration: "00:28", sentiment: "positive" },
  { id: "lc4", caller: "Tom Otieno", phone: "+254 700 555 666", intent: "Complaint", duration: "02:04", sentiment: "negative" },
  { id: "lc5", caller: "Grace Mwangi", phone: "+254 733 987 654", intent: "Confirm booking", duration: "00:51", sentiment: "positive" },
  { id: "lc6", caller: "Brian Kimani", phone: "+254 722 111 222", intent: "Payment question", duration: "01:32", sentiment: "neutral" },
  { id: "lc7", caller: "Lucy Wanjiru", phone: "+254 745 888 999", intent: "New appointment", duration: "00:47", sentiment: "positive" },
  { id: "lc8", caller: "Unknown caller", phone: "+254 7xx xxx 902", intent: "Wrong number", duration: "00:12", sentiment: "neutral" },
];

const defaultSettings: Settings = {
  business: {
    name: "Nairobi Style Studio",
    currency: "KSh",
    dateFormat: "DD/MM/YYYY",
    timezone: "Africa/Nairobi (GMT+3)",
    openTime: "08:00",
    closeTime: "18:00",
    holidayOverride: true,
    address: "12 Kimathi Street, Nairobi",
    parking: "Free parking behind the building",
    website: "nairobistyle.co.ke",
    faqs: "Do you take walk-ins? Yes, subject to availability.\nDo you offer student discounts? 10% with valid ID.",
  },
  persona: {
    voice: "Female — Aria",
    accent: "Kenyan English",
    speed: 1.0,
    greeting: "Thank you for calling Nairobi Style Studio, how can I help you today?",
    closing: "Thank you for calling, have a wonderful day!",
    tone: "Friendly",
    primaryLang: "English",
    fallbackLang: "Swahili",
  },
  routing: {
    forwardOnAngry: true,
    forwardOnManager: true,
    forwardOnComplex: false,
    escalationNumber: "+254 700 000 000",
    vipNumbers: "+254 733 987 654\n+254 722 111 222",
    vipKeywords: "urgent, complaint, manager",
    maxDuration: 20,
    silenceTimeout: 8,
  },
  scheduling: {
    calendar: "Google Calendar",
    bufferMinutes: 15,
    minNotice: 2,
    cancellationPolicy: "Free cancellation up to 4 hours before.",
    notifySms: true,
    notifyEmail: true,
    notifySlack: false,
    notifyPush: true,
    recording: true,
    disclaimer: "This call may be recorded for quality purposes.",
  },
};

const emptySettings: Settings = {
  business: {
    name: "", currency: "KSh", dateFormat: "DD/MM/YYYY", timezone: "Africa/Nairobi (GMT+3)",
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
  const [tasks, setTasks] = useState<Task[]>(demo ? seedTasks : []);
  const [products, setProducts] = useState<Product[]>(demo ? seedProducts : []);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>(demo ? seedPayments : []);
  const [messages, setMessages] = useState<Message[]>(demo ? seedMessages : []);
  const [customers, setCustomers] = useState<Customer[]>(demo ? seedCustomers : []);
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [settings, setSettings] = useState<Settings>(demo ? defaultSettings : emptySettings);
  const [catalogSource, setCatalogSource] = useState(demo ? "Manual entry" : "Not configured");
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
      const workspace_data = { tasks, products, sales, payments, messages, customers, settings, catalogSource, sellMode };
      const { error } = await supabase
        .from("twiga_business_workspace_data")
        .upsert({ business_id: businessId, updated_by: userId, workspace_data }, { onConflict: "business_id" });
      if (error) console.error("Unable to save business workspace", error.message);
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [demo, userId, businessId, tasks, products, sales, payments, messages, customers, settings, catalogSource, sellMode]);

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
      liveCalls: demo ? seedLiveCalls : [],
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