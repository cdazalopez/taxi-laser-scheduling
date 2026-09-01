import "server-only";
import * as xlsx from "xlsx";
import { getServiceClient } from "@/lib/supabase/server";

const MONTHS: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const WEEKDAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const RR = /^(NE|MC[1-6]?)$/i; // round-robin messaging siglas: NE, MC, MC1–MC6

const norm = (s: any) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const isoDate = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function addDays(y: number, m: number, d: number, n: number) {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
}
function mondayOf(name: string) {
  const mm = norm(name).match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[_\s]+(\d{1,2})/);
  if (!mm) return null;
  const month = MONTHS[mm[1]], day = Number(mm[2]);
  for (let y = 2024; y <= 2028; y++) if (addDays(y, month, day, 0).dow === 1) return { y, month, day };
  return null;
}
function codeToRef(cell: any) {
  const m = String(cell ?? "").trim().match(/(\d{2,3})\s*$/);
  return m ? "D" + m[1].padStart(3, "0") : null;
}
function hourToNum(h: any) {
  const m = norm(h).match(/(\d{1,2}):?\d{0,2}\s*(am|pm)/);
  if (!m) return null;
  let hr = Number(m[1]) % 12;
  if (m[2] === "pm") hr += 12;
  return hr;
}

export interface UploadResult {
  rows: number;
  roundRobin: number;
  dates: string[];
  unmatched: string[];
  shifts: number; // shift blocks derived into `schedule` (Semana/Día views)
}

/** Date (YYYY-MM-DD) of a weekday (0=Mon..6=Sun) in the current Eastern week. */
function currentWeekDate(dayIdx: number): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const mondayOffset = (now.getDay() + 6) % 7; // days since Monday
  const d = new Date(now);
  d.setDate(now.getDate() - mondayOffset + dayIdx);
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Parse a schedule .xlsx buffer and replace role_schedule for the days it contains.
 *  Robust to a leading empty column and undated sheets (maps weekdays to the current week). */
export async function importScheduleFromBuffer(buf: Buffer): Promise<UploadResult> {
  const wb = xlsx.read(buf, { type: "buffer" });
  const records: { ref: string; date: string; hour: number; section: string; sigla: string; in_round_robin: boolean }[] = [];

  for (const sheetName of wb.SheetNames) {
    const monday = mondayOf(sheetName); // may be null for undated sheets
    const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });

    // A day block = a "HORA" header cell with a weekday name in the row above (same column).
    for (let hr = 1; hr < rows.length; hr++) {
      const hourCol = rows[hr].findIndex((v) => norm(v) === "hora");
      if (hourCol === -1) continue;
      const dayIdx = WEEKDAYS.indexOf(norm(rows[hr - 1][hourCol]));
      if (dayIdx === -1) continue;

      let date: string;
      if (monday) {
        const dd = addDays(monday.y, monday.month, monday.day, dayIdx);
        date = isoDate(dd.y, dd.m, dd.d);
      } else {
        date = currentWeekDate(dayIdx);
      }

      // Dispatcher columns start after HORA. Categorize by the SIGLA itself, not the column
      // position — a messaging sigla (NE/MC) can appear in any column and must still enter the
      // round-robin. (Column-based categorization was the bug that hid dispatchers from the pool.)
      const hdr = rows[hr];
      const cols: { c: number; ref: string }[] = [];
      for (let c = hourCol + 1; c < hdr.length; c++) {
        const ref = codeToRef(hdr[c]);
        if (ref) cols.push({ c, ref });
      }
      for (let h = 0; h < 24; h++) {
        const row = rows[hr + 1 + h];
        if (!row) break;
        const hour = hourToNum(row[hourCol]);
        if (hour === null) continue;
        for (const { c, ref } of cols) {
          const sigla = String(row[c] ?? "").trim().toUpperCase();
          if (!sigla) continue;
          const rr = RR.test(sigla); // NE/MC* → round-robin
          const section = rr || sigla === "MR" ? "messaging" : "phone"; // MR = messaging but not RR
          records.push({ ref, date, hour, section, sigla, in_round_robin: rr });
        }
      }
    }
  }

  const sb = getServiceClient();
  const { data: disp } = await sb.from("dispatchers").select("id, external_ref");
  const idByRef = new Map((disp ?? []).map((d: any) => [d.external_ref, d.id]));

  const seen = new Set<string>();
  const toInsert: any[] = [];
  const unmatched = new Set<string>();
  const dates = new Set<string>();
  for (const rec of records) {
    const id = idByRef.get(rec.ref);
    if (!id) { unmatched.add(rec.ref); continue; }
    const key = `${id}|${rec.date}|${rec.hour}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dates.add(rec.date);
    toInsert.push({ dispatcher_id: id, work_date: rec.date, hour: rec.hour, section: rec.section, sigla: rec.sigla, in_round_robin: rec.in_round_robin });
  }

  // Replace only the dates present in this file (don't wipe other weeks).
  const dateList = [...dates];
  let shiftCount = 0;
  if (dateList.length) {
    await sb.from("role_schedule").delete().in("work_date", dateList);
    for (let i = 0; i < toInsert.length; i += 500) {
      const { error } = await sb.from("role_schedule").insert(toInsert.slice(i, i + 500));
      if (error) throw error;
    }

    // Also derive shift blocks → `schedule` (drives the Semana/Día views). role_schedule is a
    // sparse messaging roster (only role-marked hours), so cluster each dispatcher's marked hours
    // into shifts: bridge short gaps (≤ MAX_GAP apart = same shift), split on big gaps (overnight).
    const MAX_GAP = 5;
    const byDD = new Map<string, number[]>();
    for (const r of toInsert) {
      const k = `${r.dispatcher_id}|${r.work_date}`;
      if (!byDD.has(k)) byDD.set(k, []);
      byDD.get(k)!.push(r.hour);
    }
    const shifts: any[] = [];
    for (const [k, hraw] of byDD) {
      const [dispatcher_id, shift_date] = k.split("|");
      const hrs = [...new Set(hraw)].sort((a, b) => a - b);
      let s = hrs[0], p = hrs[0];
      const push = (start: number, lastMarked: number) =>
        shifts.push({
          dispatcher_id,
          shift_date,
          shift_start: `${String(start).padStart(2, "0")}:00`,
          shift_end: lastMarked + 1 >= 24 ? "23:59" : `${String(lastMarked + 1).padStart(2, "0")}:00`,
          status: "programado",
        });
      for (let i = 1; i < hrs.length; i++) {
        if (hrs[i] - p <= MAX_GAP) { p = hrs[i]; continue; }
        push(s, p); s = hrs[i]; p = hrs[i];
      }
      push(s, p);
    }
    await sb.from("schedule").delete().in("shift_date", dateList);
    for (let i = 0; i < shifts.length; i += 500) {
      const { error } = await sb.from("schedule").insert(shifts.slice(i, i + 500));
      if (error) throw error;
    }
    shiftCount = shifts.length;
  }
  await sb.rpc("refresh_pool_activo");

  return {
    rows: toInsert.length,
    roundRobin: toInsert.filter((r) => r.in_round_robin).length,
    dates: dateList.sort(),
    unmatched: [...unmatched].sort(),
    shifts: shiftCount,
  };
}
