import { getProfiles } from "@/lib/queries";
import { ProfileRow } from "@/components/ProfileEditor";
import { SetupBanner } from "@/components/SetupBanner";

export const dynamic = "force-dynamic";

export default async function PerfilesPage() {
  let profiles;
  try {
    profiles = await getProfiles();
  } catch (e: any) {
    return <SetupBanner error={e.message ?? String(e)} />;
  }

  const ft = profiles.filter((p) => p.employment === "full_time").length;
  const pt = profiles.filter((p) => p.employment === "part_time").length;
  const msg = profiles.filter((p) => p.can_message).length;
  const edited = profiles.filter((p) => p.edited).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Perfiles de dispatchers</h1>
        <p className="text-sm text-slate-500">
          Derivados del histórico (84 semanas) — revisá y corregí antes de generar horarios. Las horas
          entre paréntesis (~) son el promedio histórico de referencia.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Full-time" value={ft} />
        <Card label="Part-time" value={pt} />
        <Card label="Mensajería" value={msg} />
        <Card label="Editados a mano" value={edited} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2 font-semibold">Dispatcher</th>
              <th className="px-3 py-2 font-semibold">Contrato</th>
              <th className="px-3 py-2 text-right font-semibold">Horas/sem</th>
              <th className="px-3 py-2 font-semibold">Días</th>
              <th className="px-3 py-2 font-semibold">Ventana</th>
              <th className="px-3 py-2 text-center font-semibold">Msg</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <ProfileRow key={p.dispatcher_id} p={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
