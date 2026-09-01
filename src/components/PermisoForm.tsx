"use client";

import { useState, useTransition } from "react";
import { createPermiso } from "@/app/actions";

interface Option {
  id: string;
  full_name: string;
}

export function PermisoForm({ dispatchers }: { dispatchers: Option[] }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      action={(fd) => {
        setMsg(null);
        startTransition(async () => {
          const res = await createPermiso(fd);
          setMsg(res.ok ? { ok: true, text: "Solicitud enviada" } : { ok: false, text: res.error! });
          if (res.ok) (document.getElementById("permiso-form") as HTMLFormElement)?.reset();
        });
      }}
      id="permiso-form"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
    >
      <div>
        <label className="mb-1 block text-sm font-medium">Dispatcher</label>
        <select name="dispatcher_id" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="">Selecciona…</option>
          {dispatchers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Tipo</label>
        <select name="tipo" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
          <option value="vacaciones">Vacaciones</option>
          <option value="permiso">Permiso</option>
          <option value="enfermedad">Enfermedad</option>
          <option value="personal">Personal</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Desde</label>
          <input type="date" name="start_date" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Hasta</label>
          <input type="date" name="end_date" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Motivo (opcional)</label>
        <textarea name="reason" rows={2} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Enviando…" : "Solicitar"}
      </button>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>
      )}
    </form>
  );
}
