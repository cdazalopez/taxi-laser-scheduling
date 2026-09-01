// Parses HORARIOS 36.xlsx and imports hourly demand + full metrics block into
// demanda_historica (ride_count, dispatchers_on, and metrics jsonb).
// Usage: node --env-file=.env.local scripts/import-demanda.mjs "/path/to/HORARIOS 36.xlsx"
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";

const xlsxPath = process.argv[2] || "/Users/carlosdaza/Downloads/HORARIOS 36.xlsx";
const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const WEEKDAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const EXCLUDE = new Set(["Plantilla May  01 - Jun 07"]);

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function addDays(y, m, d, n) {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
}
const parseStart = (name) => {
  const m = norm(name).match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[_\s]+(\d{1,2})/);
  return m ? { month: MONTHS[m[1]], day: Number(m[2]) } : null;
};
function hourToNum(h) {
  const m = norm(h).match(/(\d{1,2}):?\d{0,2}\s*(am|pm)/);
  if (!m) return null;
  let hr = Number(m[1]) % 12;
  if (m[2] === "pm") hr += 12;
  return hr;
}
// header label -> normalized metric key
function metricKey(h) {
  const n = norm(h);
  if (n.startsWith("disp")) return "disp_hora";
  if (n.startsWith("calls prom")) return "calls_prom";
  if (n.startsWith("semana pas")) return "semana_pas";
  if (n.startsWith("calls / disp") || n.startsWith("calls/disp")) return "calls_disp";
  if (n === "total") return "total";
  return null;
}

const wb = xlsx.readFile(xlsxPath);
const weekly = wb.SheetNames.filter((n) => !EXCLUDE.has(n)).map((name) => ({ name, start: parseStart(name) })).filter((s) => s.start);
let prevKey = 0;
for (const s of weekly) {
  const cands = [];
  for (let y = 2023; y <= 2027; y++) if (addDays(y, s.start.month, s.start.day, 0).dow === 1) cands.push(y);
  let ch = cands.find((y) => y * 10000 + s.start.month * 100 + s.start.day >= prevKey);
  if (ch === undefined) ch = cands[cands.length - 1];
  s.year = ch ?? null;
  if (ch) prevKey = ch * 10000 + s.start.month * 100 + s.start.day;
}

const byKey = new Map();
for (const s of weekly) {
  if (!s.year) continue;
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[s.name], { header: 1, defval: "" });
  for (let r = 0; r < rows.length - 2; r++) {
    if (WEEKDAYS.indexOf(norm(rows[r][1])) === -1) continue;
    const hdr = rows[r + 1];
    if (norm(hdr[1]) !== "hora") continue;
    // metric columns by header
    const metricCols = [];
    for (let c = 2; c < hdr.length; c++) {
      const k = metricKey(hdr[c]);
      if (k && !metricCols.some((x) => x.k === k)) metricCols.push({ c, k });
    }
    if (!metricCols.some((x) => x.k === "calls_prom")) continue;

    const dd = addDays(s.year, s.start.month, s.start.day, WEEKDAYS.indexOf(norm(rows[r][1])));
    const date = isoDate(dd.y, dd.m, dd.d);

    for (let hr = 0; hr < 24; hr++) {
      const row = rows[r + 2 + hr];
      if (!row) break;
      const hour = hourToNum(row[1]);
      if (hour === null) continue;
      const metrics = {};
      for (const { c, k } of metricCols) {
        const v = Number(row[c]);
        if (Number.isFinite(v)) metrics[k] = Math.round(v * 100) / 100;
      }
      if (metrics.calls_prom === undefined) continue;
      byKey.set(`${date}|${hour}`, {
        demand_date: date,
        hour,
        ride_count: Math.round(metrics.calls_prom),
        dispatchers_on: metrics.disp_hora ?? null,
        metrics,
        source: "import",
      });
    }
  }
}

const records = [...byKey.values()];
console.log(`Filas: ${records.length} | métricas por fila (ejemplo):`, JSON.stringify(records[0]?.metrics));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BATCH = 500;
let total = 0;
for (let i = 0; i < records.length; i += BATCH) {
  const { data, error } = await sb.from("demanda_historica").upsert(records.slice(i, i + BATCH), { onConflict: "demand_date,hour" }).select("id");
  if (error) { console.error("❌", error.message); process.exit(1); }
  total += data.length;
  process.stdout.write(`\r  ${total}/${records.length}`);
}
console.log(`\n✅ Importadas ${total} filas de demanda con métricas.`);
