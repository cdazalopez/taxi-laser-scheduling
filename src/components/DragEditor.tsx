"use client";

import { useMemo, useRef, useState } from "react";
import { updateGeneratedShift, deleteGeneratedShift } from "@/app/actions";
import { hourLabel, dispatcherNumber } from "@/lib/dates";
import type { DayEditorData } from "@/lib/queries";

const HOUR_W = 34;
const ROW_H = 26;

interface LocalShift {
  id: string;
  dispatcher_id: string;
  start_hour: number;
  end_hour: number;
  role_hint: string | null;
}

type DragMode = "move" | "left" | "right";

export function DragEditor({ data, dateIso }: { data: DayEditorData; dateIso: string }) {
  const { dispatchers, targets } = data;
  const [shifts, setShifts] = useState<LocalShift[]>(data.shifts as LocalShift[]);
  const rowIndex = useMemo(() => new Map(dispatchers.map((d, i) => [d.id, i])), [dispatchers]);
  const canMsg = useMemo(() => new Map(dispatchers.map((d) => [d.id, d.can_message])), [dispatchers]);

  const drag = useRef<null | {
    id: string;
    mode: DragMode;
    startX: number;
    startY: number;
    orig: LocalShift;
    origRow: number;
  }>(null);

  function onPointerDown(e: React.PointerEvent, s: LocalShift) {
    const bar = e.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const mode: DragMode = x < 8 ? "left" : x > rect.width - 8 ? "right" : "move";
    drag.current = { id: s.id, mode, startX: e.clientX, startY: e.clientY, orig: { ...s }, origRow: rowIndex.get(s.dispatcher_id) ?? 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dh = Math.round((e.clientX - d.startX) / HOUR_W);
    setShifts((prev) =>
      prev.map((s) => {
        if (s.id !== d.id) return s;
        if (d.mode === "left") {
          const start = Math.min(d.orig.end_hour - 1, Math.max(0, d.orig.start_hour + dh));
          return { ...s, start_hour: start };
        }
        if (d.mode === "right") {
          const end = Math.max(d.orig.start_hour + 1, Math.min(24, d.orig.end_hour + dh));
          return { ...s, end_hour: end };
        }
        // move (time + dispatcher row)
        const len = d.orig.end_hour - d.orig.start_hour;
        let start = Math.max(0, Math.min(24 - len, d.orig.start_hour + dh));
        const dr = Math.round((e.clientY - d.startY) / ROW_H);
        const row = Math.max(0, Math.min(dispatchers.length - 1, d.origRow + dr));
        return { ...s, start_hour: start, end_hour: start + len, dispatcher_id: dispatchers[row].id };
      })
    );
  }

  async function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const s = shifts.find((x) => x.id === d.id);
    if (s) await updateGeneratedShift(s.id, s.dispatcher_id, s.start_hour, s.end_hour);
  }

  async function remove(id: string) {
    setShifts((prev) => prev.filter((s) => s.id !== id));
    await deleteGeneratedShift(id);
  }

  // live messaging coverage per hour
  const covered = Array.from({ length: 24 }, (_, h) =>
    shifts.filter((s) => canMsg.get(s.dispatcher_id) && s.start_hour <= h && h < s.end_hour).length
  );

  return (
    <div
      className="overflow-auto rounded-lg border border-slate-200 bg-white"
      style={{ maxHeight: 640 }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div style={{ minWidth: 150 + 24 * HOUR_W }}>
        {/* hour header */}
        <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-slate-50 text-[10px] text-slate-500">
          <div className="sticky left-0 z-10 w-[150px] shrink-0 border-r border-slate-300 bg-slate-50 px-2 py-1 font-semibold">
            Dispatcher
          </div>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="shrink-0 border-r border-slate-100 text-center" style={{ width: HOUR_W }}>
              {hourLabel(h)}
            </div>
          ))}
        </div>

        {/* live coverage row */}
        <div className="sticky top-[22px] z-20 flex border-b border-slate-300 bg-white">
          <div className="sticky left-0 z-10 w-[150px] shrink-0 border-r border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">
            Cobertura msg
          </div>
          {Array.from({ length: 24 }, (_, h) => {
            const t = targets[h];
            const c = Math.min(covered[h], t);
            const cls = t === 0 ? "text-slate-300" : c >= t ? "bg-emerald-500 text-white" : c > 0 ? "bg-amber-300 text-amber-950" : "bg-red-500 text-white";
            return (
              <div key={h} className={`shrink-0 border-r border-slate-100 text-center text-[9px] font-semibold ${cls}`} style={{ width: HOUR_W }}>
                {t ? `${covered[h]}/${t}` : "·"}
              </div>
            );
          })}
        </div>

        {/* dispatcher rows with shift bars */}
        <div className="relative" style={{ height: dispatchers.length * ROW_H }}>
          {dispatchers.map((d, i) => (
            <div key={d.id} className="absolute left-0 flex w-full items-center border-b border-slate-50" style={{ top: i * ROW_H, height: ROW_H }}>
              <div className={`sticky left-0 z-10 w-[150px] shrink-0 border-r border-slate-200 bg-white px-2 text-[11px] ${d.can_message ? "" : "text-slate-400"}`}>
                <span className="mr-1 font-mono text-[10px] text-slate-400">{dispatcherNumber(d.external_ref)}</span>
                {d.full_name.slice(0, 16)}
              </div>
            </div>
          ))}
          {/* shift bars overlaid on the hour area (offset by label width) */}
          <div className="absolute top-0" style={{ left: 150 }}>
            {shifts.map((s) => {
              const row = rowIndex.get(s.dispatcher_id) ?? 0;
              const msg = canMsg.get(s.dispatcher_id);
              return (
                <div
                  key={s.id}
                  onPointerDown={(e) => onPointerDown(e, s)}
                  className={`group absolute flex cursor-grab items-center justify-between rounded px-1 text-[9px] font-semibold text-white select-none active:cursor-grabbing ${msg ? "bg-emerald-500" : "bg-sky-500"}`}
                  style={{ left: s.start_hour * HOUR_W, width: (s.end_hour - s.start_hour) * HOUR_W, top: row * ROW_H + 2, height: ROW_H - 4 }}
                  title="Arrastrá el centro para mover · los bordes para estirar"
                >
                  <span className="pointer-events-none w-1 self-stretch rounded-l bg-black/20" />
                  <span className="pointer-events-none">{s.start_hour}-{s.end_hour}h</span>
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(s.id)} className="opacity-0 group-hover:opacity-100" title="Eliminar">✕</button>
                  <span className="pointer-events-none w-1 self-stretch rounded-r bg-black/20" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
