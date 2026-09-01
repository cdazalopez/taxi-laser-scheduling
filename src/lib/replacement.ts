import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import type { Shift, Dispatcher } from "@/lib/types";

export interface Candidate {
  dispatcher: Pick<Dispatcher, "id" | "full_name" | "skills" | "role">;
  score: number;
  available_now: boolean;
  current_status: string | null;
  reasons: string[];
}

/**
 * Rank replacement candidates for a shift that needs coverage.
 * Rules:
 *  - dispatcher must be status = 'activo' and not the one being replaced
 *  - excluded if an APPROVED permiso overlaps the shift date
 *  - excluded if they already have a shift that overlaps the same day/time
 *  - +score for being active in the live pool (pool_activo)
 *  - +score for matching skills the original shift/position implies
 */
export async function rankReplacements(shiftId: string): Promise<{
  shift: Shift & { dispatcher: Pick<Dispatcher, "id" | "full_name"> | null };
  candidates: Candidate[];
}> {
  const sb = getServiceClient();

  const { data: shift, error: shiftErr } = await sb
    .from("schedule")
    .select("*, dispatcher:dispatchers(id, full_name)")
    .eq("id", shiftId)
    .single();
  if (shiftErr || !shift) throw shiftErr ?? new Error("shift not found");

  const [{ data: dispatchers }, { data: pool }, { data: permisos }, { data: sameDay }] =
    await Promise.all([
      sb.from("dispatchers").select("id, full_name, skills, role, status").eq("status", "activo"),
      sb.from("pool_activo").select("dispatcher_id, is_active, current_status"),
      sb
        .from("permisos")
        .select("dispatcher_id")
        .eq("estado", "aprobado")
        .lte("start_date", shift.shift_date)
        .gte("end_date", shift.shift_date),
      sb.from("schedule").select("dispatcher_id, shift_start, shift_end").eq("shift_date", shift.shift_date),
    ]);

  const onLeave = new Set((permisos ?? []).map((p) => p.dispatcher_id));
  const poolById = new Map((pool ?? []).map((p) => [p.dispatcher_id, p]));

  // dispatchers already booked at an overlapping time that day
  const busy = new Set(
    (sameDay ?? [])
      .filter((s) => timesOverlap(s.shift_start, s.shift_end, shift.shift_start, shift.shift_end))
      .map((s) => s.dispatcher_id)
  );

  const neededSkills = new Set<string>(shift.position ? [shift.position.toLowerCase()] : []);

  const candidates: Candidate[] = [];
  for (const d of dispatchers ?? []) {
    if (d.id === shift.dispatcher_id) continue;
    if (onLeave.has(d.id)) continue;
    if (busy.has(d.id)) continue;

    const reasons: string[] = [];
    let score = 1;
    const p = poolById.get(d.id);
    const availableNow = !!p?.is_active;
    if (availableNow) {
      score += 3;
      reasons.push("Disponible ahora en el pool activo");
    }
    const skills = ((d.skills ?? []) as string[]).map((s) => s.toLowerCase());
    const matched = [...neededSkills].filter((s) => skills.includes(s));
    if (matched.length) {
      score += matched.length * 2;
      reasons.push(`Skills coinciden: ${matched.join(", ")}`);
    }
    if (d.role === "supervisor" || d.role === "lead") {
      score += 0.5;
      reasons.push(`Rol senior (${d.role})`);
    }
    if (reasons.length === 0) reasons.push("Elegible (sin conflictos)");

    candidates.push({
      dispatcher: { id: d.id, full_name: d.full_name, skills: d.skills, role: d.role },
      score,
      available_now: availableNow,
      current_status: p?.current_status ?? null,
      reasons,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return { shift, candidates };
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}
