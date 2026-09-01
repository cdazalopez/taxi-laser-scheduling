"use client";

import { useState } from "react";

interface Candidate {
  dispatcher: { id: string; full_name: string; role: string | null };
  score: number;
  available_now: boolean;
  current_status: string | null;
  reasons: string[];
}

export function AiAssistButton({ shiftId }: { shiftId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shift_id: shiftId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setCandidates(data.candidates ?? []);
      setRecommendation(data.recommendation ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={run}
        className="mt-1 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-700"
        title="Sugerir reemplazo"
      >
        AI reemplazo
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Sugerencias de reemplazo</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            {loading && <p className="mt-4 text-sm text-slate-500">Calculando candidatos…</p>}
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            {recommendation && (
              <div className="mt-4 rounded border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
                <span className="font-semibold">Recomendación AI: </span>
                {recommendation}
              </div>
            )}

            {!loading && !error && (
              <ul className="mt-4 space-y-2">
                {candidates.length === 0 && (
                  <li className="text-sm text-slate-500">No hay candidatos disponibles.</li>
                )}
                {candidates.map((c, i) => (
                  <li key={c.dispatcher.id} className="rounded border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {i + 1}. {c.dispatcher.full_name}
                      </span>
                      <span className="flex items-center gap-2 text-xs">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5">score {c.score}</span>
                        {c.available_now ? (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">
                            disponible
                          </span>
                        ) : (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                            offline
                          </span>
                        )}
                      </span>
                    </div>
                    <ul className="mt-1 list-disc pl-5 text-xs text-slate-500">
                      {c.reasons.map((r, j) => (
                        <li key={j}>{r}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
