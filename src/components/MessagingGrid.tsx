import { hourLabel, dispatcherNumber, todayIso } from "@/lib/dates";
import { siglaClass } from "@/lib/labels";
import type { MessagingRow } from "@/lib/queries";

function initial(name?: string | null) {
  return name?.trim()?.[0]?.toUpperCase() ?? "?";
}

/** Excel-style role grid: rows = hours, columns = dispatchers, cell = role sigla. */
export function MessagingGrid({ rows, dateIso }: { rows: MessagingRow[]; dateIso: string }) {
  const byDisp = new Map<
    string,
    { name: string; ref: string | null; hours: Map<number, { sigla: string; rr: boolean; section: string }> }
  >();
  for (const r of rows) {
    if (!byDisp.has(r.dispatcher_id))
      byDisp.set(r.dispatcher_id, {
        name: r.dispatcher?.full_name ?? "—",
        ref: r.dispatcher?.external_ref ?? null,
        hours: new Map(),
      });
    byDisp.get(r.dispatcher_id)!.hours.set(r.hour, { sigla: r.sigla, rr: r.in_round_robin, section: r.section });
  }
  const cols = [...byDisp.entries()].sort((a, b) => {
    const na = Number(dispatcherNumber(a[1].ref)) || 9999;
    const nb = Number(dispatcherNumber(b[1].ref)) || 9999;
    return na - nb;
  });

  const nowHour =
    dateIso === todayIso()
      ? new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })).getHours()
      : -1;
  const rrPerHour = (h: number) => cols.filter(([, c]) => c.hours.get(h)?.rr).length;

  if (cols.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-8 text-center text-slate-500">
        No hay horario de mensajería cargado para este día.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-emerald-500" /> NE / MC = mensajería round-robin</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-amber-400" /> MR = ring central (no rota)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-sky-500" /> A = Asignación</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-indigo-500" /> A1 = Enc. agenda</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-cyan-600" /> A2 = Enc. copias</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="sticky left-0 z-10 border-r border-slate-300 bg-slate-50 px-2 py-2 text-left font-semibold whitespace-nowrap">
                Hora
              </th>
              {cols.map(([id, c]) => (
                <th
                  key={id}
                  className="w-9 min-w-9 max-w-9 border-r border-slate-200 px-0 py-1.5 text-center align-bottom font-semibold whitespace-nowrap"
                  title={c.name}
                >
                  <div className="text-[9px] font-medium leading-none text-slate-400">{initial(c.name)}</div>
                  <div className="text-[11px] leading-tight text-slate-900">{dispatcherNumber(c.ref)}</div>
                </th>
              ))}
              <th className="w-10 min-w-10 bg-slate-100 px-1 py-2 text-center font-semibold">RR</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 24 }, (_, h) => (
              <tr key={h} className={`border-b border-slate-100 ${h === nowHour ? "bg-yellow-50" : ""}`}>
                <td
                  className={`sticky left-0 z-10 border-r border-slate-300 px-2 py-1 font-medium whitespace-nowrap ${
                    h === nowHour ? "bg-yellow-50" : "bg-white"
                  }`}
                >
                  {hourLabel(h)}
                </td>
                {cols.map(([id, c]) => {
                  const cell = c.hours.get(h);
                  return (
                    <td key={id} className="w-9 min-w-9 max-w-9 border-r border-slate-200 px-0 py-0.5 text-center">
                      {cell && (
                        <span className={`inline-block rounded px-1 py-0.5 text-[9px] font-bold ${siglaClass(cell.sigla, cell.rr, cell.section)}`}>
                          {cell.sigla}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="bg-slate-50 px-1 py-1 text-center font-semibold text-emerald-700">{rrPerHour(h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
