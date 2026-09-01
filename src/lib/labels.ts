export const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800",
  aprobado: "bg-green-100 text-green-800",
  rechazado: "bg-red-100 text-red-800",
  cancelado: "bg-slate-100 text-slate-600",
};

// Role siglas → meaning. MC1..MC6 handled by prefix in the UI.
export const SIGLA_LABEL: Record<string, string> = {
  A: "Asignación",
  A1: "Encargado de agenda",
  A2: "Encargado de copias",
  M: "Mesa",
  NE: "Mensajería (round-robin)",
  MR: "Ring central",
};

/** Tailwind classes for a sigla cell. */
export function siglaClass(sigla: string, inRoundRobin: boolean, section: string): string {
  if (inRoundRobin) return "bg-emerald-500 text-white"; // NE / MC1-6 messaging
  if (sigla === "MR") return "bg-amber-400 text-amber-950"; // ring central
  if (section === "phone") {
    if (sigla === "A") return "bg-sky-500 text-white";
    if (sigla === "A1") return "bg-indigo-500 text-white";
    if (sigla === "A2") return "bg-cyan-600 text-white";
  }
  return "bg-slate-300 text-slate-700";
}

export const TIPO_LABEL: Record<string, string> = {
  vacaciones: "Vacaciones",
  permiso: "Permiso",
  enfermedad: "Enfermedad",
  personal: "Personal",
  otro: "Otro",
};
