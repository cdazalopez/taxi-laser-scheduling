"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ScheduleUploader() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-schedule", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Error");
      setResult(d);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-semibold">Subir horario (Excel)</h2>
      <p className="mt-1 text-xs text-slate-500">
        Subí el .xlsx del horario. Reemplaza los días que contenga el archivo y refresca el pool al
        instante. (Las horas se interpretan en la zona configurada arriba.)
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          onClick={upload}
          disabled={!file || loading}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Procesando…" : "Subir y cargar"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">❌ {error}</p>}
      {result && (
        <div className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          ✅ Cargado: <b>{result.rows}</b> asignaciones ({result.roundRobin} round-robin) y{" "}
          <b>{result.shifts}</b> turnos (Semana/Día) para <b>{result.dates?.length}</b> días (
          {result.dates?.[0]} → {result.dates?.[result.dates.length - 1]}).
          {result.unmatched?.length > 0 && (
            <div className="mt-1 text-xs text-amber-700">
              Códigos sin match (no cargados): {result.unmatched.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
