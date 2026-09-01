"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/app/actions";
import { dispatcherNumber } from "@/lib/dates";
import type { DispatcherProfile } from "@/lib/queries";

const DOW = [
  { v: 1, l: "L" },
  { v: 2, l: "M" },
  { v: 3, l: "X" },
  { v: 4, l: "J" },
  { v: 5, l: "V" },
  { v: 6, l: "S" },
  { v: 0, l: "D" },
];

export function ProfileRow({ p }: { p: DispatcherProfile }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const days = new Set(p.work_days ?? []);

  return (
    <>
      <tr className="border-b border-slate-100">
        <td className="px-3 py-2">
          <span className="mr-1.5 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {dispatcherNumber(p.external_ref)}
          </span>
          {p.full_name}
        </td>
        <td className="px-3 py-2">
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              p.employment === "full_time" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
            }`}
          >
            {p.employment === "full_time" ? "Full-time" : p.employment === "part_time" ? "Part-time" : "—"}
          </span>
        </td>
        <td className="px-3 py-2 text-right text-slate-600">
          {p.min_hours_week ?? "—"}–{p.max_hours_week ?? "—"}h
          <span className="ml-1 text-[10px] text-slate-400">(~{p.avg_hours_week ?? "?"})</span>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-slate-600">
          {DOW.filter((d) => days.has(d.v)).map((d) => d.l).join("") || "—"}
        </td>
        <td className="px-3 py-2 text-xs text-slate-600">
          {p.typical_start ? `${p.typical_start.slice(0, 5)}–${p.typical_end?.slice(0, 5)}` : "—"}
        </td>
        <td className="px-3 py-2 text-center">{p.can_message ? "✅" : "—"}</td>
        <td className="px-3 py-2 text-right">
          {p.edited && <span className="mr-2 text-[10px] text-green-600">editado</span>}
          <button onClick={() => setOpen(true)} className="text-xs font-medium text-indigo-600 hover:underline">
            Editar
          </button>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={7} className="bg-slate-50 px-3 py-3">
            <form
              action={(fd) => {
                setError(null);
                start(async () => {
                  const res = await updateProfile(p.dispatcher_id, fd);
                  if (res.ok) setOpen(false);
                  else setError(res.error!);
                });
              }}
              className="flex flex-wrap items-end gap-4"
            >
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Contrato</label>
                <select name="employment" defaultValue={p.employment ?? "full_time"} className="rounded border border-slate-300 px-2 py-1 text-sm">
                  <option value="full_time">Full-time</option>
                  <option value="part_time">Part-time</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Horas mín/máx</label>
                <div className="flex items-center gap-1">
                  <input name="min_hours_week" type="number" defaultValue={p.min_hours_week ?? ""} className="w-16 rounded border border-slate-300 px-2 py-1 text-sm" />
                  <span className="text-slate-400">–</span>
                  <input name="max_hours_week" type="number" defaultValue={p.max_hours_week ?? ""} className="w-16 rounded border border-slate-300 px-2 py-1 text-sm" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Días disponibles</label>
                <div className="flex gap-1">
                  {DOW.map((d) => (
                    <label key={d.v} className="flex cursor-pointer flex-col items-center">
                      <span className="text-[9px] text-slate-500">{d.l}</span>
                      <input type="checkbox" name="work_days" value={d.v} defaultChecked={days.has(d.v)} />
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Ventana horaria</label>
                <div className="flex items-center gap-1">
                  <input name="typical_start" type="time" defaultValue={p.typical_start?.slice(0, 5) ?? ""} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                  <span className="text-slate-400">–</span>
                  <input name="typical_end" type="time" defaultValue={p.typical_end?.slice(0, 5) ?? ""} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="can_message" defaultChecked={p.can_message} />
                Mensajería
              </label>
              <button type="submit" disabled={pending} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {pending ? "Guardando…" : "Guardar"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">
                Cancelar
              </button>
              {error && <span className="text-sm text-red-600">{error}</span>}
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
