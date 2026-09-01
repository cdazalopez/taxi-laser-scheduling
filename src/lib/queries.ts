import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/dates";
import type { Dispatcher, Shift, Permiso, PoolActivo } from "@/lib/types";

export async function getDispatchers(): Promise<Dispatcher[]> {
  const sb = getServiceClient();
  const { data, error } = await sb.from("dispatchers").select("*").order("full_name");
  if (error) throw error;
  return data ?? [];
}

type ShiftWithDispatcher = Shift & {
  dispatcher: Pick<Dispatcher, "id" | "full_name" | "external_ref"> | null;
};

export async function getWeekSchedule(weekStartIso: string): Promise<ShiftWithDispatcher[]> {
  const sb = getServiceClient();
  const end = addDays(weekStartIso, 7);
  const { data, error } = await sb
    .from("schedule")
    .select("*, dispatcher:dispatchers(id, full_name, external_ref)")
    .gte("shift_date", weekStartIso)
    .lt("shift_date", end)
    .order("shift_date")
    .order("shift_start");
  if (error) throw error;
  return data ?? [];
}

export interface StaffingRow {
  hour: number;
  avg_demand: number;
  max_demand: number;
  avg_staff: number | null;
  avg_load: number | null;
  recommended: number;
  gap: number; // recommended - historical avg staff
}

/** Per-hour staffing recommendation for a day-of-week, given a target calls/dispatcher. */
export async function getStaffingInsights(
  dow: number,
  target: number
): Promise<{ rows: StaffingRow[]; samples: number }> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("demand_by_dow_hour")
    .select("*")
    .eq("dow", dow)
    .order("hour");
  if (error) throw error;

  const byHour = new Map<number, any>((data ?? []).map((r: any) => [r.hour, r]));
  let samples = 0;
  const rows: StaffingRow[] = Array.from({ length: 24 }, (_, h) => {
    const r = byHour.get(h);
    const avgDemand = r?.avg_demand ?? 0;
    const avgStaff = r?.avg_staff ?? null;
    samples = Math.max(samples, r?.samples ?? 0);
    const recommended = target > 0 ? Math.ceil(avgDemand / target) : 0;
    return {
      hour: h,
      avg_demand: avgDemand,
      max_demand: r?.max_demand ?? 0,
      avg_staff: avgStaff,
      avg_load: r?.avg_load ?? null,
      recommended,
      gap: recommended - Math.round(avgStaff ?? 0),
    };
  });
  return { rows, samples };
}

/** Count of ACTIVE dispatchers scheduled per hour on a given date (from `schedule`). */
export async function getScheduledStaffingByHour(dateIso: string): Promise<Map<number, number>> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("schedule")
    .select("shift_start, shift_end, status, dispatcher:dispatchers!inner(status)")
    .eq("shift_date", dateIso);
  if (error) throw error;

  const counts = new Map<number, number>();
  for (let h = 0; h < 24; h++) counts.set(h, 0);
  for (const s of (data ?? []) as any[]) {
    if (s.status === "ausente" || s.dispatcher?.status !== "activo") continue;
    const [sh, sm] = s.shift_start.split(":").map(Number);
    const [eh, em] = s.shift_end.split(":").map(Number);
    const startSec = sh * 3600 + (sm || 0) * 60;
    const endSec = eh * 3600 + (em || 0) * 60;
    for (let h = 0; h < 24; h++) {
      const sec = h * 3600;
      if (startSec <= sec && sec < endSec) counts.set(h, (counts.get(h) ?? 0) + 1);
    }
  }
  return counts;
}

export interface HourMetrics {
  calls_prom?: number;
  semana_pas?: number;
  calls_disp?: number;
  disp_hora?: number;
  total?: number;
}

/** hour (0-23) -> metrics from demanda_historica for a given date. */
export async function getDayDemand(dateIso: string): Promise<Map<number, HourMetrics>> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("demanda_historica")
    .select("hour, metrics")
    .eq("demand_date", dateIso);
  if (error) throw error;
  const map = new Map<number, HourMetrics>();
  for (const r of data ?? []) map.set(r.hour, (r.metrics ?? {}) as HourMetrics);
  return map;
}

