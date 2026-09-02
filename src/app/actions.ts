"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getServiceClient } from "@/lib/supabase/server";
import type { PermisoTipo, ShiftEstado } from "@/lib/types";

async function requireAuth(): Promise<{ ok: false; error: string } | null> {
  const token = process.env.APP_SESSION_TOKEN;
  const cookieStore = await cookies();
  const cookie = cookieStore.get("tl_auth")?.value;
  if (!token || cookie !== token) return { ok: false, error: "Unauthorized" };
  return null;
}

/** Set a cell in the generated role grid: 'off' (remove), 'work' (on shift, no role), or a sigla (A/A1/A2/MR/NE). */
export async function setRoleCell(
  runId: string,
  dispatcherId: string,
  workDate: string,
  hour: number,
  state: "off" | "work" | "A" | "A1" | "A2" | "MR" | "NE"
) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  if (state === "off") {
    const { error } = await sb.from("generated_roles").delete().match({ run_id: runId, dispatcher_id: dispatcherId, work_date: workDate, hour });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await sb.from("generated_roles").upsert(
      { run_id: runId, dispatcher_id: dispatcherId, work_date: workDate, hour, sigla: state === "work" ? null : state, in_round_robin: state === "NE" },
      { onConflict: "run_id,dispatcher_id,work_date,hour" }
    );
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/generar");
  return { ok: true };
}

export async function updateGeneratedShift(
  id: string,
  dispatcherId: string,
  startHour: number,
  endHour: number
) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  if (endHour <= startHour || startHour < 0 || endHour > 24) {
    return { ok: false, error: "Rango horario inválido" };
  }
  const { error } = await sb
    .from("generated_shifts")
    .update({ dispatcher_id: dispatcherId, start_hour: startHour, end_hour: endHour })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/generar");
  return { ok: true };
}

export async function deleteGeneratedShift(id: string) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const { error } = await sb.from("generated_shifts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/generar");
  return { ok: true };
}

export async function addGeneratedShift(
  runId: string,
  dispatcherId: string,
  workDate: string,
  startHour: number,
  endHour: number,
  roleHint: string
) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const { error } = await sb.from("generated_shifts").insert({
    run_id: runId,
    dispatcher_id: dispatcherId,
    work_date: workDate,
    start_hour: startHour,
    end_hour: endHour,
    role_hint: roleHint,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/generar");
  return { ok: true };
}

export async function updateProfile(dispatcherId: string, formData: FormData) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const num = (k: string) => {
    const v = formData.get(k);
    return v === null || v === "" ? null : Number(v);
  };
  const workDays = formData
    .getAll("work_days")
    .map((d) => Number(d))
    .filter((n) => !Number.isNaN(n));

  const { error } = await sb.from("dispatcher_profiles").upsert(
    {
      dispatcher_id: dispatcherId,
      employment: String(formData.get("employment") || "full_time"),
      max_hours_week: num("max_hours_week"),
      min_hours_week: num("min_hours_week"),
      work_days: workDays,
      typical_start: String(formData.get("typical_start") || "") || null,
      typical_end: String(formData.get("typical_end") || "") || null,
      can_message: formData.get("can_message") === "on",
      edited: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dispatcher_id" }
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/perfiles");
  return { ok: true };
}

/** Clear the live "En vivo" tab: wipe the assignment log + open-conversation tracking so the
 *  counters and feed reset to 0 for a clean start. */
export async function clearLiveTab() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const e1 = await sb.from("assignment_log").delete().not("id", "is", null);
  if (e1.error) return { ok: false, error: e1.error.message };
  const e2 = await sb.from("active_assignments").delete().not("contact_id", "is", null);
  if (e2.error) return { ok: false, error: e2.error.message };
  revalidatePath("/asignaciones");
  return { ok: true };
}

export async function updateAppSettings(formData: FormData) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const tz = String(formData.get("schedule_tz") || "America/New_York");
  const { error } = await sb
    .from("app_settings")
    .update({ schedule_tz: tz, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  await sb.rpc("refresh_pool_activo"); // apply the new tz to the pool immediately
  revalidatePath("/configuracion");
  revalidatePath("/");
  return { ok: true };
}

export async function updateReassignConfig(formData: FormData) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const { error } = await sb.from("reassign_config").update({
    enabled: formData.get("enabled") === "on",
    idle_minutes: Math.max(1, Number(formData.get("idle_minutes") || 5)),
    max_reassigns: Math.max(1, Number(formData.get("max_reassigns") || 5)),
    require_unread: formData.get("require_unread") === "on",
    updated_at: new Date().toISOString(),
  }).eq("id", true);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/asignaciones");
  return { ok: true };
}

export async function addStopword(word: string) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const w = word.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!w) return { ok: false, error: "Palabra vacía" };
  const { error } = await sb.from("reassign_stopwords").upsert({ word: w }, { onConflict: "word" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/asignaciones");
  return { ok: true };
}

export async function removeStopword(id: string) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const { error } = await sb.from("reassign_stopwords").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/asignaciones");
  return { ok: true };
}

