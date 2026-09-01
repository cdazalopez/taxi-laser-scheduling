import "server-only";
import { getServiceClient } from "@/lib/supabase/server";

export interface ApproveResult {
  dates: string[];
  roleRows: number;
  shifts: number;
}

/**
 * Approve a generated run: write generated_roles → role_schedule (per-hour siglas,
 * drives the pool/round-robin) and derive contiguous shift blocks → schedule (drives
 * Semana/Día views). Replaces only the dates in the run.
 */
export async function approveRun(runId: string): Promise<ApproveResult> {
  const sb = getServiceClient();
  // Fetch ALL rows (Supabase caps a single request at ~1000 → paginate).
  const gen: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("generated_roles")
      .select("dispatcher_id, work_date, hour, sigla, in_round_robin")
      .eq("run_id", runId)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    gen.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  if (gen.length === 0) throw new Error("La corrida no tiene datos");

  const dates = [...new Set(gen.map((r) => r.work_date))].sort();

  // 1) role_schedule: one row per generated cell (working hour)
  const roleRows = gen.map((r) => {
    const sigla = r.sigla ?? "A"; // working, no explicit role → base phone role
    return {
      dispatcher_id: r.dispatcher_id,
      work_date: r.work_date,
      hour: r.hour,
      section: sigla === "NE" || sigla === "MR" ? "messaging" : "phone",
      sigla,
      in_round_robin: sigla === "NE", // only NE drives the round-robin pool
    };
  });
  await sb.from("role_schedule").delete().in("work_date", dates);
  for (let i = 0; i < roleRows.length; i += 500) {
    const { error: e } = await sb.from("role_schedule").insert(roleRows.slice(i, i + 500));
    if (e) throw e;
  }

  // 2) schedule: derive contiguous working-hour blocks per (dispatcher, date)
  const byDD = new Map<string, number[]>();
  for (const r of gen) {
    const k = `${r.dispatcher_id}|${r.work_date}`;
    if (!byDD.has(k)) byDD.set(k, []);
    byDD.get(k)!.push(r.hour);
  }
  const shifts: any[] = [];
  for (const [k, hoursRaw] of byDD) {
    const [dispatcher_id, shift_date] = k.split("|");
    const hours = [...new Set(hoursRaw)].sort((a, b) => a - b);
    let runStart = hours[0], prev = hours[0];
    const push = (s: number, endExcl: number) =>
      shifts.push({
        dispatcher_id,
        shift_date,
        shift_start: `${String(s).padStart(2, "0")}:00`,
        shift_end: endExcl >= 24 ? "23:59" : `${String(endExcl).padStart(2, "0")}:00`,
        status: "programado",
      });
    for (let i = 1; i < hours.length; i++) {
      if (hours[i] === prev + 1) { prev = hours[i]; continue; }
      push(runStart, prev + 1);
      runStart = hours[i]; prev = hours[i];
    }
    push(runStart, prev + 1);
  }
  await sb.from("schedule").delete().in("shift_date", dates);
  for (let i = 0; i < shifts.length; i += 500) {
    const { error: e } = await sb.from("schedule").insert(shifts.slice(i, i + 500));
    if (e) throw e;
  }

  await sb.from("schedule_runs").update({ status: "applied" }).eq("id", runId);
  await sb.rpc("refresh_pool_activo");

  return { dates, roleRows: roleRows.length, shifts: shifts.length };
}