export interface MessagingRow {
  dispatcher_id: string;
  hour: number;
  section: string;
  sigla: string;
  in_round_robin: boolean;
  dispatcher: { full_name: string; external_ref: string | null } | null;
}

/** All role siglas (phone A/A1/A2 + messaging NE/MR/MC…) per dispatcher per hour for a date. */
export async function getMessagingDay(dateIso: string): Promise<MessagingRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("role_schedule")
    .select("dispatcher_id, hour, section, sigla, in_round_robin, dispatcher:dispatchers(full_name, external_ref)")
    .eq("work_date", dateIso)
    .order("hour");
  if (error) throw error;
  return (data ?? []) as unknown as MessagingRow[];
}

export async function getDaySchedule(dateIso: string): Promise<ShiftWithDispatcher[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("schedule")
    .select("*, dispatcher:dispatchers(id, full_name, external_ref)")
    .eq("shift_date", dateIso)
    .order("shift_start");
  if (error) throw error;
  return data ?? [];
}

export async function getPermisos(
  estado?: string
): Promise<(Permiso & { dispatcher: Pick<Dispatcher, "id" | "full_name"> | null })[]> {
  const sb = getServiceClient();
  let q = sb
    .from("permisos")
    .select("*, dispatcher:dispatchers!permisos_dispatcher_id_fkey(id, full_name)")
    .order("created_at", { ascending: false });
  if (estado) q = q.eq("estado", estado);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export interface GeneratedShift {
  id: string;
  dispatcher_id: string;
  work_date: string;
  start_hour: number;
  end_hour: number;
  role_hint: string | null;
  full_name: string;
  external_ref: string | null;
  can_message: boolean;
}

export interface GeneratedSchedule {
  run: { id: string; week_start: string; days_off: number; created_at: string } | null;
  shifts: GeneratedShift[];
  /** coverage[dateIso][hour] = { target, covered } for messaging */
  coverage: Record<string, Record<number, { target: number; covered: number }>>;
  weekDates: string[];
}

/** The latest generated schedule run with computed messaging coverage. */
export async function getGeneratedSchedule(): Promise<GeneratedSchedule> {
  const sb = getServiceClient();
  const { data: runs } = await sb
    .from("schedule_runs")
    .select("id, week_start, days_off, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  const run = runs?.[0] ?? null;
  if (!run) return { run: null, shifts: [], coverage: {}, weekDates: [] };

  const { data: rawShifts } = await sb
    .from("generated_shifts")
    .select("id, dispatcher_id, work_date, start_hour, end_hour, role_hint, dispatcher:dispatchers(full_name, external_ref)")
    .eq("run_id", run.id);
  // can_message comes from dispatcher_profiles (no direct FK from generated_shifts → fetch separately)
  const dispIds = [...new Set((rawShifts ?? []).map((s: any) => s.dispatcher_id))];
  const { data: profs } = await sb.from("dispatcher_profiles").select("dispatcher_id, can_message").in("dispatcher_id", dispIds);
  const canMsg = new Map((profs ?? []).map((p: any) => [p.dispatcher_id, p.can_message]));
  const shifts: GeneratedShift[] = (rawShifts ?? []).map((s: any) => ({
    id: s.id,
    dispatcher_id: s.dispatcher_id,
    work_date: s.work_date,
    start_hour: s.start_hour,
    end_hour: s.end_hour,
    role_hint: s.role_hint,
    full_name: s.dispatcher?.full_name ?? "—",
    external_ref: s.dispatcher?.external_ref ?? null,
    can_message: canMsg.get(s.dispatcher_id) ?? false,
  }));

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(run.week_start + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const { data: cov } = await sb.from("coverage_targets").select("dow, hour, target").eq("role", "msg");
  const tgt: Record<number, Record<number, number>> = {};
  for (const r of cov ?? []) (tgt[r.dow] = tgt[r.dow] || {})[r.hour] = r.target;

  const coverage: GeneratedSchedule["coverage"] = {};
  for (const iso of weekDates) {
    const dow = new Date(iso + "T00:00:00Z").getUTCDay();
    coverage[iso] = {};
    for (let h = 0; h < 24; h++) {
      const target = tgt[dow]?.[h] ?? 0;
      const covered = shifts.filter((s) => s.can_message && s.work_date === iso && s.start_hour <= h && h < s.end_hour).length;
      coverage[iso][h] = { target, covered: Math.min(covered, target) };
    }
  }
  return { run, shifts, coverage, weekDates };
}

export interface RoleEditorData {
  runId: string | null;
  weekStart: string | null;
  weekDates: string[];
  editDay: string;
  /** dispatchers currently in the grid for the day, with per-hour sigla ("work" = on shift, no role) */
  gridDispatchers: { dispatcher_id: string; full_name: string; external_ref: string | null; can_message: boolean; cells: Record<number, string> }[];
  /** all active dispatchers, for the right-hand palette */
  palette: { id: string; full_name: string; external_ref: string | null; can_message: boolean }[];
  targets: number[]; // msg target per hour 0-23
}

/** Data for the role-grid editor of the latest generated run for a given day. */
export async function getRoleEditor(day?: string): Promise<RoleEditorData> {
  const sb = getServiceClient();
  const { data: runs } = await sb.from("schedule_runs").select("id, week_start").order("created_at", { ascending: false }).limit(1);
  const run = runs?.[0] ?? null;
  const weekDates = run
    ? Array.from({ length: 7 }, (_, i) => { const d = new Date(run.week_start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); })
    : [];
  const editDay = day && weekDates.includes(day) ? day : weekDates[0] ?? "";

  const [{ data: grid }, { data: disp }, { data: cov }] = await Promise.all([
    run && editDay ? sb.from("generated_roles").select("dispatcher_id, hour, sigla, in_round_robin").eq("run_id", run.id).eq("work_date", editDay) : Promise.resolve({ data: [] as any[] }),
    sb.from("dispatchers").select("id, full_name, external_ref, profile:dispatcher_profiles(can_message)").eq("status", "activo").order("external_ref"),
    editDay ? sb.from("coverage_targets").select("hour, target").eq("role", "msg").eq("dow", new Date(editDay + "T00:00:00Z").getUTCDay()) : Promise.resolve({ data: [] as any[] }),
  ]);

  const canMsg = new Map((disp ?? []).map((d: any) => [d.id, d.profile?.can_message ?? false]));
  const nameOf = new Map((disp ?? []).map((d: any) => [d.id, { full_name: d.full_name, external_ref: d.external_ref }]));

  const byDisp = new Map<string, Record<number, string>>();
  for (const r of (grid ?? []) as any[]) {
    if (!byDisp.has(r.dispatcher_id)) byDisp.set(r.dispatcher_id, {});
    byDisp.get(r.dispatcher_id)![r.hour] = r.sigla ?? "work";
  }
  const gridDispatchers = [...byDisp.entries()].map(([id, cells]) => ({
    dispatcher_id: id,
    full_name: nameOf.get(id)?.full_name ?? "—",
    external_ref: nameOf.get(id)?.external_ref ?? null,
    can_message: canMsg.get(id) ?? false,
    cells,
  })).sort((a, b) => (Number(a.external_ref?.replace(/\D/g, "")) || 9999) - (Number(b.external_ref?.replace(/\D/g, "")) || 9999));

  const targets = Array.from({ length: 24 }, (_, h) => (cov ?? []).find((r: any) => r.hour === h)?.target ?? 0);
  const palette = (disp ?? []).map((d: any) => ({ id: d.id, full_name: d.full_name, external_ref: d.external_ref, can_message: d.profile?.can_message ?? false }));

  return { runId: run?.id ?? null, weekStart: run?.week_start ?? null, weekDates, editDay, gridDispatchers, palette, targets };
}

export interface DayEditorData {
  runId: string | null;
  dispatchers: { id: string; full_name: string; external_ref: string | null; can_message: boolean }[];
  shifts: { id: string; dispatcher_id: string; start_hour: number; end_hour: number; role_hint: string | null }[];
  targets: number[]; // msg target per hour (index 0-23)
}

/** Data for the drag-and-drop editor of a single day of the latest run. */
export async function getDayEditor(dateIso: string): Promise<DayEditorData> {
  const sb = getServiceClient();
  const { data: runs } = await sb
    .from("schedule_runs")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1);
  const runId = runs?.[0]?.id ?? null;

  const [{ data: disp }, shiftsRes, { data: cov }] = await Promise.all([
    sb
      .from("dispatchers")
      .select("id, full_name, external_ref, profile:dispatcher_profiles(can_message)")
      .eq("status", "activo")
      .order("external_ref"),
    runId
      ? sb.from("generated_shifts").select("id, dispatcher_id, start_hour, end_hour, role_hint").eq("run_id", runId).eq("work_date", dateIso)
      : Promise.resolve({ data: [] as any[] }),
    sb.from("coverage_targets").select("hour, target").eq("role", "msg").eq("dow", new Date(dateIso + "T00:00:00Z").getUTCDay()),
  ]);

  const targets = Array.from({ length: 24 }, (_, h) => (cov ?? []).find((r: any) => r.hour === h)?.target ?? 0);
  return {
    runId,
    dispatchers: (disp ?? []).map((d: any) => ({
      id: d.id,
      full_name: d.full_name,
      external_ref: d.external_ref,
      can_message: d.profile?.can_message ?? false,
    })),
    shifts: (shiftsRes.data ?? []) as any[],
    targets,
  };
}

export interface DispatcherProfile {
  dispatcher_id: string;
  full_name: string;
  external_ref: string | null;
  status: string;
  employment: string | null;
  max_hours_week: number | null;
  min_hours_week: number | null;
  avg_hours_week: number | null;
  work_days: number[] | null;
  typical_start: string | null;
  typical_end: string | null;
  can_message: boolean;
  edited: boolean;
}

/** All active dispatchers joined with their scheduling profile. */
export async function getProfiles(): Promise<DispatcherProfile[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("dispatchers")
    .select(
      "id, full_name, external_ref, status, profile:dispatcher_profiles(employment, max_hours_week, min_hours_week, avg_hours_week, work_days, typical_start, typical_end, can_message, edited)"
    )
    .eq("status", "activo")
    .order("external_ref");
  if (error) throw error;
  return (data ?? []).map((d: any) => ({
    dispatcher_id: d.id,
    full_name: d.full_name,
    external_ref: d.external_ref,
    status: d.status,
    employment: d.profile?.employment ?? null,
    max_hours_week: d.profile?.max_hours_week ?? null,
    min_hours_week: d.profile?.min_hours_week ?? null,
    avg_hours_week: d.profile?.avg_hours_week ?? null,
    work_days: d.profile?.work_days ?? null,
    typical_start: d.profile?.typical_start ?? null,
    typical_end: d.profile?.typical_end ?? null,
    can_message: d.profile?.can_message ?? false,
    edited: d.profile?.edited ?? false,
  }));
}

export interface AssignmentEntry {
  id: string;
  created_at: string;
  outcome: string;
  reason: string | null;
  contact_name: string | null;
  channel: string | null;
  dispatcher: { full_name: string; external_ref: string | null } | null;
}

/** Most recent assignment_log entries for the live view. */
export async function getRecentAssignments(limit = 30): Promise<AssignmentEntry[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("assignment_log")
    .select("id, created_at, outcome, reason, contact_name, channel, dispatcher:dispatchers!assignment_log_dispatcher_id_fkey(full_name, external_ref)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AssignmentEntry[];
}

export interface CoverageStats {
  elseToday: number;
  elseWeek: number;
  assignedToday: number;
  reassignedToday: number;
  returningToday: number; // returning customers reassigned off an inactive owner (today)
}

/** reason stamped when a returning customer is pulled off an inactive owner (assign route). */
export const RETURNING_REASON = "owner_inactivo_cliente_regreso";

export async function getAppSettings(): Promise<{ schedule_tz: string }> {
  const sb = getServiceClient();
  const { data } = await sb.from("app_settings").select("schedule_tz").eq("id", true).single();
  return { schedule_tz: data?.schedule_tz ?? "America/New_York" };
}

export interface ReassignConfig {
  enabled: boolean;
  idle_minutes: number;
  max_reassigns: number;
  require_unread: boolean;
}

export async function getReassignConfig(): Promise<ReassignConfig> {
  const sb = getServiceClient();
  const { data } = await sb.from("reassign_config").select("*").eq("id", true).single();
  return {
    enabled: data?.enabled ?? true,
    idle_minutes: data?.idle_minutes ?? 5,
    max_reassigns: data?.max_reassigns ?? 5,
    require_unread: data?.require_unread ?? true,
  };
}

export async function getStopwords(): Promise<{ id: string; word: string }[]> {
  const sb = getServiceClient();
  const { data, error } = await sb.from("reassign_stopwords").select("id, word").order("word");
  if (error) throw error;
  return data ?? [];
}

export interface ReassignEntry {
  id: string;
  created_at: string;
  contact_name: string | null;
  channel: string | null;
  reason: string | null;
  to_disp: { full_name: string; external_ref: string | null } | null;
  from_disp: { full_name: string; external_ref: string | null } | null;
}

/** Recent reassignments (who lost the conversation → who got it), for the live tracker. */
export async function getRecentReassignments(limit = 20): Promise<ReassignEntry[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("assignment_log")
    .select(
      "id, created_at, contact_name, channel, reason, to_disp:dispatchers!assignment_log_dispatcher_id_fkey(full_name, external_ref), from_disp:dispatchers!assignment_log_reassigned_from_fkey(full_name, external_ref)"
    )
    .eq("outcome", "reassigned")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ReassignEntry[];
}

/** Counts of /api/assign outcomes for the dashboard coverage badge (Eastern day). */
export async function getCoverageStats(): Promise<CoverageStats> {
  const sb = getServiceClient();
  // Start of "today" in the operation's timezone, as a UTC instant.
  const nyNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const startToday = new Date(nyNow);
  startToday.setHours(0, 0, 0, 0);
  const offsetMs = nyNow.getTime() - Date.now(); // NY wall-clock vs UTC
  const todayIso = new Date(startToday.getTime() - offsetMs).toISOString();
  const weekIso = new Date(startToday.getTime() - offsetMs - 6 * 86400000).toISOString();

  const noActive = "no_active_dispatcher";
  const [elseToday, elseWeek, assignedToday, reassignedToday, returningToday] = await Promise.all([
    sb.from("assignment_log").select("*", { count: "exact", head: true }).eq("outcome", noActive).gte("created_at", todayIso),
    sb.from("assignment_log").select("*", { count: "exact", head: true }).eq("outcome", noActive).gte("created_at", weekIso),
    sb.from("assignment_log").select("*", { count: "exact", head: true }).eq("outcome", "assigned").gte("created_at", todayIso),
    sb.from("assignment_log").select("*", { count: "exact", head: true }).eq("outcome", "reassigned").gte("created_at", todayIso),
    sb.from("assignment_log").select("*", { count: "exact", head: true }).eq("outcome", "reassigned").eq("reason", RETURNING_REASON).gte("created_at", todayIso),
  ]);
  return {
    elseToday: elseToday.count ?? 0,
    elseWeek: elseWeek.count ?? 0,
    assignedToday: assignedToday.count ?? 0,
    reassignedToday: reassignedToday.count ?? 0,
    returningToday: returningToday.count ?? 0,
  };
}

export async function getActivePool(): Promise<
  (PoolActivo & { dispatcher: Pick<Dispatcher, "id" | "full_name" | "external_ref"> | null })[]
> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("pool_activo")
    .select("*, dispatcher:dispatchers(id, full_name, external_ref)")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
