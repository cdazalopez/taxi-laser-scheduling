-- =============================================================
-- Dispatcher scheduling profiles — derived from history, then hand-corrected.
-- Inputs for the automatic schedule generator (Fase B).
-- Run: node --env-file=.env.local scripts/migrate.mjs 011_dispatcher_profiles.sql
-- =============================================================

create table if not exists dispatcher_profiles (
  dispatcher_id   uuid primary key references dispatchers(id) on delete cascade,
  employment      text,                 -- 'full_time' | 'part_time'
  max_hours_week  integer,              -- cap the generator won't exceed
  min_hours_week  integer,              -- target minimum
  avg_hours_week  numeric(5,1),         -- derived reference (historical)
  work_days       smallint[] default '{}', -- days usually worked, 0=Sun … 6=Sat
  typical_start   time,
  typical_end     time,
  can_message     boolean default false,   -- part of the messaging team
  weeks_sampled   integer default 0,
  edited          boolean default false,   -- true once a human corrects it
  updated_at      timestamptz not null default now()
);

alter table dispatcher_profiles enable row level security;
