import fs from "node:fs";
const read = (file) => fs.readFileSync(file, "utf8");
const store = read("src/lib/store.tsx");
const dashboard = read("src/components/Dashboard.tsx");
const phone = read("src/components/PhoneDesk.tsx");
const sautikit = read("src/components/SautiKitDesk.tsx");
const sautikitFunction = read("supabase/functions/twiga-sautikit/index.ts");
const setup = read("src/components/SetupPage.tsx");
const setupAssistant = read("supabase/functions/twiga-setup-assistant/index.ts");
const profile = read("src/components/Profile.tsx");
const connections = read("src/components/Connections.tsx");
const app = read("src/App.tsx");
const readme = read("README.md");
const pkg = JSON.parse(read("package.json"));
const scheduledCalls = read("supabase/functions/twiga-scheduled-calls/index.ts");
const scheduledUi = read("src/components/ScheduledCallsPanel.tsx");
const paylinkFunction = read("supabase/functions/twiga-palpluss/index.ts");
const paymentUi = read("src/components/Payments.tsx");
const kimisms = read("supabase/functions/twiga-kimisms/index.ts");
const publicPaylink = read("supabase/functions/twiga-public-paylink/index.ts");
const publicPaylinkUi = read("src/components/PublicPaylink.tsx");
const palplussWebhook = read("supabase/functions/twiga-palpluss-webhook/index.ts");
const googleWorkspace = read("supabase/functions/google-workspace/index.ts");
const install = read("src/components/InstallApp.tsx");
const manifest = JSON.parse(read("public/manifest.webmanifest"));
const smsMigration = read("supabase/migrations/20261117184000_twiga_business_sms_provider_and_consent.sql");
const contactsMigration = read("supabase/migrations/20261117184500_twiga_google_contacts_email_field.sql");
const paylinkMigration = read("supabase/migrations/20261117185000_twiga_palpluss_paylinks_and_order_payment_verification.sql");
const migration1 = read("supabase/migrations/20261116214034_lock_down_legacy_erp_objects_and_pin_definer_paths.sql");
const migration2 = read("supabase/migrations/20261116214731_fix_device_line_assignment_and_remaining_function_paths.sql");
const migration3 = read("supabase/migrations/20261116214935_optimize_twiga_rls_and_foreign_key_indexes.sql");
const migration4 = read("supabase/migrations/20261116215022_harden_business_ai_rpc_permissions_and_line_updates.sql");

