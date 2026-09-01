"use client";

import { useTransition } from "react";
import { setDispatcherOffline } from "@/app/actions";
import { dispatcherNumber } from "@/lib/dates";

interface OnlineItem {
  dispatcher_id: string;
  full_name: string;
  external_ref: string | null;
}
interface OfflineItem {
  id: string;
  full_name: string;
  external_ref: string | null;
}

export function PoolPanel({ online, offline }: { online: OnlineItem[]; offline: OfflineItem[] }) {
  const [pending, start] = useTransition();

  const toggle = (id: string, off: boolean) => start(() => void setDispatcherOffline(id, off));

  return (
    <div>
      <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
        {online.length === 0 && (
          <li className="text-xs text-slate-500">Sin dispatchers en línea ahora.</li>
        )}
        {online.map((p) => (
          <li key={p.dispatcher_id} className="group flex items-center justify-between text-xs">
            <span>
              <span className="mr-1 font-mono text-slate-400">
                {dispatcherNumber(p.external_ref)}
              </span>
              {p.full_name}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <button
                onClick={() => toggle(p.dispatcher_id, true)}
                disabled={pending}
                title="Marcar offline (sacar de rotación)"
                className="rounded px-1 text-slate-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      {offline.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Offline manual ({offline.length})
          </p>
          <ul className="space-y-1">
            {offline.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  <span className="mr-1 font-mono text-slate-300">{dispatcherNumber(d.external_ref)}</span>
                  {d.full_name}
                </span>
                <button
                  onClick={() => toggle(d.id, false)}
                  disabled={pending}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-green-100 hover:text-green-700 disabled:opacity-40"
                >
                  Reactivar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
