"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateButton({ defaultWeek }: { defaultWeek: string }) {
  const router = useRouter();
  const [week, setWeek] = useState(defaultWeek);
  const [daysOff, setDaysOff] = useState(2);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: week, days_off: daysOff }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Error");
      setMsg(`✅ ${d.shifts} turnos · ${d.coveragePct}% cobertura`);
      router.refresh();
    } catch (e: any) {
      setMsg("❌ " + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Semana (lunes)</label>
        <input type="date" value={week} onChange={(e) => setWeek(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Días libres</label>
        <select value={daysOff} onChange={(e) => setDaysOff(Number(e.target.value))} className="rounded border border-slate-300 px-3 py-2 text-sm">
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
      </div>
      <button onClick={run} disabled={loading} className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
        {loading ? "Generando…" : "Generar horario"}
      </button>
      {msg && <span className="text-sm text-slate-700">{msg}</span>}
    </div>
  );
}
