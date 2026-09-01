-- =============================================================
-- Auto-reassignment: track open assignments so a poller can reassign a conversation
-- if the assigned dispatcher hasn't responded within 2 minutes.
-- Run: node --env-file=.env.local scripts/migrate.mjs 015_reassignment.sql
-- =============================================================

create table if not exists active_assignments (
  contact_id      text primary key,
  conversation_id text,
  dispatcher_id   uuid references dispatchers(id) on delete set null,
  assigned_at     timestamptz not null default now(),
  reassign_count  smallint not null default 0,
  updated_at      timestamptz not null default now()
);
create index if not exists idx_active_assign_time on active_assignments(assigned_at);

-- Track who lost the conversation on a reassignment.
alter table assignment_log add column if not exists reassigned_from uuid references dispatchers(id) on delete set null;

alter table active_assignments enable row level security;
