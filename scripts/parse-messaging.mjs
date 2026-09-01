// Parses the messaging schedule (Excel cols U+ = messaging dispatchers) into
// messaging_schedule. Round-robin siglas = NE, MC1..MC6. MR tracked but excluded.
// Usage: node --env-file=.env.local scripts/parse-messaging.mjs "/path/file.xlsx" [--commit]
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";

const xlsxPath = process.argv[2] || "/Users/carlosdaza/Downloads/Horarios Taxi Laser LLC.xlsx";
const COMMIT = process.argv.includes("--commit");
const MSG_COL_START = 20; // Excel column U (0-indexed 20)

const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const WEEKDAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]; // 0=Mon

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function addDays(y, m, d, n) {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
}
function mondayOf(name) {
  const mm = norm(name).match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[_\s]+(\d{1,2})/);
  if (!mm) return null;
  const month = MONTHS[mm[1]], day = Number(mm[2]);
  for (let y = 2024; y <= 2027; y++) if (addDays(y, month, day, 0).dow === 1) return { y, month, day };
  return null;
}
const codeToRef = (cell) => {
  const m = String(cell ?? "").trim().match(/(\d{2,3})\s*$/);
  return m ? "D" + m[1].padStart(3, "0") : null;
};
function hourToNum(h) {
  const m = norm(h).match(/(\d{1,2}):?\d{0,2}\s*(am|pm)/);
  if (!m) return null;
  let hr = Number(m[1]) % 12;
  if (m[2] === "pm") hr += 12;
  return hr;
}
const RR = /^(NE|MC[1-6])$/i;

const wb = xlsx.readFile(xlsxPath);
const records = [];
const siglaCounts = {};
const codesSeen = new Set();

for (const sheetName of wb.SheetNames) {
  const monday = mondayOf(sheetName);
  if (!monday) { console.log(`(omito hoja sin fecha: ${sheetName})`); continue; }
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
  for (let r = 0; r < rows.length - 1; r++) {
    const dayIdx = WEEKDAYS.indexOf(norm(rows[r][0]));
    if (dayIdx === -1) continue;
    const hdr = rows[r + 1];
    if (norm(hdr[0]) !== "hora") continue;
    const dd = addDays(monday.y, monday.month, monday.day, dayIdx);
    const date = isoDate(dd.y, dd.m, dd.d);

    // messaging dispatcher columns (idx >= U)
    const cols = [];
    for (let c = MSG_COL_START; c < hdr.length; c++) {
      const ref = codeToRef(hdr[c]);
      if (ref) { cols.push({ c, ref }); codesSeen.add(ref); }
    }
    for (let h = 0; h < 24; h++) {
      const row = rows[r + 2 + h];
      if (!row) break;
      const hour = hourToNum(row[0]);
      if (hour === null) continue;
      for (const { c, ref } of cols) {
        const sigla = String(row[c] ?? "").trim().toUpperCase();
        if (!sigla) continue;
        siglaCounts[sigla] = (siglaCounts[sigla] || 0) + 1;
        records.push({ ref, date, hour, sigla, in_round_robin: RR.test(sigla) });
      }
    }
  }
}

console.log("Siglas encontradas (cols U+):", JSON.stringify(siglaCounts));
console.log("Registros:", records.length, "| round-robin:", records.filter((r) => r.in_round_robin).length, "| MR:", records.filter((r) => r.sigla === "MR").length);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: disp } = await sb.from("dispatchers").select("id, external_ref");
const idByRef = new Map(disp.map((d) => [d.external_ref, d.id]));
const unmatched = new Set();
const rowsToInsert = [];
const seen = new Set();
for (const rec of records) {
  const id = idByRef.get(rec.ref);
  if (!id) { unmatched.add(rec.ref); continue; }
  const key = `${id}|${rec.date}|${rec.hour}`;
  if (seen.has(key)) continue;
  seen.add(key);
  rowsToInsert.push({ dispatcher_id: id, work_date: rec.date, hour: rec.hour, sigla: rec.sigla, in_round_robin: rec.in_round_robin });
}
console.log("Mapeados:", rowsToInsert.length, "| sin match:", [...unmatched].sort().join(", ") || "—");
// date range
const dates = [...new Set(rowsToInsert.map((r) => r.work_date))].sort();
console.log("Rango de fechas:", dates[0], "→", dates[dates.length - 1], `(${dates.length} días)`);

if (!COMMIT) {
  console.log("\n(DRY RUN — agregá --commit para insertar)");
  process.exit(0);
}

await sb.from("messaging_schedule").delete().neq("id", "00000000-0000-0000-0000-000000000000");
const BATCH = 500;
let total = 0;
for (let i = 0; i < rowsToInsert.length; i += BATCH) {
  const { data, error } = await sb.from("messaging_schedule").upsert(rowsToInsert.slice(i, i + BATCH), { onConflict: "dispatcher_id,work_date,hour" }).select("id");
  if (error) { console.error("❌", error.message); process.exit(1); }
  total += data.length;
}
console.log(`✅ Insertados ${total} registros de mensajería.`);
