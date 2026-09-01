// Parses HORARIOS 36.xlsx (36 weeks of schedules) into data/demanda.csv.
// Extracts per (date, hour): ride_count = "Calls Prom.", dispatchers_on = "Disp. * hora".
// Usage: node scripts/parse-horarios.mjs "/path/to/HORARIOS 36.xlsx"
import xlsx from "xlsx";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const xlsxPath = process.argv[2] || "/Users/carlosdaza/Downloads/HORARIOS 36.xlsx";

const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const WEEKDAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

function norm(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
function isoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function addDays(y, m, d, n) {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
}
// Parse the FIRST "MonthAbbr DD" token from a sheet name → { month, day }
function parseStart(name) {
  const n = norm(name);
  // formats: "dic_02_al_08_2024", "plantilla jul 07 al jul 13", "plantilla oct 6 - oct 12", "mar 31 a abr 06"
  const m = n.match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[_\s]+(\d{1,2})/);
  if (!m) return null;
  return { month: MONTHS[m[1]], day: Number(m[2]) };
}
function hourToNum(h) {
  const m = norm(h).match(/(\d{1,2}):?\d{0,2}\s*(am|pm)/);
  if (!m) return null;
  let hr = Number(m[1]) % 12;
  if (m[2] === "pm") hr += 12;
  return hr;
}

const wb = xlsx.readFile(xlsxPath);

// Anomalous tabs to exclude (multi-week ranges / summaries that aren't a single Monday-week).
const EXCLUDE = new Set(["Plantilla May  01 - Jun 07"]);

// Keep only sheets whose name parses to a start date (weekly schedule sheets).
const weekly = wb.SheetNames.filter((name) => !EXCLUDE.has(name))
  .map((name) => ({ name, start: parseStart(name) }))
  .filter((s) => s.start);

// Assign the year by anchoring on the fact that each week starts on Monday (Lunes).
// For each sheet, pick the year in a plausible window where (month, day) is a Monday.
// If several qualify, greedily choose the one that keeps sheets in chronological order.
const YEAR_MIN = 2023, YEAR_MAX = 2027;
let prevKey = 0; // yyyymmdd of previous sheet, to keep order
for (const s of weekly) {
  const candidates = [];
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
    if (addDays(y, s.start.month, s.start.day, 0).dow === 1) candidates.push(y);
  }
  let chosen;
  if (candidates.length === 0) {
    chosen = null; // will be flagged
  } else {
    // prefer the smallest candidate whose date is >= previous sheet's date
    chosen = candidates.find((y) => y * 10000 + s.start.month * 100 + s.start.day >= prevKey);
    if (chosen === undefined) chosen = candidates[candidates.length - 1];
  }
  s.year = chosen;
  if (chosen) prevKey = chosen * 10000 + s.start.month * 100 + s.start.day;
}

const out = [["demand_date", "hour", "ride_count", "dispatchers_on"].join(",")];
const warnings = [];
let sheetsUsed = 0;
const dates = new Set();

for (const s of weekly) {
  if (!s.year) {
    warnings.push(`${s.name}: no se encontró año que haga Lunes el ${s.start.month}/${s.start.day} — omitida`);
    continue;
  }
  const ws = wb.Sheets[s.name];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Find day blocks: a cell in col 1 equals a weekday name; header row is next; 24 hour rows follow.
  let blocks = 0;
  for (let r = 0; r < rows.length - 2; r++) {
    const cell = norm(rows[r][1]);
    const dayIdx = WEEKDAYS.indexOf(cell);
    if (dayIdx === -1) continue;
    const hdr = rows[r + 1];
    if (norm(hdr[1]) !== "hora") continue; // must be a real block with HORA header
    // locate summary columns by header label
    let callsCol = -1, dispCol = -1;
    for (let c = 0; c < hdr.length; c++) {
      const h = norm(hdr[c]);
      if (h === "calls prom." || h === "calls prom") callsCol = c;
      if (h === "disp. * hora" || h === "disp * hora") dispCol = c;
    }
    if (callsCol === -1) continue; // no demand data in this block

    const dd = addDays(s.year, s.start.month, s.start.day, dayIdx);
    const date = isoDate(dd.y, dd.m, dd.d);

    for (let hr = 0; hr < 24; hr++) {
      const row = rows[r + 2 + hr];
      if (!row) break;
      const hour = hourToNum(row[1]);
      if (hour === null) continue;
      const calls = Number(row[callsCol]);
      const disp = dispCol > -1 ? Number(row[dispCol]) : null;
      if (!Number.isFinite(calls)) continue;
      out.push([date, hour, Math.round(calls), Number.isFinite(disp) ? disp : ""].join(","));
      dates.add(date);
    }
    blocks++;
  }
  if (blocks > 0) sheetsUsed++;
  else warnings.push(`${s.name}: 0 bloques de día con demanda`);
}

writeFileSync(join(__dirname, "..", "data", "demanda.csv"), out.join("\n") + "\n");

const sortedDates = [...dates].sort();
console.log(`Hojas semanales detectadas: ${weekly.length}, con datos: ${sheetsUsed}`);
console.log(`Filas (date,hour): ${out.length - 1}`);
console.log(`Rango de fechas: ${sortedDates[0]} → ${sortedDates[sortedDates.length - 1]} (${sortedDates.length} días)`);
console.log(`\nMuestra:`);
out.slice(1, 6).forEach((l) => console.log("  " + l));
console.log(`  ...`);
out.slice(-4).forEach((l) => console.log("  " + l));
console.log(`\nAvisos (${warnings.length}):`);
warnings.slice(0, 20).forEach((w) => console.log("  ⚠ " + w));
