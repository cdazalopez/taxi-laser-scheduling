"use client";

import { useState } from "react";
import Link from "next/link";

export function ApproveButton({ runId, weekLabel }: { runId: string; weekLabel: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Error");
      setDone(d);
      setConfirming(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
        ✅ Horario aprobado: <b>{done.shifts}</b> turnos y <b>{done.roleRows}</b> asignaciones de rol
        escritas para {done.dates?.length} días. Ya aparece en{" "}
        <Link href="/" className="font-medium underline">Schedule (Semana / Día / Roles)</Link> y el pool
        se actualizó.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
      {!confirming ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-indigo-900">Aprobar horario ({weekLabel})</h2>
            <p className="text-xs text-slate-600">
              Escribe esta grilla en el schedule real (Semana / Día / Roles) y activa el round-robin.
            </p>
          </div>
          <button onClick={() => setConfirming(true)} className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Aprobar horario
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-800">
            ⚠️ Esto <b>reemplaza</b> el horario existente de esos días. ¿Confirmás?
          </p>
          <div className="flex gap-2">
            <button onClick={approve} disabled={loading} className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              {loading ? "Aprobando…" : "Sí, aprobar"}
            </button>
            <button onClick={() => setConfirming(false)} disabled={loading} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">❌ {error}</p>}
    </div>
  );
}
