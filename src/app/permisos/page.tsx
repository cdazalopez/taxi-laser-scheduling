import { getDispatchers, getPermisos } from "@/lib/queries";
import { PermisoForm } from "@/components/PermisoForm";
import { SetupBanner } from "@/components/SetupBanner";
import { ESTADO_BADGE, TIPO_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function PermisosPage() {
  let dispatchers, permisos;
  try {
    [dispatchers, permisos] = await Promise.all([getDispatchers(), getPermisos()]);
  } catch (e: any) {
    return <SetupBanner error={e.message ?? String(e)} />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
      <section>
        <h1 className="mb-4 text-xl font-bold">Solicitar permiso / vacaciones</h1>
        <PermisoForm dispatchers={dispatchers.map((d) => ({ id: d.id, full_name: d.full_name }))} />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Solicitudes recientes</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-semibold">Dispatcher</th>
                <th className="px-3 py-2 font-semibold">Tipo</th>
                <th className="px-3 py-2 font-semibold">Fechas</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {permisos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                    Sin solicitudes.
                  </td>
                </tr>
              )}
              {permisos.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium">{p.dispatcher?.full_name ?? "—"}</td>
                  <td className="px-3 py-2">{TIPO_LABEL[p.tipo] ?? p.tipo}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {p.start_date} → {p.end_date}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_BADGE[p.estado]}`}>
                      {p.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
