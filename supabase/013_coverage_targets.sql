-- =============================================================
-- Coverage targets: how many dispatchers are needed per (day-of-week, hour, role).
-- Hybrid: messaging (msg) derived from demand; phone roles (A/A1/A2/MR) from the
-- role_schedule history. Editable. Feeds the schedule generator (Fase B).
-- Run: node --env-file=.env.local scripts/migrate.mjs 013_coverage_targets.sql
-- =============================================================

create table if not exists coverage_targets (
  id           uuid primary key default gen_random_uuid(),
  dow          smallint not null check (dow between 0 and 6),  -- 0=Sun … 6=Sat
  hour         smallint not null check (hour between 0 and 23),
  role         text not null,       -- 'msg' | 'MR' | 'A' | 'A1' | 'A2'
  target       smallint not null default 0,
  source       text default 'derived',
  edited       boolean default false,
  updated_at   timestamptz not null default now(),
  unique (dow, hour, role)
);
create index if not exists idx_coverage_dow_hour on coverage_targets(dow, hour);

alter table coverage_targets enable row level security;
