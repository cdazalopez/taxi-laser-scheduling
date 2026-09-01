// Loads real shifts from HORARIOS 36.xlsx into `schedule`.
// A dispatcher is scheduled for an hour when that cell is COLOR-FILLED (each dispatcher
// has their own color). The '*' text is NOT reliable. Consecutive filled hours collapse
// into contiguous shift blocks.
// Usage: node --env-file=.env.local scripts/parse-schedule.mjs "/path/to/HORARIOS 36.xlsx"
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const xlsxPath = process.argv[2] || "/Users/carlosdaza/Downloads/HORARIOS 36.xlsx";
const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const WEEKDAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const EXCLUDE = new Set(["Plantilla May  01 - Jun 07"]);

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function addDays(y, m, d, n) {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
}
const parseStart = (name) => {
  const m = norm(name).match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[_\s]+(\d{1,2})/);
  return m ? { month: MONTHS[m[1]], day: Number(m[2]) } : null;
};
const codeToRef = (cell) => {
  const m = String(cell ?? "").trim().match(/(\d{2,3})\s*$/);
  return m ? "D" + m[1].padStart(3, "0") : null;
};
// A cell counts as "on shift" when it has a real (non-white) solid fill.
function isOn(cell) {
  const f = cell.fill;
  if (!f || f.type !== "pattern" || !f.pattern || f.pattern === "none") return false;
  const fg = f.fgColor;
  if (!fg) return false;
  if (fg.argb) {
    const a = fg.argb.toUpperCase();
    return a !== "FFFFFFFF" && a !== "00000000";
  }
  if (fg.theme !== undefined) return fg.theme !== 0 && fg.theme !== 1;
  return false;
}
const cellText = (cell) => {
  const v = cell.value;
  if (v && typeof v === "object" && "text" in v) return v.text;
  if (v && typeof v === "object" && "result" in v) return v.result;
  return v;
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsxPath);

const sheets = [];
wb.eachSheet((ws) => {
  if (EXCLUDE.has(ws.name)) return;
  const start = parseStart(ws.name);
  if (start) sheets.push({ ws, start });
});
// year anchored to Monday-start weeks
let prevKey = 0;
for (const s of sheets) {
  const cands = [];
  for (let y = 2023; y <= 2027; y++) if (addDays(y, s.start.month, s.start.day, 0).dow === 1) cands.push(y);
  let ch = cands.find((y) => y * 10000 + s.start.month * 100 + s.start.day >= prevKey);
  if (ch === undefined) ch = cands[cands.length - 1];
  s.year = ch ?? null;
  if (ch) prevKey = ch * 10000 + s.start.month * 100 + s.start.day;
}

const shifts = [];
const codesSeen = new Set();
for (const s of sheets) {
  if (!s.year) continue;
  const ws = s.ws;
  const maxRow = ws.rowCount;
  for (let r = 1; r <= maxRow - 2; r++) {
    const dayIdx = WEEKDAYS.indexOf(norm(cellText(ws.getRow(r).getCell(2))));
    if (dayIdx === -1) continue;
    const hdr = ws.getRow(r + 1);
    if (norm(cellText(hdr.getCell(2))) !== "hora") continue;

    // dispatcher columns: from col 3 up to the "Disp"/"Calls" summary column
    let endCol = 3;
    for (let c = 3; c < 90; c++) {
      const h = norm(cellText(hdr.getCell(c)));
      if (!h) { endCol = c; break; }
      if (h.startsWith("disp") || h.startsWith("calls")) { endCol = c; break; }
      endCol = c + 1;
    }
    const cols = [];
    for (let c = 3; c < endCol; c++) {
      const ref = codeToRef(cellText(hdr.getCell(c)));
      if (ref) { cols.push({ c, ref }); codesSeen.add(ref); }
    }

    const dd = addDays(s.year, s.start.month, s.start.day, dayIdx);
    const date = isoDate(dd.y, dd.m, dd.d);

    for (const { c, ref } of cols) {
      let runStart = null;
      for (let hr = 0; hr <= 24; hr++) {
        const on = hr < 24 ? isOn(ws.getRow(r + 2 + hr).getCell(c)) : false;
        if (on && runStart === null) runStart = hr;
        if (!on && runStart !== null) {
          shifts.push({
            ref,
            date,
            start: `${String(runStart).padStart(2, "0")}:00`,
            end: hr >= 24 ? "23:59" : `${String(hr).padStart(2, "0")}:00`,
          });
          runStart = null;
        }
      }
    }
  }
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: disp, error } = await sb.from("dispatchers").select("id, external_ref");
if (error) throw error;
const idByRef = new Map(disp.map((d) => [d.external_ref, d.id]));

const byKey = new Map();
const unmatched = new Set();
for (const s of shifts) {
  const id = idByRef.get(s.ref);
  if (!id) { unmatched.add(s.ref); continue; }
  byKey.set(`${id}|${s.date}|${s.start}`, { dispatcher_id: id, shift_date: s.date, shift_start: s.start, shift_end: s.end, status: "programado" });
}
const final = [...byKey.values()];
console.log(`Turnos (color-based): ${shifts.length} | únicos: ${final.length} | códigos: ${codesSeen.size} | sin match (${unmatched.size}): ${[...unmatched].sort().join(", ") || "—"}`);

// Replace the schedule entirely (old '*'-based load was wrong).
console.log("Borrando schedule anterior…");
await sb.from("schedule").delete().neq("id", "00000000-0000-0000-0000-000000000000");

const BATCH = 500;
let total = 0;
for (let i = 0; i < final.length; i += BATCH) {
  const { data, error: e } = await sb.from("schedule").upsert(final.slice(i, i + BATCH), { onConflict: "dispatcher_id,shift_date,shift_start" }).select("id");
  if (e) { console.error("❌", e.message); process.exit(1); }
  total += data.length;
  process.stdout.write(`\r  ${total}/${final.length}`);
}
console.log(`\n✅ Cargados ${total} turnos (basados en color).`);
