"use client";

import { useState } from "react";
import { setRoleCell } from "@/app/actions";
import { hourLabel, dispatcherNumber } from "@/lib/dates";
import type { RoleEditorData } from "@/lib/queries";

type Sigla = "work" | "A" | "A1" | "A2" | "MR" | "NE";

// role-aware click sequence: messaging dispatchers cycle messaging roles, phone cycle phone roles
const MSG_SEQ: (Sigla | undefined)[] = [undefined, "work", "NE", "MR"];
const PHONE_SEQ: (Sigla | undefined)[] = [undefined, "A", "A1", "A2"];

const SIGLA_STYLE: Record<Sigla, string> = {
  work: "bg-slate-200 text-slate-500",
  A: "bg-sky-200 text-sky-900",
  A1: "bg-indigo-500 text-white",
  A2: "bg-violet-500 text-white",
  MR: "bg-teal-500 text-white",
  NE: "bg-emerald-500 text-white",
};

export function RoleGridEditor({ data }: { data: RoleEditorData }) {
  const { runId, editDay, targets } = data;
  const [grid, setGrid] = useState(() =>
    data.gridDispatchers.map((d) => ({ ...d, cells: { ...d.cells } as Record<number, Sigla> }))
  );
  const [dragId, setDragId] = useState<string | null>(null);

  const inGrid = new Set(grid.map((d) => d.dispatcher_id));

  function persist(dispId: string, hour: number, state: "off" | Sigla) {
    if (runId) void setRoleCell(runId, dispId, editDay, hour, state);
  }

  function cycle(dispId: string, hour: number) {
    setGrid((prev) =>
      prev.map((d) => {
        if (d.dispatcher_id !== dispId) return d;
        const seq = d.can_message ? MSG_SEQ : PHONE_SEQ;
        const cur = d.cells[hour];
        const idx = seq.indexOf(cur ?? undefined);
        const next = seq[(idx + 1) % seq.length];
        const cells = { ...d.cells };
        if (next) cells[hour] = next;
        else delete cells[hour];
        persist(dispId, hour, next ?? "off");
        return { ...d, cells };
      })
    );
  }

  function addFromPalette(dispId: string, hour: number) {
    const p = data.palette.find((x) => x.id === dispId);
    if (!p) return;
    const base: Sigla = p.can_message ? "work" : "A";
    setGrid((prev) => {
      if (prev.some((d) => d.dispatcher_id === dispId)) {
        return prev.map((d) => (d.dispatcher_id === dispId ? { ...d, cells: { ...d.cells, [hour]: base } } : d));
      }
      return [...prev, { dispatcher_id: p.id, full_name: p.full_name, external_ref: p.external_ref, can_message: p.can_message, cells: { [hour]: base } }]
        .sort((a, b) => (Number(a.external_ref?.replace(/\D/g, "")) || 9999) - (Number(b.external_ref?.replace(/\D/g, "")) || 9999));
    });
    persist(dispId, hour, base);
  }

  const covered = (h: number) => grid.filter((d) => d.cells[h] === "NE").length;

  return (
    <div className="flex gap-3">
      {/* grid */}
      <div className="min-w-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white" style={{ maxHeight: 620 }}>
        <table className="border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200">
              <th className="sticky left-0 z-10 w-[150px] border-r border-slate-300 bg-slate-50 px-2 py-1 text-left font-semibold">Dispatcher</th>
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="w-8 border-r border-slate-100 px-0 py-1 text-center font-normal text-slate-500">{hourLabel(h)}</th>
              ))}
            </tr>
            <tr className="border-b border-slate-300 bg-white">
              <th className="sticky left-0 z-10 w-[150px] border-r border-slate-300 bg-white px-2 py-0.5 text-left text-[10px] font-semibold text-slate-600">Cobertura msg</th>
              {Array.from({ length: 24 }, (_, h) => {
                const t = targets[h], c = covered(h);
                const cls = t === 0 ? "text-slate-300" : c >= t ? "bg-emerald-500 text-white" : c > 0 ? "bg-amber-300 text-amber-950" : "bg-red-500 text-white";
                return <th key={h} className={`w-8 border-r border-slate-100 text-center text-[9px] ${cls}`}>{t ? `${c}/${t}` : "·"}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {grid.map((d) => (
              <tr key={d.dispatcher_id} className="border-b border-slate-50">
                <td className="sticky left-0 z-10 w-[150px] border-r border-slate-200 bg-white px-2 py-0.5 whitespace-nowrap">
                  <span className="mr-1 font-mono text-[10px] text-slate-400">{dispatcherNumber(d.external_ref)}</span>
                  {d.full_name.slice(0, 15)}
                </td>
                {Array.from({ length: 24 }, (_, h) => {
                  const st = d.cells[h];
                  return (
                    <td
                      key={h}
                      onClick={() => cycle(d.dispatcher_id, h)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => dragId && addFromPalette(dragId, h)}
                      className={`w-8 cursor-pointer border-r border-slate-100 py-1 text-center ${st ? SIGLA_STYLE[st] : "hover:bg-slate-50"}`}
                      title={`${d.full_name} · ${hourLabel(h)}${st ? ` · ${st}` : ""}`}
                    >
                      {st && st !== "work" ? <span className="text-[8px] font-bold">{st}</span> : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* palette */}
      <div className="w-52 shrink-0 rounded-lg border border-slate-200 bg-white p-2" style={{ maxHeight: 620 }}>
        <h3 className="mb-1 px-1 text-xs font-semibold text-slate-600">Dispatchers ({data.palette.length})</h3>
        <div className="mb-2 flex flex-wrap gap-1 px-1">
          {(["A", "A1", "A2", "MR", "NE"] as Sigla[]).map((s) => (
            <span key={s} className={`rounded px-1 text-[9px] font-bold ${SIGLA_STYLE[s]}`}>{s}</span>
          ))}
        </div>
        <p className="mb-2 px-1 text-[10px] text-slate-400">
          A = asignación · A1 = agenda · A2 = copias · MR = ring central · NE = mensajería.
          Arrastrá un nombre a la grilla. Click en celda para ciclar roles. ✓ = ya en la grilla.
        </p>
        <div className="max-h-[540px] space-y-0.5 overflow-y-auto">
          {data.palette.map((p) => {
            const here = inGrid.has(p.id);
            return (
              <div
                key={p.id}
                draggable
                onDragStart={() => setDragId(p.id)}
                onDragEnd={() => setDragId(null)}
                className={`flex cursor-grab items-center gap-1 rounded px-2 py-1 text-[11px] active:cursor-grabbing ${
                  here ? "opacity-50" : ""
                } ${p.can_message ? "bg-emerald-50 hover:bg-emerald-100" : "bg-slate-50 hover:bg-slate-100"}`}
              >
                <span className="font-mono text-[10px] text-slate-400">{dispatcherNumber(p.external_ref)}</span>
                <span className="truncate">{p.full_name}</span>
                {here && <span className="ml-auto text-[9px] text-slate-500">✓</span>}
                {!here && p.can_message && <span className="ml-auto text-[8px] text-emerald-600">msg</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
