-- =============================================================
-- Auto-derive pool_activo from schedule ∩ (not on approved leave), hourly.
-- pool_activo = who SHOULD be working now per the schedule, minus approved permisos.
-- Run: node --env-file=.env.local scripts/migrate.mjs 003_pool_refresh.sql
-- =============================================================

-- Timezone of the dispatch operation (schedule times are local to this tz).
create or replace function refresh_pool_activo(tz text default 'America/New_York')
returns integer
language plpgsql
as $$
declare
  local_now timestamp := (now() at time zone tz);
  today     date := local_now::date;
  now_time  time := local_now::time;
  active_n  integer;
begin
  -- Dispatchers whose shift covers the current hour today, excluding approved leave.
  create temporary table _active on commit drop as
    select distinct s.dispatcher_id
    from schedule s
    where s.shift_date = today
      and s.shift_start <= now_time
      and s.shift_end   >  now_time
      and s.status <> 'ausente'
      and not exists (
        select 1 from permisos p
        where p.dispatcher_id = s.dispatcher_id
          and p.estado = 'aprobado'
          and p.start_date <= today
          and p.end_date   >= today
      );

  -- Reset everyone currently active, then flag the freshly-computed active set.
  update pool_activo set is_active = false, updated_at = now() where is_active = true;

  insert into pool_activo (dispatcher_id, is_active, current_status, source, updated_at)
  select dispatcher_id, true, 'scheduled', 'schedule', now() from _active
  on conflict (dispatcher_id) do update
    set is_active = true, current_status = 'scheduled', source = 'schedule', updated_at = now();

  select count(*) into active_n from _active;
  return active_n;
end;
$$;

-- Schedule it hourly inside Supabase (no external cron dependency).
create extension if not exists pg_cron;

-- Replace any existing job of the same name, then (re)schedule at minute 0 every hour.
do $$
begin
  perform cron.unschedule('refresh-pool-activo')
  where exists (select 1 from cron.job where jobname = 'refresh-pool-activo');
exception when others then null;
end $$;

select cron.schedule('refresh-pool-activo', '0 * * * *', $$select refresh_pool_activo()$$);
