import fs from "node:fs";
const read = (file) => fs.readFileSync(file, "utf8");
const store = read("src/lib/store.tsx");
const dashboard = read("src/components/Dashboard.tsx");
const phone = read("src/components/PhoneDesk.tsx");
const profile = read("src/components/Profile.tsx");
const connections = read("src/components/Connections.tsx");
const app = read("src/App.tsx");
const readme = read("README.md");
const pkg = JSON.parse(read("package.json"));
const migrationPath = "supabase/migrations/20261117000100_lock_down_legacy_erp_objects_and_pin_definer_paths.sql";
const migration = read(migrationPath);

const checks = [
  ["business-scoped workspace persistence", store.includes('from("twiga_business_workspace_data")') && store.includes('.eq("business_id", businessId)')],
  ["demo-only sample data and demo flag", store.includes("demo ? demoSeed.tasks : []") && store.includes("demoMode: demo")],
  ["live call records are never fabricated", store.includes('useState<CallRecord[]>([])') && !store.includes("demoSeed.callRecords")],
  ["visible save/load error state", store.includes("saveStatus") && store.includes("workspaceError") && store.includes("Your changes could not be saved")],
  ["dashboard avoids live profile fetch in demo", dashboard.includes("if (demoMode || !supabase || !businessId) return;") && !dashboard.includes("if (false ||")],
  ["demo call-history disclosure", dashboard.includes("This demo does not generate fake call history.")],
  ["phone line assignment flow", phone.includes("save_phone_line") && phone.includes("connectionMethod")],
  ["live Retell voice catalogue and previews", profile.includes("list_voices") && profile.includes("previewUrl")],
  ["Google origin mismatch guidance", connections.includes("origin_mismatch")],
  ["business_id architecture documented", readme.includes("twiga_business_workspace_data") && readme.includes("business_id")],
  ["trial and Starter price documented", readme.includes("seven days") && readme.includes("KSh 1,500 monthly")],
  ["security migration included", migration.includes("analytics_customer_value") && migration.includes("search_path = pg_catalog, public, private")],
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
