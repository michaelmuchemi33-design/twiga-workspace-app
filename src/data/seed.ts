import type {
  Appointment,
  BrandVoice,
  CallLog,
  Customer,
  EscalationRule,
  FaqEntry,
  Lead,
  PaymentRequest,
  Product,
  Sale,
  Visitor,
} from "@/types";

export const seedCalls: CallLog[] = [
  {
    id: "c1",
    caller: "Grace Wanjiru",
    phone: "+254 712 004 118",
    intent: "Book dental cleaning",
    outcome: "booked",
    sentiment: "positive",
    durationSec: 142,
    timestamp: "09:12",
    transcript:
      "Caller asked for a Saturday cleaning slot. AI checked Dr. Otieno's calendar and booked 10:30 AM.",
  },
  {
    id: "c2",
    caller: "Brian Kimani",
    phone: "+254 733 887 210",
    intent: "Pricing for consultation",
    outcome: "faq",
    sentiment: "neutral",
    durationSec: 58,
    timestamp: "09:41",
    transcript:
      "Answered from knowledge base: consultation is KSh 2,500, includes X-ray review.",
  },
  {
    id: "c3",
    caller: "Unknown / Sales",
    phone: "+1 415 555 0199",
    intent: "Cold SEO pitch",
    outcome: "spam",
    sentiment: "neutral",
    durationSec: 21,
    timestamp: "10:03",
    transcript:
      "Detected sales pitch pattern. Politely ended call and routed to general inbox.",
  },
  {
    id: "c4",
    caller: "Amina Yusuf",
    phone: "+254 701 552 903",
    intent: "Complaint about billing",
    outcome: "escalated",
    sentiment: "negative",
    durationSec: 96,
    timestamp: "10:27",
    transcript:
      "Negative sentiment detected. Transferred live to manager mobile +254 720 111 000.",
  },
  {
    id: "c5",
    caller: "Peter Mwangi",
    phone: "+254 745 330 771",
    intent: "Reception hours",
    outcome: "after-hours",
    sentiment: "neutral",
    durationSec: 44,
    timestamp: "22:48",
    transcript:
      "After-hours agent captured message and booked a next-day callback at 8:30 AM.",
  },
  {
    id: "c6",
    caller: "Lucy Njeri",
    phone: "+254 799 210 445",
    intent: "Reach accounts dept",
    outcome: "routed",
    sentiment: "positive",
    durationSec: 33,
    timestamp: "11:05",
    transcript: "Intent recognised as billing. Routed to Accounts extension 204.",
  },
];

export const seedVisitors: Visitor[] = [
  {
    id: "v1",
    name: "Daniel Otieno",
    company: "Safari Logistics",
    host: "Mary (Ops)",
    purpose: "Delivery handover",
    checkedInAt: "08:55",
    status: "on-site",
  },
  {
    id: "v2",
    name: "Faith Chebet",
    company: "Nairobi Water",
    host: "James (Facilities)",
    purpose: "Meter inspection",
    checkedInAt: "09:30",
    status: "checked-out",
  },
  {
    id: "v3",
    name: "Samuel Kariuki",
    company: "KCB Bank",
    host: "Grace (Finance)",
    purpose: "Account review",
    checkedInAt: "10:15",
    status: "on-site",
  },
];

export const seedAppointments: Appointment[] = [
  {
    id: "a1",
    client: "Grace Wanjiru",
    service: "Dental cleaning",
    staff: "Dr. Otieno",
    time: "Sat 10:30",
    status: "confirmed",
  },
  {
    id: "a2",
    client: "Peter Mwangi",
    service: "Callback",
    staff: "Front desk",
    time: "Tomorrow 08:30",
    status: "pending",
  },
  {
    id: "a3",
    client: "Amina Yusuf",
    service: "Billing review",
    staff: "Grace (Finance)",
    time: "Today 14:00",
    status: "confirmed",
  },
  {
    id: "a4",
    client: "Lucy Njeri",
    service: "Consultation",
    staff: "Dr. Wambui",
    time: "Today 16:15",
    status: "completed",
  },
];

export const seedFaqs: FaqEntry[] = [
  {
    id: "f1",
    question: "What are your business hours?",
    answer: "Mon–Fri 8:00 AM – 6:00 PM, Sat 9:00 AM – 1:00 PM. Closed Sundays.",
    hits: 214,
  },
  {
    id: "f2",
    question: "Where are you located and is there parking?",
    answer:
      "3rd floor, Kimathi House, Nairobi CBD. Free parking in the basement for clients.",
    hits: 168,
  },
  {
    id: "f3",
    question: "How much is a consultation?",
    answer: "Consultation is KSh 2,500 and includes an X-ray review.",
    hits: 142,
  },
  {
    id: "f4",
    question: "Do you accept insurance?",
    answer:
      "Yes — we accept Jubilee, AAR, and Britam. Bring your member card and ID.",
    hits: 97,
  },
];

export const seedLeads: Lead[] = [
  {
    id: "l1",
    name: "Brian Kimani",
    phone: "+254 733 887 210",
    message: "Wants a quote for a family dental package.",
    source: "call",
    capturedAt: "09:41",
    synced: true,
  },
  {
    id: "l2",
    name: "Hellen Achieng",
    phone: "+254 710 998 221",
    message: "Asked about weekend availability, left number for callback.",
    source: "chat",
    capturedAt: "10:52",
    synced: false,
  },
  {
    id: "l3",
    name: "Walk-in enquiry",
    phone: "+254 722 445 100",
    message: "Interested in corporate wellness screening for 40 staff.",
    source: "walk-in",
    capturedAt: "11:20",
    synced: false,
  },
];

