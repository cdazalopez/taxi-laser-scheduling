"use client";

import { useState, useTransition } from "react";
import { updateAppSettings } from "@/app/actions";

const ZONES = [
  { v: "America/Chicago", l: "Central (CST/CDT)" },
  { v: "America/New_York", l: "Eastern / Atlanta (EST/EDT)" },
  { v: "America/Denver", l: "Mountain (MST/MDT)" },
  { v: "America/Los_Angeles", l: "Pacific (PST/PDT)" },
];

export function AppSettingsEditor({ scheduleTz }: { scheduleTz: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-semibold">Zona horaria del horario</h2>
      <p className="mt-1 text-xs text-slate-500">
        Zona en la que están cargadas las horas del Excel de horarios. El pool y las asignaciones se
        calculan con esta zona.
      </p>
      <form
        action={(fd) => {
          setMsg(null);
          start(async () => {
            const r = await updateAppSettings(fd);
            setMsg(r.ok ? "Guardado — pool recalculado ✓" : "Error: " + r.error);
          });
        }}
        className="mt-3 flex flex-wrap items-end gap-3"
      >
        <select name="schedule_tz" defaultValue={scheduleTz} className="rounded border border-slate-300 px-3 py-2 text-sm">
          {ZONES.map((z) => (
            <option key={z.v} value={z.v}>
              {z.l}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </form>
    </div>
  );
}
