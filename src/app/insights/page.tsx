import Link from "next/link";
import { getStaffingInsights, getScheduledStaffingByHour } from "@/lib/queries";
import { hourLabel, weekStart, addDays, prettyDay } from "@/lib/dates";
import { InsightsAI } from "@/components/InsightsAI";
import { SetupBanner } from "@/components/SetupBanner";

export const dynamic = "force-dynamic";

// Postgres dow: 0=Sun … 6=Sat. Shown Monday-first.
const DOW = [
  { v: 1, label: "Lunes" },
  { v: 2, label: "Martes" },
  { v: 3, label: "Miércoles" },
  { v: 4, label: "Jueves" },
  { v: 5, label: "Viernes" },
  { v: 6, label: "Sábado" },
  { v: 0, label: "Domingo" },
];

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ dow?: string; target?: string }>;
}) {
  const sp = await searchParams;
  const dow = sp.dow !== undefined && /^[0-6]$/.test(sp.dow) ? Number(sp.dow) : 6; // default Saturday (peak)
  const target = sp.target && Number(sp.target) > 0 ? Number(sp.target) : 15;

  // Current-week date for the selected day-of-week (Monday-based week).
  const monday = weekStart();
  const offset = dow === 0 ? 6 : dow - 1;
  const compareDate = addDays(monday, offset);

  let rows, samples, scheduled;
  try {
    [{ rows, samples }, scheduled] = await Promise.all([
      getStaffingInsights(dow, target),
      getScheduledStaffingByHour(compareDate),
    ]);
  } catch (e: any) {
    return <SetupBanner error={e.message ?? String(e)} />;
  }

  const totalRecommended = rows.reduce((a, r) => a + r.recommended, 0);
  const totalActual = rows.reduce((a, r) => a + (scheduled.get(r.hour) ?? 0), 0);
  const peak = rows.reduce((m, r) => (r.avg_demand > m.avg_demand ? r : m), rows[0]);
  const dowLabel = DOW.find((d) => d.v === dow)?.label ?? "";
  const understaffedHours = rows.filter((r) => r.recommended - (scheduled.get(r.hour) ?? 0) > 0).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Insights de staffing</h1>
        <p className="text-sm text-slate-500">
          Recomendación de dispatchers por hora basada en {samples} semanas de demanda histórica.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Día</label>
          <div className="flex flex-wrap gap-1">
            {DOW.map((d) => (
              <Link
                key={d.v}
                href={`/insights?dow=${d.v}&target=${target}`}
                className={`rounded px-2.5 py-1 text-sm ${
                  d.v === dow
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {d.label.slice(0, 3)}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Carga objetivo (llamadas / dispatcher)
          </label>
          <div className="flex gap-1">
            {[10, 12, 15, 18, 20, 25].map((t) => (
              <Link
                key={t}
                href={`/insights?dow=${dow}&target=${t}`}
                className={`rounded px-2.5 py-1 text-sm ${
                  t === target
                    ? "bg-indigo-600 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {t}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label={`Dispatcher-horas recomendadas (${dowLabel})`} value={totalRecommended} />
        <Card label={`Programadas esta semana (${prettyDay(compareDate)})`} value={totalActual} />
        <Card
          label="Horas sub-staffeadas vs recomendado"
          value={understaffedHours}
          alert={understaffedHours > 0}
        />
        <Card label="Hora pico" value={`${hourLabel(peak.hour)} · ${peak.avg_demand}`} />
      </div>

      {/* Hourly table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2 font-semibold">Hora</th>
              <th className="px-3 py-2 text-right font-semibold">Demanda prom.</th>
              <th className="px-3 py-2 text-right font-semibold">Staff hist.</th>
              <th className="px-3 py-2 text-right font-semibold">Recomendado</th>
              <th className="border-l border-slate-200 px-3 py-2 text-right font-semibold">
                Actual (esta sem.)
              </th>
              <th className="px-3 py-2 text-right font-semibold">Gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const actual = scheduled.get(r.hour) ?? 0;
              const gapActual = r.recommended - actual;
              return (
                <tr key={r.hour} className="border-b border-slate-100">
                  <td className="px-3 py-1.5 font-medium">{hourLabel(r.hour)}</td>
                  <td className="px-3 py-1.5 text-right">{r.avg_demand}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500">{r.avg_staff ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{r.recommended}</td>
                  <td className="border-l border-slate-200 px-3 py-1.5 text-right text-slate-700">
                    {actual}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                        gapActual > 2
                          ? "bg-red-100 text-red-700"
                          : gapActual > 0
                          ? "bg-amber-100 text-amber-800"
                          : gapActual < -2
                          ? "bg-sky-100 text-sky-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {gapActual > 0 ? `+${gapActual}` : gapActual}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        <span className="font-medium text-red-700">Gap +</span> = faltan dispatchers vs lo programado
        esta semana ({prettyDay(compareDate)}) ·{" "}
        <span className="font-medium text-sky-700">Gap −</span> = posible sobre-staffing. Recomendado =
        ⌈demanda ÷ carga objetivo⌉.
      </p>

      <InsightsAI dow={dow} target={target} compareDate={compareDate} />
    </div>
  );
}

function Card({
  label,
  value,
  alert,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${alert ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
      <div className={`text-lg font-bold ${alert ? "text-red-700" : ""}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
