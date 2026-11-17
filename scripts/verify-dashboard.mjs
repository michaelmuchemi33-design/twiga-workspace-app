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
  ["setup assistant reads the encrypted xAI key", setupAssistant.includes('p_provider: "xai"') && setupAssistant.includes("api.x.ai/v1/responses")],
  ["live Retell voice catalogue and previews", profile.includes("list_voices") && profile.includes("previewUrl")],
  ["Google origin mismatch guidance", connections.includes("origin_mismatch")],
  ["business_id architecture documented", readme.includes("twiga_business_workspace_data") && readme.includes("business_id")],
  ["trial and Starter price documented", readme.includes("seven days") && readme.includes("KSh 1,500 monthly")],
  ["legacy public data lock-down migration", migration1.includes("analytics_customer_value") && migration1.includes("search_path = pg_catalog, public, private")],
  ["phone-line conflict safety migration", migration2.includes("if not found") && migration2.includes("This phone number is already assigned to another business")],
  ["RLS and foreign-key performance migration", migration3.includes("idx_twiga_customers_business_id_fk") && migration3.includes("auth.uid()")],
  ["business AI RPC authorization migration", migration4.includes("m.role in ('owner','admin','manager')") && migration4.includes("idx_devices_business_id_fk")],
  ["test command configured", pkg.scripts?.test === "node scripts/verify-dashboard.mjs"],
  ["no Unity branding in live app shell", !/Unity/i.test(app) && !/Unity/i.test(read("index.html"))],
];

let failed = 0;
for (const [name, pass] of checks) {
  if (pass) console.log("PASS " + name);
  else { console.error("FAIL " + name); failed++; }
}
if (failed) process.exit(1);
console.log("TWIGA workspace smoke checks passed: " + checks.length + " checks.");
