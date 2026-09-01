import { hourLabel, dispatcherNumber, todayIso } from "@/lib/dates";
import type { HourMetrics } from "@/lib/queries";

interface DayShift {
  id: string;
  dispatcher_id: string;
  shift_start: string;
  shift_end: string;
  status: string;
  dispatcher: { id: string; full_name: string; external_ref: string | null } | null;
}

const METRIC_COLS: { key: keyof HourMetrics; label: string; hint: string }[] = [
  { key: "calls_prom", label: "Calls", hint: "Calls Prom. (demanda esperada)" },
  { key: "semana_pas", label: "Sem.Pas", hint: "Llamadas de la semana pasada" },
  { key: "calls_disp", label: "C/Disp", hint: "Calls por dispatcher (carga)" },
];

function fmt(v?: number) {
  if (v === undefined || v === null) return "";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
// color the load (calls/disp): green ok, amber busy, red overloaded
function loadClass(v?: number) {
  if (v === undefined) return "";
  if (v >= 20) return "bg-red-100 text-red-700 font-semibold";
  if (v >= 12) return "bg-amber-100 text-amber-800";
  return "text-slate-600";
}

function initial(name?: string | null) {
  return name?.trim()?.[0]?.toUpperCase() ?? "?";
}

function toSec(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 3600 + (m || 0) * 60;
}

/** Excel-style grid: rows = 24 hours, columns = dispatchers scheduled that day. */
export function DayGrid({
  shifts,
  dateIso,
  demand,
}: {
  shifts: DayShift[];
  dateIso: string;
  demand?: Map<number, HourMetrics>;
}) {
  // Group shifts by dispatcher, compute the set of hours each covers.
  const byDisp = new Map<
    string,
    { name: string; ref: string | null; hours: Set<number>; status: Set<string> }
  >();
  for (const s of shifts) {
    const id = s.dispatcher_id;
    if (!byDisp.has(id))
      byDisp.set(id, {
        name: s.dispatcher?.full_name ?? "—",
        ref: s.dispatcher?.external_ref ?? null,
        hours: new Set(),
        status: new Set(),
      });
    const entry = byDisp.get(id)!;
    entry.status.add(s.status);
    const start = toSec(s.shift_start);
    const end = toSec(s.shift_end);
    for (let h = 0; h < 24; h++) {
      const sec = h * 3600;
      if (start <= sec && sec < end) entry.hours.add(h);
    }
  }

  const cols = [...byDisp.entries()].sort((a, b) => {
    const na = Number(dispatcherNumber(a[1].ref)) || 9999;
    const nb = Number(dispatcherNumber(b[1].ref)) || 9999;
    return na - nb;
  });

  const nowHour = dateIso === todayIso() ? new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })).getHours() : -1;
  const perHourTotal = (h: number) => cols.filter(([, c]) => c.hours.has(h)).length;

  if (cols.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-8 text-center text-slate-500">
        No hay turnos programados este día.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="sticky left-0 z-10 border-r border-slate-300 bg-slate-50 px-2 py-2 text-left font-semibold whitespace-nowrap">
              Hora
            </th>
            {cols.map(([id, c]) => (
              <th
                key={id}
                className="w-8 min-w-8 max-w-8 border-r border-slate-200 px-0 py-1.5 text-center align-bottom font-semibold whitespace-nowrap"
                title={c.name}
              >
                <div className="text-[9px] font-medium leading-none text-slate-400">{initial(c.name)}</div>
                <div className="text-[11px] leading-tight text-slate-900">{dispatcherNumber(c.ref)}</div>
              </th>
            ))}
            <th className="w-11 min-w-11 bg-slate-100 px-1 py-2 text-center font-semibold whitespace-nowrap">
              Disp.
            </th>
            {demand &&
              METRIC_COLS.map((mc) => (
                <th
                  key={mc.key}
                  className="min-w-[52px] border-l border-slate-200 bg-slate-100 px-2 py-2 text-center font-semibold whitespace-nowrap"
                  title={mc.hint}
                >
                  {mc.label}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 24 }, (_, h) => (
            <tr
              key={h}
              className={`border-b border-slate-100 ${h === nowHour ? "bg-yellow-50" : ""}`}
            >
              <td
                className={`sticky left-0 z-10 border-r border-slate-300 px-2 py-1 font-medium whitespace-nowrap ${
                  h === nowHour ? "bg-yellow-50" : "bg-white"
                }`}
              >
                {hourLabel(h)}
              </td>
              {cols.map(([id, c]) => {
                const on = c.hours.has(h);
                const absent = on && c.status.has("ausente");
                return (
                  <td key={id} className="w-8 min-w-8 max-w-8 border-r border-slate-200 px-0 py-1 text-center">
                    {on && (
                      <span
                        className={`inline-block h-3 w-3 rounded-sm ${
                          absent ? "bg-red-400" : "bg-emerald-500"
                        }`}
                        title={c.name}
                      />
                    )}
                  </td>
                );
              })}
              <td className="bg-slate-50 px-2 py-1 text-center font-semibold text-slate-700">
                {perHourTotal(h)}
              </td>
              {demand &&
                METRIC_COLS.map((mc) => {
                  const v = demand.get(h)?.[mc.key];
                  return (
                    <td
                      key={mc.key}
                      className={`border-l border-slate-100 px-2 py-1 text-center whitespace-nowrap ${
                        mc.key === "calls_disp" ? loadClass(v) : "text-slate-600"
                      }`}
                    >
                      {fmt(v)}
                    </td>
                  );
                })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
