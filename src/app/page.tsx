import Link from "next/link";
import {
  getWeekSchedule,
  getDaySchedule,
  getDayDemand,
  getMessagingDay,
  getActivePool,
  getDispatchers,
  getCoverageStats,
} from "@/lib/queries";
import { weekStart, weekDays, addDays, DAY_LABELS, prettyDay, todayIso, dispatcherNumber } from "@/lib/dates";
import { NewShiftButton, ShiftBlock } from "@/components/ShiftEditor";
import { DayGrid } from "@/components/DayGrid";
import { MessagingGrid } from "@/components/MessagingGrid";
import { PoolPanel } from "@/components/PoolPanel";
import { SetupBanner } from "@/components/SetupBanner";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string; day?: string }>;
}) {
  const { week, view, day } = await searchParams;
  const mode = view === "dia" ? "dia" : view === "msg" ? "msg" : "semana";
  const start = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : weekStart();
  const dayIso = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayIso();
  const days = weekDays(start);

  let weekSchedule: Awaited<ReturnType<typeof getWeekSchedule>> = [];
  let daySchedule: Awaited<ReturnType<typeof getDaySchedule>> = [];
  let dayDemand: Awaited<ReturnType<typeof getDayDemand>> | undefined;
  let messaging: Awaited<ReturnType<typeof getMessagingDay>> = [];
  let pool, dispatchers, coverage;
  try {
    [pool, dispatchers, coverage] = await Promise.all([
      getActivePool(),
      getDispatchers(),
      getCoverageStats(),
    ]);
    if (mode === "dia") {
      [daySchedule, dayDemand] = await Promise.all([getDaySchedule(dayIso), getDayDemand(dayIso)]);
    } else if (mode === "msg") {
      messaging = await getMessagingDay(dayIso);
    } else {
      weekSchedule = await getWeekSchedule(start);
    }
  } catch (e: any) {
    return <SetupBanner error={e.message ?? String(e)} />;
  }

  // Week grouping: dispatcherId -> { name, ref, days }
  const byDispatcher = new Map<
    string,
    { name: string; ref: string | null; days: Map<string, typeof weekSchedule> }
  >();
  for (const s of weekSchedule) {
    if (!byDispatcher.has(s.dispatcher_id))
      byDispatcher.set(s.dispatcher_id, {
        name: s.dispatcher?.full_name ?? "—",
        ref: s.dispatcher?.external_ref ?? null,
        days: new Map(),
      });
    const row = byDispatcher.get(s.dispatcher_id)!;
    if (!row.days.has(s.shift_date)) row.days.set(s.shift_date, []);
    row.days.get(s.shift_date)!.push(s);
  }
  const rows = [...byDispatcher.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

  const online = pool.filter((p) => p.is_active);
  const activeCount = online.length;
  const activosCount = dispatchers.filter((d) => d.status === "activo").length;
  const lastUpdate = pool[0]?.updated_at;
  const scheduleCount = mode === "dia" ? daySchedule.length : weekSchedule.length;

  const tab = (label: string, active: boolean, href: string) => (
    <Link
      href={href}
      className={`rounded px-3 py-1.5 text-sm font-medium ${
        active ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Schedule</h1>
            <p className="text-sm text-slate-500">
              {mode === "msg"
                ? `Roles · Día ${prettyDay(dayIso)}`
                : mode === "dia"
                ? `Día ${prettyDay(dayIso)}`
                : `Semana del ${prettyDay(start)} al ${prettyDay(addDays(start, 6))}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {tab("Semana", mode === "semana", `/?view=semana&week=${start}`)}
            {tab("Día", mode === "dia", `/?view=dia&day=${dayIso}`)}
            {tab("Roles", mode === "msg", `/?view=msg&day=${dayIso}`)}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {mode === "dia" || mode === "msg" ? (
            <>
              {navLink("← Día anterior", `/?view=${mode}&day=${addDays(dayIso, -1)}`)}
              {navLink("Hoy", `/?view=${mode}&day=${todayIso()}`)}
              {navLink("Día siguiente →", `/?view=${mode}&day=${addDays(dayIso, 1)}`)}
            </>
          ) : (
            <>
              {navLink("← Anterior", `/?view=semana&week=${addDays(start, -7)}`)}
              {navLink("Hoy", `/?view=semana&week=${weekStart()}`)}
              {navLink("Siguiente →", `/?view=semana&week=${addDays(start, 7)}`)}
            </>
          )}
          <NewShiftButton
            dispatchers={dispatchers.map((d) => ({
              id: d.id,
              full_name: `${dispatcherNumber(d.external_ref)} · ${d.full_name}`,
            }))}
            defaultDate={mode === "dia" || mode === "msg" ? dayIso : start}
          />
        </div>

        {mode === "msg" ? (
          <MessagingGrid rows={messaging} dateIso={dayIso} />
        ) : mode === "dia" ? (
          <DayGrid shifts={daySchedule as any} dateIso={dayIso} demand={dayDemand} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-semibold">Dispatcher</th>
                  {days.map((d, i) => (
                    <th key={d} className="px-2 py-2 text-center font-semibold">
                      {DAY_LABELS[i]}
                      <div className="text-[10px] font-normal text-slate-500">{prettyDay(d)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      No hay turnos programados esta semana.
                    </td>
                  </tr>
                )}
                {rows.map(([id, row]) => (
                  <tr key={id} className="border-b border-slate-100">
                    <td className="sticky left-0 bg-white px-3 py-2">
                      <span className="mr-1.5 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {dispatcherNumber(row.ref)}
                      </span>
                      <span className="font-medium">{row.name}</span>
                    </td>
                    {days.map((d) => {
                      const shifts = row.days.get(d) ?? [];
                      return (
                        <td key={d} className="px-1.5 py-1.5 align-top">
                          {shifts.map((s) => (
                            <ShiftBlock
                              key={s.id}
                              shift={{
                                id: s.id,
                                dispatcher_id: s.dispatcher_id,
                                shift_date: s.shift_date,
                                shift_start: s.shift_start,
                                shift_end: s.shift_end,
                                position: s.position,
                                status: s.status,
                              }}
                              className={statusColor(s.status)}
                            />
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Pool activo</h2>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              {activeCount} en línea
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {lastUpdate ? `Actualizado ${new Date(lastUpdate).toLocaleString("es")}` : "Sin datos aún"}
          </p>
          <PoolPanel
            online={online.map((p) => ({
              dispatcher_id: p.dispatcher_id,
              full_name: p.dispatcher?.full_name ?? p.dispatcher_id.slice(0, 8),
              external_ref: p.dispatcher?.external_ref ?? null,
            }))}
            offline={dispatchers
              .filter((d) => d.available_override === "offline")
              .map((d) => ({ id: d.id, full_name: d.full_name, external_ref: d.external_ref }))}
          />
        </div>

        <div
          className={`rounded-lg border p-4 ${
            coverage.elseToday > 0 ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Cobertura</h2>
            {coverage.elseToday > 0 ? (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                {coverage.elseToday} sin cobertura
              </span>
            ) : (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                OK
              </span>
            )}
          </div>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Conversaciones sin dispatcher (hoy)</dt>
              <dd className={`font-semibold ${coverage.elseToday > 0 ? "text-red-700" : ""}`}>
                {coverage.elseToday}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Sin dispatcher (7 días)</dt>
              <dd className="font-medium">{coverage.elseWeek}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Asignadas hoy</dt>
              <dd className="font-medium">{coverage.assignedToday}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">Resumen</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Dispatchers activos</dt>
              <dd className="font-medium">{activosCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">En línea</dt>
              <dd className="font-medium text-green-700">{activeCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Turnos ({mode === "dia" ? "día" : "semana"})</dt>
              <dd className="font-medium">{scheduleCount}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}

function navLink(label: string, href: string) {
  return (
    <Link href={href} className="rounded border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100">
      {label}
    </Link>
  );
}

function statusColor(status: string) {
  switch (status) {
    case "confirmado":
      return "bg-green-50 text-green-800 border border-green-200";
    case "ausente":
      return "bg-red-50 text-red-800 border border-red-200";
    case "cubierto":
      return "bg-amber-50 text-amber-800 border border-amber-200";
    default:
      return "bg-slate-50 text-slate-700 border border-slate-200";
  }
}
