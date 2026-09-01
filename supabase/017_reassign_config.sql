-- =============================================================
-- Tunable config for the auto-reassign poller (avoid over-reassigning).
-- Run: node --env-file=.env.local scripts/migrate.mjs 017_reassign_config.sql
-- =============================================================

create table if not exists reassign_config (
  id             boolean primary key default true,
  enabled        boolean not null default true,
  idle_minutes   integer not null default 5,   -- wait this long before reassigning
  max_reassigns  integer not null default 5,   -- give up (tag) after this many hops
  require_unread boolean not null default true, -- only reassign if the dispatcher hasn't read it
  updated_at     timestamptz not null default now(),
  constraint reassign_config_single check (id)
);

insert into reassign_config (id, idle_minutes, max_reassigns, require_unread)
values (true, 5, 5, true)
on conflict (id) do nothing;

alter table reassign_config enable row level security;
