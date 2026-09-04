import { redirect } from "next/navigation";
import Link from "next/link";
import { getRecentAssignments, getCoverageStats, getRecentReassignments, RETURNING_REASON } from "@/lib/queries";
import { dispatcherNumber } from "@/lib/dates";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ClearLiveButton } from "@/components/ClearLiveButton";
import { SetupBanner } from "@/components/SetupBanner";

export const dynamic = "force-dynamic";

const GHL_TYPE: Record<number, string> = {
  1: "Llamada",
  2: "SMS",
  3: "Email",
  4: "SMS",
  5: "Webchat",
  16: "Facebook",
  17: "Instagram",
  19: "WhatsApp",
  20: "WhatsApp",
  25: "Instagram",
};

/** Always render a friendly channel name, even if a raw numeric code slipped through. */
function channelLabel(v: string | null): string {
  if (!v) return "—";
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return GHL_TYPE[Number(s)] ?? `Canal ${s}`;
  const l = s.toLowerCase();
  if (l.includes("whatsapp")) return "WhatsApp";
  if (l.includes("instagram")) return "Instagram";
  if (l.includes("facebook")) return "Facebook";
  if (l.includes("sms") || l.includes("text")) return "SMS";
  if (l.includes("email")) return "Email";
  if (l.includes("call") || l.includes("phone")) return "Llamada";
  if (l.includes("chat") || l.includes("web")) return "Webchat";
  return s;
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  return `hace ${h}h`;
}

export default async function AsignacionesPage() {
  // DISABLED — remove this line to re-enable the live view
  redirect("/");

  let rows, coverage, reassigns;
  try {
    [rows, coverage, reassigns] = await Promise.all([
      getRecentAssignments(40),
      getCoverageStats(),
      getRecentReassignments(20),
    ]);
  } catch (e: any) {
    return <SetupBanner error={e.message ?? String(e)} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Asignaciones en vivo</h1>
          <p className="text-sm text-slate-500">Round-robin de conversaciones entrantes → despachadores.</p>
        </div>
        <div className="flex items-center gap-2">
          <ClearLiveButton />
          {/* <AutoRefresh intervalMs={5000} /> */}{/* DISABLED */}
        </div>
      </div>

      {/* Returning-customer alert: customers who wrote back while their old owner was inactive */}
      {coverage.returningToday > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <span className="text-2xl leading-none">🔄</span>
          <div>
            <h2 className="font-semibold text-amber-900">
              {coverage.returningToday} cliente{coverage.returningToday > 1 ? "s" : ""} recurrente
              {coverage.returningToday > 1 ? "s" : ""} reasignado{coverage.returningToday > 1 ? "s" : ""} hoy
            </h2>
            <p className="text-sm text-amber-800">
              Volvieron a escribir y su dispatcher anterior estaba inactivo — se reasignaron automáticamente
              a alguien activo (habrían quedado sin respuesta). Detalle abajo, marcados “Cliente regresó”.
            </p>
          </div>
        </div>
      )}

      {/* Counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{coverage.assignedToday}</div>
          <div className="text-xs text-slate-500">Asignadas hoy</div>
        </div>
        <div
          className={`rounded-lg border p-4 text-center ${
            coverage.reassignedToday > 0 ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"
          }`}
        >
          <div className={`text-2xl font-bold ${coverage.reassignedToday > 0 ? "text-orange-700" : ""}`}>
            {coverage.reassignedToday}
          </div>
          <div className="text-xs text-slate-500">Reasignadas hoy</div>
        </div>
        <div
          className={`rounded-lg border p-4 text-center ${
            coverage.elseToday > 0 ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
          }`}
        >
          <div className={`text-2xl font-bold ${coverage.elseToday > 0 ? "text-red-700" : ""}`}>
            {coverage.elseToday}
          </div>
          <div className="text-xs text-slate-500">Sin dispatcher (hoy)</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
          <div className="text-2xl font-bold">{coverage.elseWeek}</div>
          <div className="text-xs text-slate-500">Sin dispatcher (7 días)</div>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Las reglas de reasignación y palabras de cierre se ajustan en{" "}
        <Link href="/configuracion" className="font-medium text-indigo-600 hover:underline">Configuración</Link>.
      </p>

      {/* Reassignments tracker */}
      {reassigns.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold text-orange-800">Reasignaciones</h2>
          <div className="overflow-hidden rounded-lg border border-orange-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-orange-50 text-left">
                <tr>
                  <th className="px-4 py-2 font-semibold">Hora</th>
                  <th className="px-4 py-2 font-semibold">Contacto</th>
                  <th className="px-4 py-2 font-semibold">Canal</th>
                  <th className="px-4 py-2 font-semibold">Motivo</th>
                  <th className="px-4 py-2 font-semibold">Perdió</th>
                  <th className="px-4 py-2 font-semibold">Reasignada a</th>
                </tr>
              </thead>
              <tbody>
                {reassigns.map((r) => {
                  const returning = r.reason === RETURNING_REASON;
                  return (
                    <tr key={r.id} className={`border-b border-slate-100 ${returning ? "bg-amber-50" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-500">{timeAgo(r.created_at)}</td>
                      <td className="px-4 py-2 font-medium">{r.contact_name ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{channelLabel(r.channel)}</td>
                      <td className="px-4 py-2">
                        {returning ? (
                          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
                            🔄 Cliente regresó
                          </span>
                        ) : (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                            Sin respuesta 2 min
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {r.from_disp ? (
                          <span className="text-red-700">
                            <span className="mr-1 font-mono text-[10px] text-slate-400">{dispatcherNumber(r.from_disp.external_ref)}</span>
                            {r.from_disp.full_name}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {r.to_disp ? (
                          <span className="text-green-700">
                            <span className="mr-1 font-mono text-[10px] text-slate-400">{dispatcherNumber(r.to_disp.external_ref)}</span>
                            {r.to_disp.full_name}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Live feed */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-semibold">Hora</th>
              <th className="px-4 py-2 font-semibold">Contacto</th>
              <th className="px-4 py-2 font-semibold">Canal</th>
              <th className="px-4 py-2 font-semibold">Asignado a</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Aún no hay asignaciones. Esperando la primera conversación entrante…
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const ok = r.outcome === "assigned";
              return (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">{timeAgo(r.created_at)}</td>
                  <td className="px-4 py-2 font-medium">{r.contact_name ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{channelLabel(r.channel)}</td>
                  <td className="px-4 py-2">
                    {ok && r.dispatcher ? (
                      <span>
                        <span className="mr-1.5 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {dispatcherNumber(r.dispatcher.external_ref)}
                        </span>
                        {r.dispatcher.full_name}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {ok ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Asignada
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Sin dispatcher
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
