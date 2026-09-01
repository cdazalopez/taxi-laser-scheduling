// Imports dispatchers from data/dispatchers.csv into Supabase.
// Usage: node --env-file=.env.local scripts/seed-dispatchers.mjs
//
// CSV header (first line): external_ref,full_name,email,phone,role,status,skills,hire_date
//   - skills is pipe-separated, e.g. bilingual|night_shift
//   - only full_name is required; other columns may be blank
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = join(__dirname, "..", "data", "dispatchers.csv");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env vars");

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(",").map((h) => h.trim());
  return lines.map((line) => {
    // simple CSV: no quoted commas expected in this dataset
    const cells = line.split(",");
    const row = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
const records = rows
  .filter((r) => r.full_name)
  .map((r) => ({
    external_ref: r.external_ref || null,
    full_name: r.full_name,
    email: r.email || null,
    phone: r.phone || null,
    role: r.role || "dispatcher",
    status: r.status || "activo",
    skills: r.skills ? r.skills.split("|").map((s) => s.trim()).filter(Boolean) : [],
    hire_date: r.hire_date || null,
  }));

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Upsert by email when present; otherwise plain insert.
const { data, error } = await supabase
  .from("dispatchers")
  .upsert(records, { onConflict: "email", ignoreDuplicates: false })
  .select("id");

if (error) {
  console.error("❌ Seed failed:", error.message);
  process.exit(1);
}
console.log(`✅ Imported ${data.length} dispatchers.`);
