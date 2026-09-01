"use client";

import { useState } from "react";

export function InsightsAI({
  dow,
  target,
  compareDate,
}: {
  dow: number;
  target: number;
  compareDate?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setAnalysis(null);
    setNote(null);
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dow, target, compareDate }),
      });
      const data = await res.json();
      if (data.analysis) setAnalysis(data.analysis);
      else if (data.reason === "ai_disabled")
        setNote("La narrativa AI requiere configurar ANTHROPIC_API_KEY. La tabla de recomendación de arriba ya es utilizable.");
      else if (data.reason === "no_history") setNote("No hay histórico para este día.");
      else setNote("No se pudo generar el análisis AI.");
    } catch {
      setNote("Error de red.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-indigo-900">Análisis AI</h2>
        <button
          onClick={run}
          disabled={loading}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Analizando…" : "Generar análisis"}
        </button>
      </div>
      {note && <p className="mt-3 text-sm text-slate-600">{note}</p>}
      {analysis && (
        <div className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{analysis}</div>
      )}
    </div>
  );
}
