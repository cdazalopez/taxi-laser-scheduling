import Link from "next/link";
import { getRoleEditor } from "@/lib/queries";
import { prettyDay, DAY_LABELS, weekStart } from "@/lib/dates";
import { GenerateButton } from "@/components/GenerateButton";
import { RoleGridEditor } from "@/components/RoleGridEditor";
import { ApproveButton } from "@/components/ApproveButton";
import { SetupBanner } from "@/components/SetupBanner";

export const dynamic = "force-dynamic";

export default async function GenerarPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const { day } = await searchParams;
  let data;
  try {
    data = await getRoleEditor(day);
  } catch (e: any) {
    return <SetupBanner error={e.message ?? String(e)} />;
  }
  const { runId, weekStart: ws, weekDates, editDay } = data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Generación de horarios</h1>
        <p className="text-sm text-slate-500">
          El motor arma turnos en bloques con descanso (apertura 4 AM; diurnos 8–9h partidos 5/4, 4/4 o 5/3
          con descanso de 2h/1h; nocturnos 20:00–03:59 continuos) según cobertura, más la rotación de
          mensajería. Editá la grilla a mano, arrastrá dispatchers desde la derecha, y aprobá cuando esté listo.
          {ws && ` Semana del ${prettyDay(ws)}.`}
        </p>
      </div>

      <GenerateButton defaultWeek={ws ?? weekStart()} />

      {!runId ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400">
          Todavía no generaste ningún horario. Elegí la semana y dale a “Generar horario”.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1">
            {weekDates.map((iso) => (
              <Link
                key={iso}
                href={`/generar?day=${iso}`}
                className={`rounded px-2.5 py-1 text-sm ${
                  iso === editDay ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {DAY_LABELS[(new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7]} {prettyDay(iso)}
              </Link>
            ))}
          </div>

          <RoleGridEditor data={data} />

          {ws && <ApproveButton runId={runId} weekLabel={`semana del ${prettyDay(ws)}`} />}

          <p className="text-xs text-slate-500">
            Click en una celda para ciclar los roles. Dispatchers de <b>mensajería</b>: vacío →{" "}
            <span className="rounded bg-slate-200 px-1">disponible</span> →{" "}
            <span className="rounded bg-emerald-500 px-1 text-white">NE</span> →{" "}
            <span className="rounded bg-teal-500 px-1 text-white">MR</span> → vacío. Dispatchers de{" "}
            <b>teléfono</b>: vacío → <span className="rounded bg-sky-200 px-1">A</span> →{" "}
            <span className="rounded bg-indigo-500 px-1 text-white">A1</span> →{" "}
            <span className="rounded bg-violet-500 px-1 text-white">A2</span> → vacío. La fila “Cobertura msg”
            cuenta los NE. Arrastrá un dispatcher de la lista derecha para agregarlo (soporta turnos split).
          </p>
        </>
      )}
    </div>
  );
}
