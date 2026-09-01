import { getAppSettings, getReassignConfig, getStopwords } from "@/lib/queries";
import { AppSettingsEditor } from "@/components/AppSettingsEditor";
import { ScheduleUploader } from "@/components/ScheduleUploader";
import { ReassignConfigEditor } from "@/components/ReassignConfigEditor";
import { StopwordsEditor } from "@/components/StopwordsEditor";
import { SetupBanner } from "@/components/SetupBanner";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  let settings, reassign, stopwords;
  try {
    [settings, reassign, stopwords] = await Promise.all([
      getAppSettings(),
      getReassignConfig(),
      getStopwords(),
    ]);
  } catch (e: any) {
    return <SetupBanner error={e.message ?? String(e)} />;
  }

  const webhookBase = "https://taxi-laser-scheduling.vercel.app";

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Configuración</h1>
        <p className="text-sm text-slate-500">Estándares del sistema en un solo lugar.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Horario</h2>
        <ScheduleUploader />
        <AppSettingsEditor scheduleTz={settings.schedule_tz} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Round-robin y reasignación
        </h2>
        <ReassignConfigEditor config={reassign} />
        <StopwordsEditor words={stopwords} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Integraciones (GHL)</h2>
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <Row label="Webhook de asignación (Workflow GHL)" value={`${webhookBase}/api/ghl/assign`} />
          <Row label="Header de auth" value="x-webhook-secret" />
          <Row label="Location ID (GHL)" value="FmXJ8J0Ccird2AKk8pzQ" />
          <p className="pt-1 text-xs text-slate-500">
            El pool se refresca cada hora (Supabase pg_cron) y el poller de reasignación corre cada minuto.
            El secreto del webhook y las API keys se manejan por variables de entorno (no se muestran acá).
          </p>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-slate-500">{label}</span>
      <code className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{value}</code>
    </div>
  );
}
