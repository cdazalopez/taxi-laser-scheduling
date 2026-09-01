export function SetupBanner({ error }: { error: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6">
      <h2 className="text-lg font-semibold text-amber-900">Falta configurar la base de datos</h2>
      <p className="mt-1 text-sm text-amber-800">
        No se pudieron leer las tablas de Supabase. Aplica el schema y luego importa los dispatchers:
      </p>
      <pre className="mt-3 overflow-x-auto rounded bg-amber-900/90 p-3 text-xs text-amber-50">
{`# 1. Añade DATABASE_URL en .env.local (Supabase > Settings > Database)
# 2. Aplica el schema
npm run db:migrate
# 3. Importa dispatchers (edita data/dispatchers.csv primero)
npm run db:seed`}
      </pre>
      <p className="mt-3 font-mono text-xs text-amber-700">detalle: {error}</p>
    </div>
  );
}
