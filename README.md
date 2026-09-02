# Taxi Laser LLC — Scheduling System

Next.js 16 (App Router) + Supabase + Vercel. Dashboard de scheduling para dispatchers.

## Estructura

```
src/
  app/
    page.tsx                 # Dashboard: vista semanal del schedule + pool activo
    permisos/page.tsx        # Formulario de permisos/vacaciones + listado
    aprobaciones/page.tsx    # Panel de aprobación
    actions.ts               # Server Actions: crear permiso, aprobar/rechazar
    api/
      webhooks/pool/route.ts # Webhook Make.com (actualiza pool_activo cada hora)
      ai-assist/route.ts     # Sugerencias de reemplazo (reglas + LLM opcional)
  lib/
    supabase/server.ts       # Cliente service_role (solo servidor)
    queries.ts               # Lecturas de datos
    replacement.ts           # Motor de ranking de reemplazos
    dates.ts, labels.ts, types.ts
supabase/schema.sql          # Schema (tablas + enums + triggers + RLS)
scripts/
  migrate.mjs                # Aplica schema.sql
  seed-dispatchers.mjs       # Importa data/dispatchers.csv
data/dispatchers.csv         # Listado de dispatchers a importar
```

## Setup

1. **Variables de entorno** (`.env.local`). Añade:
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Settings → API) si vas a usar auth de cliente.
   - `DATABASE_URL` (Supabase → Settings → Database → Connection string "Session") para migraciones.
   - `MAKE_WEBHOOK_SECRET` — secreto largo aleatorio compartido con Make.com.
   - `AI_GATEWAY_API_KEY` (opcional) — habilita la recomendación en lenguaje natural del AI assist.

2. **Aplicar el schema**
   ```bash
   npm run db:migrate          # usa DATABASE_URL
   ```
   O pega `supabase/schema.sql` en el SQL Editor de Supabase.

3. **Importar dispatchers** — edita `data/dispatchers.csv`
   (header: `external_ref,full_name,email,phone,role,status,skills,hire_date`; skills separadas por `|`):
   ```bash
   npm run db:seed
   ```

4. **Importar demanda histórica** (para forecasting) — desde el Excel de horarios:
   ```bash
   node scripts/parse-horarios.mjs "/ruta/HORARIOS 36.xlsx"  # genera data/demanda.csv
   npm run db:seed-demanda                                    # upsert a demanda_historica
   ```
   El parser deriva `(fecha, hora)` de cada hoja semanal, toma `ride_count` de la columna
   **"Calls Prom."** y `dispatchers_on` de **"Disp. * hora"**, y ancla el año validando que
   cada semana empiece en Lunes. Ya importado: **Dic 2024 → Ago 2026 (~13k filas)**.

5. **Cargar el schedule real** (turnos) desde el mismo Excel:
   ```bash
   node --env-file=.env.local scripts/parse-schedule.mjs "/ruta/HORARIOS 36.xlsx"
   ```
   Colapsa las horas con `*` en bloques de turno (shift_start–shift_end) por dispatcher/día
   y hace upsert a `schedule`. Mapea los códigos (`A 004`, `D072`…) por `external_ref`; omite
   códigos de dispatchers que ya no están en el roster. Ya cargado: **29.600 turnos**.

5. **Dev**
   ```bash
   npm run dev
   ```

## Acceso (login)

Las **páginas** están protegidas por un gate de contraseña (middleware en `src/middleware.ts`); las **APIs
no** (usan su propio `x-webhook-secret`, para que GHL y pg_cron sigan funcionando).

- Contraseña: configurada en `APP_PASSWORD` (`.env.local` y Vercel — no incluida en el repo).
- La sesión es una cookie httpOnly (`tl_auth` = `APP_SESSION_TOKEN`), 30 días. "Salir" en el header.

## Producción

