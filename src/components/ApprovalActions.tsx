"use client";

import { useTransition } from "react";
import { decidePermiso } from "@/app/actions";

export function ApprovalActions({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  function decide(decision: "aprobado" | "rechazado") {
    startTransition(async () => {
      await decidePermiso(id, decision);
    });
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => decide("aprobado")}
        disabled={pending}
        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        Aprobar
      </button>
      <button
        onClick={() => decide("rechazado")}
        disabled={pending}
        className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        Rechazar
      </button>
    </div>
  );
}
