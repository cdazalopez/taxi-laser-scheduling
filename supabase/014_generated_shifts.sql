-- =============================================================
-- Output of the automatic schedule generator (Fase B). A "run" is one generation.
-- Run: node --env-file=.env.local scripts/migrate.mjs 014_generated_shifts.sql
-- =============================================================

create table if not exists schedule_runs (
  id           uuid primary key default gen_random_uuid(),
  week_start   date not null,
  days_off     smallint default 2,
  target_load  smallint default 15,
  status       text default 'draft',      -- draft | applied
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists generated_shifts (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references schedule_runs(id) on delete cascade,
  dispatcher_id  uuid not null references dispatchers(id) on delete cascade,
  work_date      date not null,
  start_hour     smallint not null check (start_hour between 0 and 23),
  end_hour       smallint not null check (end_hour between 1 and 24),
  role_hint      text,                      -- 'msg' | 'phone' (capability used)
  created_at     timestamptz not null default now()
);
create index if not exists idx_gen_shifts_run on generated_shifts(run_id, work_date);

alter table schedule_runs enable row level security;
alter table generated_shifts enable row level security;
