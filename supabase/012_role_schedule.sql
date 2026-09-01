-- =============================================================
-- Unified per-hour role schedule for ALL dispatchers.
--   section 'phone'     (Excel cols B–T):  A (asignación), A1 (agenda), A2 (copias), …
--   section 'messaging' (Excel cols U+):   NE, MC1..MC6 (round-robin), MR (ring central)
-- Replaces messaging_schedule. Run: node --env-file=.env.local scripts/migrate.mjs 012_role_schedule.sql
-- =============================================================

create table if not exists role_schedule (
  id             uuid primary key default gen_random_uuid(),
  dispatcher_id  uuid not null references dispatchers(id) on delete cascade,
  work_date      date not null,
  hour           smallint not null check (hour between 0 and 23),
  section        text not null,               -- 'phone' | 'messaging'
  sigla          text not null,               -- A|A1|A2|NE|MR|MC1..MC6|…
  in_round_robin boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (dispatcher_id, work_date, hour)
);
create index if not exists idx_role_sched_rr on role_schedule(work_date, hour) where in_round_robin;
create index if not exists idx_role_sched_date on role_schedule(work_date, hour);
create index if not exists idx_role_sched_section on role_schedule(work_date, section);

alter table role_schedule enable row level security;

-- Point the pool at role_schedule (round-robin siglas only).
create or replace function refresh_pool_activo(tz text default 'America/New_York')
returns integer
language plpgsql
as $$
declare
  local_now timestamp := (now() at time zone tz);
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
