"use client";

import { useState, useTransition } from "react";
import { updateReassignConfig } from "@/app/actions";
import type { ReassignConfig } from "@/lib/queries";

export function ReassignConfigEditor({ config }: { config: ReassignConfig }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className={`rounded-lg border p-4 ${config.enabled ? "border-slate-200 bg-white" : "border-amber-300 bg-amber-50"}`}>
      <h2 className="font-semibold">Reglas de reasignación</h2>
      <form
        action={(fd) => {
          setMsg(null);
          start(async () => {
            const r = await updateReassignConfig(fd);
            setMsg(r.ok ? "Guardado ✓" : "Error: " + r.error);
          });
        }}
        className="mt-3 flex flex-wrap items-end gap-4"
      >
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={config.enabled} />
          Activada
        </label>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-slate-500">Esperar antes de reasignar (min)</label>
          <input type="number" name="idle_minutes" min={1} defaultValue={config.idle_minutes} className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-slate-500">Máx. reasignaciones</label>
          <input type="number" name="max_reassigns" min={1} defaultValue={config.max_reassigns} className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="require_unread" defaultChecked={config.require_unread} />
          Solo si no la leyó
        </label>
        <button type="submit" disabled={pending} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </form>
      <p className="mt-2 text-xs text-slate-500">
        Una conversación se reasigna solo si pasan <b>{config.idle_minutes} min</b> sin respuesta
        {config.require_unread ? " y el dispatcher no la leyó" : ""}. Tras {config.max_reassigns} intentos se
        taggea <code>sin_respuesta</code>.
      </p>
    </div>
  );
}
