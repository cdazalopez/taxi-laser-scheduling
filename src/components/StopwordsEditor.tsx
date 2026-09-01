"use client";

import { useState, useTransition } from "react";
import { addStopword, removeStopword } from "@/app/actions";

export function StopwordsEditor({ words }: { words: { id: string; word: string }[] }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <h2 className="font-semibold">Palabras de cierre ({words.length})</h2>
        <span className="text-xs text-slate-400">{open ? "ocultar ▲" : "mostrar ▼"}</span>
      </button>
      <p className="mt-1 text-xs text-slate-500">
        Si el último mensaje del cliente contiene alguna de estas palabras, la conversación se considera
        cerrada y <b>deja de reasignarse</b>.
      </p>
      {open && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const w = text;
              if (!w.trim()) return;
              start(async () => {
                await addStopword(w);
                setText("");
              });
            }}
            className="mt-3 flex gap-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ej: servicio completado"
              className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button type="submit" disabled={pending} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              Agregar
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {words.map((w) => (
              <span key={w.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                {w.word}
                <button onClick={() => start(() => void removeStopword(w.id))} disabled={pending} className="text-slate-400 hover:text-red-600" title="Quitar">✕</button>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
