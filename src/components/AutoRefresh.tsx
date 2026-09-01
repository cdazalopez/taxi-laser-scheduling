"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Periodically re-runs the server component so the page shows live data. */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      router.refresh();
      setTick((t) => t + 1);
    }, intervalMs);
    return () => clearInterval(id);
  }, [on, intervalMs, router]);

  return (
    <button
      onClick={() => setOn((v) => !v)}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        on ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
      }`}
      title="Actualización automática"
    >
      <span className={`h-2 w-2 rounded-full ${on ? "animate-pulse bg-green-500" : "bg-slate-400"}`} />
      {on ? "En vivo" : "Pausado"}
    </button>
  );
}
