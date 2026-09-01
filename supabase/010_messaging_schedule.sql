-- =============================================================
-- Messaging schedule: per-hour role sigla for messaging dispatchers (Excel cols U+).
-- Round-robin runs ONLY among NE / MC1-MC6 siglas. MR (ring central) is tracked but
-- excluded from rotation. Empty cells = not scheduled for messaging that hour.
-- Run: node --env-file=.env.local scripts/migrate.mjs 010_messaging_schedule.sql
-- =============================================================

create table if not exists messaging_schedule (
  id             uuid primary key default gen_random_uuid(),
  dispatcher_id  uuid not null references dispatchers(id) on delete cascade,
  work_date      date not null,
  hour           smallint not null check (hour between 0 and 23),
  sigla          text not null,               -- NE | MR | MC1..MC6 | ...
  in_round_robin boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (dispatcher_id, work_date, hour)
);
create index if not exists idx_msg_sched_rr on messaging_schedule(work_date, hour) where in_round_robin;
create index if not exists idx_msg_sched_date on messaging_schedule(work_date, hour);

alter table messaging_schedule enable row level security;

-- Pool now derives from messaging_schedule (NE/MC only), minus approved leave and manual offline.
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
    select distinct ms.dispatcher_id
    from messaging_schedule ms
    join dispatchers d on d.id = ms.dispatcher_id
    where ms.work_date = today
      and ms.hour = cur_hour
      and ms.in_round_robin = true          -- NE / MC1-6 only (MR excluded)
      and d.status = 'activo'
      and d.available_override is distinct from 'offline'
      and not exists (
        select 1 from permisos p
        where p.dispatcher_id = ms.dispatcher_id
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
