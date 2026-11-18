-- TWIGA Cloudflare D1: AI receptionist operations
-- All business records are scoped by business_id.
CREATE TABLE IF NOT EXISTS ai_leads (
  lead_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  interest TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_leads_business_created ON ai_leads (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_staff_tasks (
  task_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  due_at TEXT,
  customer_name TEXT,
  phone TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_staff_tasks_business_status ON ai_staff_tasks (business_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_followups (
  followup_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  reason TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  consent_confirmed INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_followups_business_status ON ai_followups (business_id, status, scheduled_at);

CREATE TABLE IF NOT EXISTS ai_notifications (
  notification_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_notifications_business_status ON ai_notifications (business_id, status, created_at DESC);
