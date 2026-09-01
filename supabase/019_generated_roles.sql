-- =============================================================
-- Generated per-hour role grid (draft): base shifts + messaging rotation.
-- Messaging (NE/MC) is assigned in 1-hour NON-consecutive slots. On approval this
-- is written to role_schedule (+ schedule) so it shows in Semana/Día/Roles.
-- Run: node --env-file=.env.local scripts/migrate.mjs 019_generated_roles.sql
-- =============================================================

alter table schedule_runs add column if not exists max_msg_hours smallint default 6;

create table if not exists generated_roles (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references schedule_runs(id) on delete cascade,
  dispatcher_id  uuid not null references dispatchers(id) on delete cascade,
  work_date      date not null,
  hour           smallint not null check (hour between 0 and 23),
  sigla          text,                        -- NE | A | A1 | A2 | MR | null (working, no role)
  in_round_robin boolean not null default false,
  unique (run_id, dispatcher_id, work_date, hour)
);
create index if not exists idx_gen_roles_run on generated_roles(run_id, work_date, hour);

alter table generated_roles enable row level security;