export const seedProducts: Product[] = [
  { id: "p1", name: "Whitening Kit", price: 4500, stock: 12, category: "Retail" },
  { id: "p2", name: "Electric Toothbrush", price: 3200, stock: 8, category: "Retail" },
  { id: "p3", name: "Fluoride Treatment", price: 1800, stock: 99, category: "Service" },
  { id: "p4", name: "Dental X-Ray", price: 2500, stock: 99, category: "Service" },
  { id: "p5", name: "Mouthguard (custom)", price: 6000, stock: 5, category: "Retail" },
  { id: "p6", name: "Scaling & Polishing", price: 3500, stock: 99, category: "Service" },
];

export const seedSales: Sale[] = [
  {
    id: "s1",
    lines: [
      { productId: "p3", name: "Fluoride Treatment", price: 1800, qty: 1 },
      { productId: "p1", name: "Whitening Kit", price: 4500, qty: 1 },
    ],
    total: 6300,
    method: "mpesa",
    soldAt: "09:20",
  },
  {
    id: "s2",
    lines: [{ productId: "p6", name: "Scaling & Polishing", price: 3500, qty: 2 }],
    total: 7000,
    method: "cash",
    soldAt: "10:44",
  },
];

export const seedPayments: PaymentRequest[] = [
  {
    id: "pay1",
    customer: "Grace Wanjiru",
    phone: "+254 712 004 118",
    amount: 2500,
    status: "paid",
    link: "https://pay.frontdesk.ai/r/8F2K1",
    createdAt: "09:15",
    whatsappQueued: true,
  },
  {
    id: "pay2",
    customer: "Samuel Kariuki",
    phone: "+254 745 118 002",
    amount: 6300,
    status: "pending",
    link: "https://pay.frontdesk.ai/r/9QX4M",
    createdAt: "10:02",
    whatsappQueued: true,
  },
  {
    id: "pay3",
    customer: "Hellen Achieng",
    phone: "+254 710 998 221",
    amount: 1800,
    status: "expired",
    link: "https://pay.frontdesk.ai/r/3LP7Z",
    createdAt: "08:40",
    whatsappQueued: false,
  },
];

export const seedCustomers: Customer[] = [
  {
    id: "cu1",
    name: "Grace Wanjiru",
    phone: "+254 712 004 118",
    lastVisit: "Today",
    totalSpent: 18400,
    stage: "vip",
    nextFollowUp: "In 3 days",
    notes: "Prefers Saturday mornings. Due for 6-month review.",
  },
  {
    id: "cu2",
    name: "Samuel Kariuki",
    phone: "+254 745 118 002",
    lastVisit: "Today",
    totalSpent: 9200,
    stage: "active",
    nextFollowUp: "Tomorrow",
    notes: "Outstanding balance KSh 6,300 — payment link sent.",
  },
  {
    id: "cu3",
    name: "Hellen Achieng",
    phone: "+254 710 998 221",
    lastVisit: "6 weeks ago",
    totalSpent: 4100,
    stage: "at-risk",
    nextFollowUp: "Today",
    notes: "Payment link expired. Needs re-engagement call.",
  },
  {
    id: "cu4",
    name: "Brian Kimani",
    phone: "+254 733 887 210",
    lastVisit: "Never",
    totalSpent: 0,
    stage: "new",
    nextFollowUp: "In 1 day",
    notes: "Lead from pricing enquiry. Send family package quote.",
  },
];

export const seedEscalations: EscalationRule[] = [
  {
    id: "e1",
    trigger: "Negative sentiment detected",
    action: "Transfer live to manager +254 720 111 000",
    enabled: true,
  },
  {
    id: "e2",
    trigger: "Question not found in knowledge base",
    action: "Capture message and email frontdesk@company.co.ke",
    enabled: true,
  },
  {
    id: "e3",
    trigger: "Caller requests a human twice",
    action: "Warm transfer to reception extension 100",
    enabled: true,
  },
  {
    id: "e4",
    trigger: "Legal or medical emergency keywords",
    action: "Immediate transfer + SMS alert to on-call staff",
    enabled: true,
  },
];

export const seedVoice: BrandVoice = {
  persona:
    "Amina — a warm, efficient Kenyan front-desk assistant who never rushes a caller.",
  greeting: "Good morning, thank you for calling Kimathi Dental. How may I help you?",
  tone: "warm",
  afterHours: true,
  spamFilter: true,
};

export const receptionistFunctions = [
  { id: 1, name: "Answering & Routing Calls", detail: "STT + intent recognition + telephony routing" },
  { id: 2, name: "Greeting & Check-ins", detail: "Digital check-in, QR scan, host notification" },
  { id: 3, name: "Scheduling & Booking", detail: "Calendar API read/write for real availability" },
  { id: 4, name: "Answering FAQs", detail: "RAG knowledge base of hours, location, pricing" },
  { id: 5, name: "Messages & Lead Capture", detail: "Extract details, log to CRM, send summary" },
  { id: 6, name: "Escalation Rules", detail: "Fallback + transfer logic for hard cases" },
  { id: 7, name: "After-Hours Inquiries", detail: "24/7 agent captures late-night messages" },
  { id: 8, name: "Visitor & Call Log", detail: "Dashboard of transcripts, timestamps, metadata" },
  { id: 9, name: "Spam Filtering", detail: "Detect sales pitches, end politely, route to inbox" },
  { id: 10, name: "Tone & Brand Identity", detail: "TTS voice + persona system prompt" },
];