/** Manually pull a dispatcher out of the live pool (offline) or put them back (null). */
export async function setDispatcherOffline(id: string, offline: boolean) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const { error } = await sb
    .from("dispatchers")
    .update({ available_override: offline ? "offline" : null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await sb.rpc("refresh_pool_activo"); // reflect immediately
  revalidatePath("/");
  revalidatePath("/asignaciones");
  return { ok: true };
}

export async function createShift(formData: FormData) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const dispatcher_id = String(formData.get("dispatcher_id") || "");
  const shift_date = String(formData.get("shift_date") || "");
  const shift_start = String(formData.get("shift_start") || "");
  const shift_end = String(formData.get("shift_end") || "");
  const position = String(formData.get("position") || "") || null;
  const status = (String(formData.get("status") || "programado") as ShiftEstado) || "programado";

  if (!dispatcher_id || !shift_date || !shift_start || !shift_end) {
    return { ok: false, error: "Faltan campos obligatorios" };
  }
  if (shift_end <= shift_start) {
    return { ok: false, error: "La hora de fin debe ser posterior a la de inicio" };
  }

  const { error } = await sb
    .from("schedule")
    .insert({ dispatcher_id, shift_date, shift_start, shift_end, position, status });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe un turno para ese dispatcher a esa hora" };
    return { ok: false, error: error.message };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function updateShift(id: string, formData: FormData) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const shift_date = String(formData.get("shift_date") || "");
  const shift_start = String(formData.get("shift_start") || "");
  const shift_end = String(formData.get("shift_end") || "");
  const position = String(formData.get("position") || "") || null;
  const status = String(formData.get("status") || "programado") as ShiftEstado;

  if (!shift_date || !shift_start || !shift_end) {
    return { ok: false, error: "Faltan campos obligatorios" };
  }
  if (shift_end <= shift_start) {
    return { ok: false, error: "La hora de fin debe ser posterior a la de inicio" };
  }

  const { error } = await sb
    .from("schedule")
    .update({ shift_date, shift_start, shift_end, position, status })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true };
}

export async function deleteShift(id: string) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const { error } = await sb.from("schedule").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true };
}

export async function createPermiso(formData: FormData) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const dispatcher_id = String(formData.get("dispatcher_id") || "");
  const tipo = String(formData.get("tipo") || "permiso") as PermisoTipo;
  const start_date = String(formData.get("start_date") || "");
  const end_date = String(formData.get("end_date") || "");
  const reason = String(formData.get("reason") || "") || null;

  if (!dispatcher_id || !start_date || !end_date) {
    return { ok: false, error: "Faltan campos obligatorios" };
  }
  if (end_date < start_date) {
    return { ok: false, error: "La fecha final no puede ser anterior a la inicial" };
  }

  const { error } = await sb
    .from("permisos")
    .insert({ dispatcher_id, tipo, start_date, end_date, reason, estado: "pendiente" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/permisos");
  revalidatePath("/aprobaciones");
  return { ok: true };
}

export async function decidePermiso(
  id: string,
  decision: "aprobado" | "rechazado",
  approvedBy?: string
) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const sb = getServiceClient();
  const { error } = await sb
    .from("permisos")
    .update({
      estado: decision,
      approved_by: approvedBy ?? null,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/aprobaciones");
  revalidatePath("/permisos");
  revalidatePath("/");
  return { ok: true };
}
