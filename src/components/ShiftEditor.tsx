"use client";

import { useState, useTransition } from "react";
import { createShift, updateShift, deleteShift } from "@/app/actions";
import { AiAssistButton } from "@/components/AiAssist";

interface Option {
  id: string;
  full_name: string;
}

interface ShiftData {
  id: string;
  dispatcher_id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  position: string | null;
  status: string;
}

const STATUS_OPTIONS = [
  { value: "programado", label: "Programado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "ausente", label: "Ausente" },
  { value: "cubierto", label: "Cubierto" },
];

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function fieldsMarkup(shift?: ShiftData, dispatchers?: Option[], defaultDate?: string) {
  return (
    <>
      {dispatchers && (
        <div>
          <label className="mb-1 block text-sm font-medium">Dispatcher</label>
          <select
            name="dispatcher_id"
            required
            defaultValue={shift?.dispatcher_id ?? ""}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Selecciona…</option>
            {dispatchers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium">Fecha</label>
        <input
          type="date"
          name="shift_date"
          required
          defaultValue={shift?.shift_date ?? defaultDate ?? ""}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Inicio</label>
          <input
            type="time"
            name="shift_start"
            required
            defaultValue={shift?.shift_start?.slice(0, 5) ?? "08:00"}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Fin</label>
          <input
            type="time"
            name="shift_end"
            required
            defaultValue={shift?.shift_end?.slice(0, 5) ?? "16:00"}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Puesto (opcional)</label>
        <input
          type="text"
          name="position"
          defaultValue={shift?.position ?? ""}
          placeholder="Central, Aeropuerto…"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Estado</label>
        <select
          name="status"
          defaultValue={shift?.status ?? "programado"}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

/** Header button to create a new shift. */
export function NewShiftButton({
  dispatchers,
  defaultDate,
}: {
  dispatchers: Option[];
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
      >
        + Nuevo turno
      </button>
      {open && (
        <Modal title="Nuevo turno" onClose={() => setOpen(false)}>
          <form
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const res = await createShift(fd);
                if (res.ok) setOpen(false);
                else setError(res.error!);
              });
            }}
            className="space-y-4 text-left"
          >
            {fieldsMarkup(undefined, dispatchers, defaultDate)}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Crear turno"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

/** A shift block inside the weekly grid — click to edit/delete. */
export function ShiftBlock({ shift, className }: { shift: ShiftData; className: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const showAi = shift.status === "ausente" || shift.status === "cubierto";

  return (
    <>
      <div className={`mb-1 rounded px-1.5 py-1 text-[11px] ${className}`}>
        <button onClick={() => setOpen(true)} className="w-full text-left" title="Editar turno">
          <div className="font-medium">
            {shift.shift_start.slice(0, 5)}–{shift.shift_end.slice(0, 5)}
          </div>
          {shift.position && <div className="text-[10px] opacity-80">{shift.position}</div>}
        </button>
        {showAi && <AiAssistButton shiftId={shift.id} />}
      </div>

      {open && (
        <Modal title="Editar turno" onClose={() => setOpen(false)}>
          <form
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const res = await updateShift(shift.id, fd);
                if (res.ok) setOpen(false);
                else setError(res.error!);
              });
            }}
            className="space-y-4 text-left"
          >
            {fieldsMarkup(shift)}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {pending ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await deleteShift(shift.id);
                    if (res.ok) setOpen(false);
                    else setError(res.error!);
                  })
                }
                className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
