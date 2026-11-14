export type CallOutcome =
  | "routed"
  | "booked"
  | "faq"
  | "message"
  | "escalated"
  | "after-hours"
  | "spam";

export type Sentiment = "positive" | "neutral" | "negative";

export interface CallLog {
  id: string;
  caller: string;
  phone: string;
  intent: string;
  outcome: CallOutcome;
  sentiment: Sentiment;
  durationSec: number;
  timestamp: string;
  transcript: string;
}

export interface Visitor {
  id: string;
  name: string;
  company: string;
  host: string;
  purpose: string;
  checkedInAt: string;
  status: "on-site" | "checked-out";
}

export interface Appointment {
  id: string;
  client: string;
  service: string;
  staff: string;
  time: string;
  status: "confirmed" | "pending" | "completed";
}

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  hits: number;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  message: string;
  source: "call" | "chat" | "walk-in";
  capturedAt: string;
  synced: boolean;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string;
}

export interface CartLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export interface Sale {
  id: string;
  lines: CartLine[];
  total: number;
  method: "cash" | "mpesa" | "card";
  soldAt: string;
}

export type PaymentStatus = "paid" | "pending" | "expired";

export interface PaymentRequest {
  id: string;
  customer: string;
  phone: string;
  amount: number;
  status: PaymentStatus;
  link: string;
  createdAt: string;
  whatsappQueued: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  lastVisit: string;
  totalSpent: number;
  stage: "new" | "active" | "at-risk" | "vip";
  nextFollowUp: string;
  notes: string;
}

export interface EscalationRule {
  id: string;
  trigger: string;
  action: string;
  enabled: boolean;
}

export interface BrandVoice {
  persona: string;
  greeting: string;
  tone: "warm" | "formal" | "casual" | "medical";
  afterHours: boolean;
  spamFilter: boolean;
}