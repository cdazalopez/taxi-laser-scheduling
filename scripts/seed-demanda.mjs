// Imports historical demand from data/demanda.csv into Supabase.
// Usage: node --env-file=.env.local scripts/seed-demanda.mjs
//
// CSV header (first line): demand_date,hour,ride_count,dispatchers_on
//   - demand_date: YYYY-MM-DD
//   - hour: 0-23
//   - ride_count: integer (required)
//   - dispatchers_on: integer staffed that hour (optional, may be blank)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = join(__dirname, "..", "data", "demanda.csv");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env vars");

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(",").map((h) => h.trim());
  return lines.map((line) => {
    const cells = line.split(",");
    const row = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
// Dedupe by (demand_date, hour) — duplicate weekly tabs can repeat a slot; last wins.
// Postgres upsert rejects a batch that contains the same conflict key twice.
const byKey = new Map();
for (const r of rows) {
  if (!r.demand_date || r.hour === "" || r.ride_count === "") continue;
  byKey.set(`${r.demand_date}|${r.hour}`, {
    demand_date: r.demand_date,
    hour: Number(r.hour),
    ride_count: Number(r.ride_count),
    dispatchers_on: r.dispatchers_on ? Number(r.dispatchers_on) : null,
    source: "import",
  });
}
const records = [...byKey.values()];

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Upsert in batches by (demand_date, hour).
const BATCH = 500;
let total = 0;
for (let i = 0; i < records.length; i += BATCH) {
  const chunk = records.slice(i, i + BATCH);
  const { data, error } = await supabase
    .from("demanda_historica")
    .upsert(chunk, { onConflict: "demand_date,hour" })
    .select("id");
  if (error) {
    console.error("❌ Seed failed:", error.message);
    process.exit(1);
  }
  total += data.length;
}
console.log(`✅ Imported ${total} demand rows.`);
