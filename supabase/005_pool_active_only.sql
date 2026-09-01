-- =============================================================
-- Fix: pool_activo must only include dispatchers with status = 'activo'
-- (historical/inactive dispatchers can now carry shifts).
-- Run: node --env-file=.env.local scripts/migrate.mjs 005_pool_active_only.sql
-- =============================================================

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
  create temporary table _active on commit drop as
    select distinct s.dispatcher_id
    from schedule s
    join dispatchers d on d.id = s.dispatcher_id
    where d.status = 'activo'
      and s.shift_date = today
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

  update pool_activo set is_active = false, updated_at = now() where is_active = true;

  insert into pool_activo (dispatcher_id, is_active, current_status, source, updated_at)
  select dispatcher_id, true, 'scheduled', 'schedule', now() from _active
  on conflict (dispatcher_id) do update
    set is_active = true, current_status = 'scheduled', source = 'schedule', updated_at = now();

  select count(*) into active_n from _active;
  return active_n;
end;
$$;