- **URL:** https://taxi-laser-scheduling.vercel.app
- Env vars configuradas en Vercel (Production/Preview/Development): `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `MAKE_WEBHOOK_SECRET`.
- Re-deploy: `vercel deploy --prod`

## Round-robin de conversaciones GHL (event-driven)

Asignación de conversaciones entrantes (WhatsApp/SMS) al siguiente dispatcher activo en
rotación. **La rotación la hace este backend**, no GHL (el "Assign to User → Round Robin"
nativo de GHL sólo rota sobre una lista fija, no puede respetar el pool activo dinámico).

Flujo:
1. Mensaje entrante → **GHL Workflow** (trigger "Customer Replied / Conversation").
2. Acción **Custom Webhook (POST)** a `POST /api/assign` con header `x-webhook-secret`.
3. `assign_next_dispatcher()` (Postgres RPC, atómico con `FOR UPDATE SKIP LOCKED`) elige el
   dispatcher activo asignado hace más tiempo (least-recently-assigned), marca `last_assigned_at`
   y devuelve `{ assigned, ghl_user_id, dispatcher_id, full_name, email }`.
4. GHL Workflow: acción **Assign to User** con el `ghl_user_id` devuelto.

Respuestas:
- `{ "assigned": true,  "fallback": false, "ghl_user_id": "..." }` → **Assign to User**.
- `{ "assigned": false, "fallback": false, "reason": "no_active_dispatcher" }` → **rama Else**
  (nadie activo): notificar supervisor + tag, sin auto-asignar.
- Si se configura `GHL_FALLBACK_USER_ID`, el "no active" devuelve
  `{ "assigned": false, "fallback": true, "ghl_user_id": "<fallback>" }` para asignar a ese usuario.

**Badge de cobertura.** Cada llamada a `/api/assign` se registra en `assignment_log`
(`assigned` | `no_active_dispatcher` | `missing_ghl_user_id`). El dashboard muestra una tarjeta
**"Cobertura"** con conversaciones sin dispatcher (hoy / 7 días) y asignadas hoy — se pone roja
si hubo huecos hoy (señala falta de cobertura en el schedule a alguna hora).

**Mapeo email → GHL user id.** `dispatchers.ghl_user_id` se llena una vez (y cuando entren
nuevos dispatchers) con:
```bash
npm run ghl:sync-users      # necesita GHL_API_TOKEN + GHL_LOCATION_ID en .env.local
```
Hace `GET /users/?locationId=...` a la API v2 de GHL y matchea por email.

## pool_activo (derivado del schedule, automático)

`pool_activo` NO se llena manualmente — se **deriva del schedule** cada hora:
quién tiene un turno que cubre la hora actual, menos quienes tienen un permiso aprobado hoy.

- Función Postgres `refresh_pool_activo(tz default 'America/New_York')` (`supabase/003_pool_refresh.sql`).
- Programada con **pg_cron** dentro de Supabase: job `refresh-pool-activo`, `0 * * * *` (cada hora).
- Refresh manual/inmediato (p.ej. tras editar el schedule):
  `POST /api/cron/refresh-pool` con header `x-webhook-secret`.

> El escenario Make `5863141` (lectura horaria de pool) quedó **superseded** por el flujo
> event-driven de `/api/assign`; dejarlo **pausado**.

## Webhook Make.com (pool activo)

Cada hora, un HTTP module en Make.com hace `POST` a `/api/webhooks/pool`:

```
Headers: x-webhook-secret: <MAKE_WEBHOOK_SECRET>
Body:
{
  "pool": [
    { "email": "jane@taxilaser.com", "is_active": true, "current_status": "online" },
    { "dispatcher_id": "<uuid>", "is_active": false, "current_status": "offline" }
  ]
}
```

Cada item se resuelve por `dispatcher_id`, `email` o `external_ref`.
Respuesta: `{ ok, updated, skipped }`.

## AI assist (reemplazos)

`POST /api/ai-assist` con `{ "shift_id": "<uuid>" }`. Rankea candidatos por reglas
(disponibilidad en pool activo, sin permisos aprobados solapados, sin turnos en
conflicto, match de skills). Si hay `AI_GATEWAY_API_KEY`, añade una recomendación
de Claude vía Vercel AI Gateway. En el dashboard, botón **"AI reemplazo"** en los
turnos `ausente` o `cubierto`.

## Deploy en Vercel

```bash
vercel            # preview
vercel --prod     # producción
```
Configura las mismas variables de entorno en el proyecto de Vercel.