const checks = [
  ["business-scoped workspace persistence", store.includes('from("twiga_business_workspace_data")') && store.includes('.eq("business_id", businessId)')],
  ["demo-only sample data and demo flag", store.includes("demo ? demoSeed.tasks : []") && store.includes("demoMode: demo")],
  ["live call records are never fabricated", store.includes('useState<CallRecord[]>([])') && !store.includes("demoSeed.callRecords")],
  ["visible save/load error state", store.includes("saveStatus") && store.includes("workspaceError") && store.includes("Your changes could not be saved")],
  ["dashboard avoids live profile fetch in demo", dashboard.includes("if (demoMode || !supabase || !businessId) return;") && !dashboard.includes("if (false ||")],
  ["demo call-history disclosure", dashboard.includes("This demo does not generate fake call history.")],
  ["SautiKit phone desk is the active phone screen", phone.includes("SautiKitDesk") && sautikit.includes("publish_agent") && sautikit.includes("send_call")],
  ["voice choices come only from the live provider catalogue", !sautikit.includes("CATALOG_FALLBACK") && sautikit.includes("xl:grid-cols-5") && sautikit.includes("visibleVoiceOptions")],
  ["provider route is verified before inbound is marked ready", sautikitFunction.includes("Promise.allSettled") && sautikitFunction.includes("liveInboundVerified") && sautikitFunction.includes("inboundBound:")],
  ["AI setup has a recovery path to provider connections", setup.includes("onOpenConnections") && setup.includes("Open Connections")],
  ["setup assistant reads the encrypted OpenRouter key", setupAssistant.includes('p_provider:"openrouter"') && setupAssistant.includes("api.openrouter.ai/api/v1/chat/completions") && setupAssistant.includes("inclusionai/ling-3.2-flash:free")],
  ["Retell voice catalogue loads after provider connection", profile.includes('retellAction("list_voices")') && profile.includes("setVoiceOptions(voices)") && profile.includes("setSelectedVoice(")],
  ["Google origin mismatch guidance", connections.includes("origin_mismatch")],
  ["no-answer retry defaults to one five-minute second attempt", scheduledCalls.includes("delay_minutes: 5") && scheduledCalls.includes("unreachable_after_no_answer") && scheduledUi.includes("Retry once when unanswered")],
  ["direct callbacks enter the no-answer retry queue", sautikitFunction.includes("no_answer_retry") && sautikitFunction.includes("retryJobId")],
  ["direct and after-hours forwarding is provider guarded", sautikitFunction.includes("configure_forwarding") && sautikitFunction.includes("payload.hours =") && sautikit.includes("Call forwarding")],
  ["PalPluss Paylink is public ID only and server verified", paylinkFunction.includes("save_paylink") && paylinkFunction.includes("order.verify_paylink_payment") && paymentUi.includes("widget.pay")],
  ["PalPluss checkout requires server verification key", paymentUi.includes("window as any).Palpluss") && paymentUi.includes("order.verify_paylink_payment") && paymentUi.includes("!connected || !paylinkId.trim()")],
  ["KIMISMS SMS is consented, per-business and idempotent", kimisms.includes("customer_sms_consent") && kimisms.includes("twiga_set_kimisms_secret") && kimisms.includes("idempotencyKey") && smsMigration.includes("twiga_sms_messages")],
  ["successful PalPluss payments can send opted-in SMS receipts", palplussWebhook.includes("payment_confirmation_enabled") && palplussWebhook.includes("customer_sms_consent")],
  ["Google Contacts import is paginated and deduplicated", googleWorkspace.includes('action === "contacts.import"') && googleWorkspace.includes("phoneSet") && googleWorkspace.includes("emailSet") && contactsMigration.includes("add column if not exists email")],
  ["Paylink ID and transaction verification schema are present", paylinkMigration.includes("palpluss_paylink_id") && paylinkMigration.includes("palpluss_transaction_id")],
  ["app install is described as PWA, not APK", install.includes("Install TWIGA PWA") && install.includes("Add to Home Screen") && manifest.display === "standalone"],
  ["recording UI does not claim local preference records provider audio", sautikit.includes("SautiKit-managed object storage") && sautikit.includes("24 hours") && sautikit.includes("no permanent copy in its own")],
  ["Retell is clearly identified as a legacy browser-call provider", profile.includes("Legacy Retell browser-call connection") && dashboard.includes("Provider:")],
  ["dashboard KPI cards use aligned, non-shrinking icons", dashboard.includes("grid items-stretch") && dashboard.includes("h-full min-h-[132px]") && dashboard.includes("shrink-0")],
  ["business_id architecture documented", readme.includes("twiga_business_workspace_data") && readme.includes("business_id")],
  ["trial and Starter price documented", readme.includes("seven days") && readme.includes("KSh 1,500 monthly")],
  ["legacy public data lock-down migration", migration1.includes("analytics_customer_value") && migration1.includes("search_path = pg_catalog, public, private")],
  ["phone-line conflict safety migration", migration2.includes("if not found") && migration2.includes("This phone number is already assigned to another business")],
  ["RLS and foreign-key performance migration", migration3.includes("idx_twiga_customers_business_id_fk") && migration3.includes("auth.uid()")],
  ["business AI RPC authorization migration", migration4.includes("m.role in ('owner','admin','manager')") && migration4.includes("idx_devices_business_id_fk")],
  ["test command configured", pkg.scripts?.test === "node scripts/verify-dashboard.mjs"],
  ["no Unity branding in live app shell", !/Unity/i.test(app) && !/Unity/i.test(read("index.html"))],
];

checks.push(
  ["owner-confirmed orders send a secure PalPluss link through opted-in KIMISMS SMS", kimisms.includes("ownerConfirmed") && kimisms.includes("twiga_public_payment_links") && kimisms.includes("https://app.twiga.co.ke/pay?token=")],
  ["public payment links are token-hashed, expiring and server verified", publicPaylink.includes("SHA-256") && publicPaylink.includes("expires_at") && publicPaylink.includes("order.total_amount") && publicPaylink.includes("PalPluss")],
  ["public paylink checkout locks the server-supplied amount", publicPaylinkUi.includes("lockPrefill: true") && publicPaylinkUi.includes("twiga-public-paylink")],
  ["orders are not auto-texted before the owner confirms", !paymentUi.includes('row?.status === "pending_confirmation" && row?.payment_status === "unpaid"')],
);
let failed = 0;
for (const [name, pass] of checks) {
  if (pass) console.log("PASS " + name);
  else { console.error("FAIL " + name); failed++; }
}
if (failed) process.exit(1);
console.log("TWIGA workspace smoke checks passed: " + checks.length + " checks.");
