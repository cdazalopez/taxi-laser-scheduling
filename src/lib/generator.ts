import "server-only";
import { getServiceClient } from "@/lib/supabase/server";

const dowOf = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();
const hourOf = (t: string | null, def: number) => (t ? Number(String(t).slice(0, 2)) : def);

export interface GenerateResult {
  runId: string;
  shifts: number;
  dispatchers: number;
  totalHours: number;
  coveragePct: number;
  gaps: number;
}

/**
 * Greedy schedule generator: each dispatcher works their typical days; the shift
 * START is chosen within their availability window to cover the hours with the most
 * unmet messaging demand. Respects days-off, hours floor and the max-hours cap.
 */
export async function generateSchedule(weekStart: string, daysOff = 2): Promise<GenerateResult> {
  const sb = getServiceClient();
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const [{ data: profiles }, { data: perms }, { data: cov }] = await Promise.all([
    sb
      .from("dispatcher_profiles")
      .select("dispatcher_id, work_days, typical_start, typical_end, max_hours_week, can_message, dispatcher:dispatchers!inner(status)")
      .eq("dispatcher.status", "activo"),
    sb.from("permisos").select("dispatcher_id, start_date, end_date").eq("estado", "aprobado").lte("start_date", weekDates[6]).gte("end_date", weekDates[0]),
    sb.from("coverage_targets").select("dow, hour, target").eq("role", "msg"),
  ]);

  const onLeave = (id: string, iso: string) =>
    (perms ?? []).some((p) => p.dispatcher_id === id && iso >= p.start_date && iso <= p.end_date);
  const tgt: Record<number, Record<number, number>> = {};
  for (const r of cov ?? []) (tgt[r.dow] = tgt[r.dow] || {})[r.hour] = r.target;

  const need: Record<string, number[]> = {};
  const target: Record<string, number[]> = {};
  for (const iso of weekDates) {
    const dow = dowOf(iso);
    need[iso] = []; target[iso] = [];
    for (let h = 0; h < 24; h++) { const t = tgt[dow]?.[h] ?? 0; need[iso][h] = t; target[iso][h] = t; }
  }

  const list = [...(profiles ?? [])].sort((a: any, b: any) => (b.can_message === a.can_message ? 0 : b.can_message ? 1 : -1));
  const shifts: any[] = [];
  for (const p of list as any[]) {
    const wdays: number[] = p.work_days?.length ? p.work_days : [1, 2, 3, 4, 5];
    const avail = weekDates.filter((iso) => wdays.includes(dowOf(iso)) && !onLeave(p.dispatcher_id, iso));
    const numWork = Math.min(avail.length, 7 - daysOff);
    if (numWork <= 0) continue;
    const floor = numWork >= 6 ? 48 : 40;
    const maxH = p.max_hours_week ?? 52;
    let len = Math.max(10, Math.ceil(floor / numWork));
    if (len * numWork > maxH) len = Math.floor(maxH / numWork);
    len = Math.min(13, Math.max(8, len));
    const wStart = hourOf(p.typical_start, 8);
    const wEnd = Math.min(24, Math.max(wStart + len, hourOf(p.typical_end, wStart + len)));
    const latest = Math.max(wStart, Math.min(wEnd - len, 24 - len));

    for (const iso of avail.slice(0, numWork)) {
      let start = wStart;
      if (p.can_message) {
        let best = -1;
        for (let s = wStart; s <= latest; s++) {
          let val = 0;
          for (let h = s; h < s + len; h++) val += Math.max(0, need[iso][h] ?? 0);
          if (val > best) { best = val; start = s; }
        }
        for (let h = start; h < start + len; h++) if (need[iso][h] > 0) need[iso][h]--;
      }
      shifts.push({ dispatcher_id: p.dispatcher_id, work_date: iso, start_hour: start, end_hour: start + len, role_hint: p.can_message ? "msg" : "phone" });
    }
  }

  let th = 0, ch = 0, gaps = 0;
  for (const iso of weekDates) for (let h = 0; h < 24; h++) {
    const t = target[iso][h]; if (!t) continue;
    const covered = t - need[iso][h];
    th += t; ch += covered; if (covered < t) gaps++;
  }

  const { data: runRow, error: runErr } = await sb.from("schedule_runs").insert({ week_start: weekStart, days_off: daysOff }).select("id").single();
  if (runErr) throw runErr;
  const runId = runRow.id;
  if (shifts.length) {
    const rows = shifts.map((s) => ({ ...s, run_id: runId }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from("generated_shifts").insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
  }

  return {
    runId,
    shifts: shifts.length,
    dispatchers: new Set(shifts.map((s) => s.dispatcher_id)).size,
    totalHours: shifts.reduce((a, s) => a + (s.end_hour - s.start_hour), 0),
    coveragePct: th ? Math.round((ch / th) * 100) : 100,
    gaps,
  };
}
