"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearLiveTab } from "@/app/actions";

/** "Limpiar tab" — wipes the live assignment log + open-conversation tracking, resetting
 *  the En vivo counters and feed to 0. Two-step confirm since it deletes history. */
export function ClearLiveButton() {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function doClear() {
    setErr(null);
    start(async () => {
      const r = await clearLiveTab();
      if (!r.ok) {
        setErr(r.error ?? "Error");
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
      >
        Limpiar tab
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-600">¿Borrar el historial y dejar en 0?</span>
      <button
        onClick={doClear}
        disabled={pending}
        className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {pending ? "Limpiando…" : "Sí, limpiar"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
      >
        Cancelar
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
