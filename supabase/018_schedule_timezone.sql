-- =============================================================
-- The schedule Excel hours are authored in CENTRAL time (not Atlanta/Eastern).
-- Make the pool interpret schedule hours in the schedule's timezone, configurable.
-- Run: node --env-file=.env.local scripts/migrate.mjs 018_schedule_timezone.sql
-- =============================================================

create table if not exists app_settings (
  id           boolean primary key default true,
  schedule_tz  text not null default 'America/Chicago',  -- timezone the Excel hours are in
  updated_at   timestamptz not null default now(),
  constraint app_settings_single check (id)
);
insert into app_settings (id) values (true) on conflict (id) do nothing;
alter table app_settings enable row level security;

-- Pool refresh now reads the schedule timezone from app_settings (falls back to Central).
create or replace function refresh_pool_activo(tz text default null)
returns integer
language plpgsql
as $$
declare
  ztz       text := coalesce(tz, (select schedule_tz from app_settings where id), 'America/Chicago');
  local_now timestamp := (now() at time zone ztz);
  today     date := local_now::date;
  cur_hour  smallint := extract(hour from local_now)::smallint;
  active_n  integer;
begin
  create temporary table _active on commit drop as
    select distinct rs.dispatcher_id
    from role_schedule rs
    join dispatchers d on d.id = rs.dispatcher_id
    where rs.work_date = today
      and rs.hour = cur_hour
      and rs.in_round_robin = true
      and d.status = 'activo'
      and d.available_override is distinct from 'offline'
      and not exists (
        select 1 from permisos p
        where p.dispatcher_id = rs.dispatcher_id
          and p.estado = 'aprobado'
          and p.start_date <= today
          and p.end_date   >= today
      );

  update pool_activo set is_active = false, updated_at = now() where is_active = true;

  insert into pool_activo (dispatcher_id, is_active, current_status, source, updated_at)
  select dispatcher_id, true, 'messaging', 'schedule', now() from _active
  on conflict (dispatcher_id) do update
    set is_active = true, current_status = 'messaging', source = 'schedule', updated_at = now();

  select count(*) into active_n from _active;
  return active_n;
end;
$$;
