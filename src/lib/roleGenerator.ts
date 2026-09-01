import "server-only";
import { getServiceClient } from "@/lib/supabase/server";

const dowOf = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();
const hourOf = (t: string | null, def: number) => (t ? Number(String(t).slice(0, 2)) : def);

export interface RoleGenResult {
  runId: string;
  rows: number;
  msgHours: number;
  coveragePct: number;
  gaps: number;
}

/**
 * Role-grid generator: base shifts + messaging rotation in 1-hour NON-consecutive
 * slots, up to maxMsgHours/day, rotated evenly. Produces generated_roles.
 */
export async function generateRoles(weekStart: string, daysOff = 2, maxMsg = 6): Promise<RoleGenResult> {
  const sb = getServiceClient();
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const [{ data: profiles }, { data: perms }, { data: cov }] = await Promise.all([
    sb.from("dispatcher_profiles").select("dispatcher_id, work_days, typical_start, typical_end, earliest_start, latest_end, max_hours_week, can_message, is_night, dispatcher:dispatchers!inner(status)").eq("dispatcher.status", "activo"),
    sb.from("permisos").select("dispatcher_id, start_date, end_date").eq("estado", "aprobado").lte("start_date", weekDates[6]).gte("end_date", weekDates[0]),
    sb.from("coverage_targets").select("dow, hour, role, target"),
  ]);

  const onLeave = (id: string, iso: string) => (perms ?? []).some((p) => p.dispatcher_id === id && iso >= p.start_date && iso <= p.end_date);
  // targets by role: tgt[role][dow][hour]
  const tgtByRole: Record<string, Record<number, Record<number, number>>> = {};
  for (const r of cov ?? []) { (tgtByRole[r.role] = tgtByRole[r.role] || {}); (tgtByRole[r.role][r.dow] = tgtByRole[r.role][r.dow] || {})[r.hour] = r.target; }
  const tgt = tgtByRole["msg"] ?? {};
  const roleTgt = (role: string, dow: number, h: number) => tgtByRole[role]?.[dow]?.[h] ?? 0;

  // base shifts → working grid + role grid (null = working, no role)
  const working: Record<string, Record<number, Set<string>>> = {};
  const role: Record<string, Record<string, string | null>> = {};
  const canMsg = new Map<string, boolean>();
  for (const iso of weekDates) { working[iso] = {}; role[iso] = {}; for (let h = 0; h < 24; h++) working[iso][h] = new Set(); }

  const OPEN = 4; // operation opens at 4 AM — no day shift starts earlier
  const NIGHT_HOURS = [20, 21, 22, 23, 0, 1, 2, 3]; // madrugada: 20:00→03:59 continuous, no break
  // day-shift patterns: total 8–9h split in two blocks with a minimum break
  // (9h → 5/4 + 2h break; 8h → 4/4 or 5/3 + 1h break)
  const PATTERNS = [
    { blocks: [5, 4], brk: 2, total: 9 },
    { blocks: [4, 4], brk: 1, total: 8 },
    { blocks: [5, 3], brk: 1, total: 8 },
  ];
  // total headcount demand per (dow, hour) = sum of every role's target
  const needAt = (dow: number, h: number) => ["msg", "A", "A1", "A2", "MR"].reduce((s, r) => s + roleTgt(r, dow, h), 0);
  const addHour = (iso: string, id: string, h: number) => { const hh = ((h % 24) + 24) % 24; working[iso][hh].add(id); role[iso][`${id}|${hh}`] = null; };

  // resolve each dispatcher's working days (with day-off rotation), split night vs day
  const nightW: { p: any; days: string[] }[] = [];
  const dayW: { p: any; days: string[] }[] = [];
  for (const p of (profiles ?? []) as any[]) {
    canMsg.set(p.dispatcher_id, p.can_message);
    const wdays: number[] = p.work_days?.length ? p.work_days : [1, 2, 3, 4, 5];
    const avail = weekDates.filter((iso) => wdays.includes(dowOf(iso)) && !onLeave(p.dispatcher_id, iso));
    for (let i = avail.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [avail[i], avail[j]] = [avail[j], avail[i]]; }
    const numWork = Math.min(avail.length, 7 - daysOff);
    if (numWork <= 0) continue;
    (p.is_night ? nightW : dayW).push({ p, days: avail.slice(0, numWork) });
  }

  // 1) night workers: fixed continuous 20:00–03:59 (no break)
  for (const { p, days } of nightW)
    for (const iso of days) for (const h of NIGHT_HOURS) addHour(iso, p.dispatcher_id, h);

  // 2) day workers: greedy fill by coverage — each shift placed where it reduces the most deficit
  const cover: Record<string, number[]> = {};
  for (const iso of weekDates) { cover[iso] = Array(24).fill(0); for (let h = 0; h < 24; h++) cover[iso][h] = working[iso][h].size; }

  const tasks: { p: any; iso: string }[] = [];
  for (const { p, days } of dayW) for (const iso of days) tasks.push({ p, iso });
  for (let i = tasks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tasks[i], tasks[j]] = [tasks[j], tasks[i]]; }

  const VARY = 3;
  for (const { p, iso } of tasks) {
    const dow = dowOf(iso);
    const typ = hourOf(p.typical_start, 8);
    const early = hourOf(p.earliest_start, 0);
    const late = hourOf(p.latest_end, 24) || 24;
    // profiles with a full 0–24 range (or wrap artifact) are flexible → place anywhere to fill gaps
    const flexible = (early <= OPEN && late >= 23) || typ < OPEN;

    let best: { s: number; w: number[]; total: number; score: number } | null = null;
    for (const pat of PATTERNS) {
      const span = pat.blocks[0] + pat.brk + pat.blocks[1];
      const sLo = flexible ? OPEN : Math.max(OPEN, typ - VARY);
      let sHi = flexible ? 24 - span : Math.min(24 - span, late - span, typ + VARY);
      if (sHi < sLo) sHi = sLo;
      for (let s = sLo; s <= sHi; s++) {
        const w: number[] = [];
        for (let h = s; h < s + pat.blocks[0]; h++) w.push(h);
        const b2s = s + pat.blocks[0] + pat.brk;
        for (let h = b2s; h < b2s + pat.blocks[1]; h++) w.push(h);
        if (w.some((h) => h >= 24)) continue;
        let score = 0;
        for (const h of w) if (needAt(dow, h) > cover[iso][h]) score++;
        // maximize deficit reduction; tie → fewer hours (efficiency), then earlier start
        if (
          !best ||
          score > best.score ||
          (score === best.score && (pat.total < best.total || (pat.total === best.total && s < best.s)))
        ) {
          best = { s, w, total: pat.total, score };
        }
      }
    }
    if (!best) continue;
    for (const h of best.w) { addHour(iso, p.dispatcher_id, h); cover[iso][h]++; }
  }

  // messaging rotation
  let coveredHours = 0, targetHours = 0, gaps = 0;
  for (const iso of weekDates) {
    const dow = dowOf(iso);
    const msgCount: Record<string, number> = {}, lastMsg: Record<string, number> = {};
    for (let h = 0; h < 24; h++) {
      const target = tgt[dow]?.[h] ?? 0;
      if (!target) continue;
      targetHours += target;
      const cands = [...working[iso][h]].filter((id) => canMsg.get(id) && lastMsg[id] !== h - 1 && (msgCount[id] || 0) < maxMsg);
      cands.sort((a, b) => (msgCount[a] || 0) - (msgCount[b] || 0) || (lastMsg[a] ?? -99) - (lastMsg[b] ?? -99));
      const pick = cands.slice(0, target);
      for (const id of pick) { role[iso][`${id}|${h}`] = "NE"; msgCount[id] = (msgCount[id] || 0) + 1; lastMsg[id] = h; }
      coveredHours += pick.length;
      if (pick.length < target) gaps++;
    }
  }

  // phone + ring-central roles: messaging-capable → MR / (available); phone → A / A1 / A2
  for (const iso of weekDates) {
    const dow = dowOf(iso);
    let a1 = null as string | null, a2 = null as string | null;
    for (let h = 0; h < 24; h++) {
      const workers = [...working[iso][h]];
      const msgCap = workers.filter((id) => canMsg.get(id));
      const phone = workers.filter((id) => !canMsg.get(id));
      // messaging-capable not on NE → MR up to target (else left available/null)
      const mrTarget = roleTgt("MR", dow, h);
      const mrCands = msgCap.filter((id) => role[iso][`${id}|${h}`] !== "NE");
      for (const id of mrCands.slice(0, mrTarget)) role[iso][`${id}|${h}`] = "MR";
      // phone dispatchers default to A
      for (const id of phone) role[iso][`${id}|${h}`] = "A";
      // A1 (agenda) and A2 (copias): 1 each, prefer continuity with the previous hour
      if (roleTgt("A1", dow, h) > 0) {
        if (!(a1 && working[iso][h].has(a1))) a1 = phone.find((id) => id !== a2) ?? null;
        if (a1) role[iso][`${a1}|${h}`] = "A1";
      } else a1 = null;
      if (roleTgt("A2", dow, h) > 0) {
        if (!(a2 && working[iso][h].has(a2) && a2 !== a1)) a2 = phone.find((id) => id !== a1 && role[iso][`${id}|${h}`] !== "A1") ?? null;
        if (a2) role[iso][`${a2}|${h}`] = "A2";
      } else a2 = null;
    }
  }

  // persist
  const { data: runRow, error: runErr } = await sb.from("schedule_runs").insert({ week_start: weekStart, days_off: daysOff, max_msg_hours: maxMsg }).select("id").single();
  if (runErr) throw runErr;
  const runId = runRow.id;
  const rows: any[] = [];
  for (const iso of weekDates) for (const key of Object.keys(role[iso])) {
    const [dispatcher_id, h] = key.split("|");
    const sigla = role[iso][key];
    rows.push({ run_id: runId, dispatcher_id, work_date: iso, hour: Number(h), sigla, in_round_robin: sigla === "NE" });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("generated_roles").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }

  return { runId, rows: rows.length, msgHours: rows.filter((r) => r.in_round_robin).length, coveragePct: targetHours ? Math.round((coveredHours / targetHours) * 100) : 100, gaps };
}
