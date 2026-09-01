import { getPermisos } from "@/lib/queries";
import { ApprovalActions } from "@/components/ApprovalActions";
import { SetupBanner } from "@/components/SetupBanner";
import { TIPO_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function AprobacionesPage() {
  let pendientes;
  try {
    pendientes = await getPermisos("pendiente");
  } catch (e: any) {
    return <SetupBanner error={e.message ?? String(e)} />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold">Panel de aprobación</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-800">
          {pendientes.length} pendientes
        </span>
      </div>

      {pendientes.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400">
          No hay solicitudes pendientes. 🎉
        </div>
      ) : (
        <div className="space-y-3">
          {pendientes.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-medium">{p.dispatcher?.full_name ?? "—"}</div>
                <div className="text-sm text-slate-500">
                  {TIPO_LABEL[p.tipo] ?? p.tipo} · {p.start_date} → {p.end_date}
                </div>
                {p.reason && <div className="mt-1 text-sm text-slate-600">“{p.reason}”</div>}
              </div>
              <ApprovalActions id={p.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
