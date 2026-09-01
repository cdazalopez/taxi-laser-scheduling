-- =============================================================
-- Log of /api/assign outcomes — powers the dashboard coverage badge.
-- Run: node --env-file=.env.local scripts/migrate.mjs 004_assignment_log.sql
-- =============================================================

create table if not exists assignment_log (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  outcome       text not null,  -- 'assigned' | 'no_active_dispatcher' | 'missing_ghl_user_id'
  dispatcher_id uuid references dispatchers(id) on delete set null,
  reason        text
);

create index if not exists idx_assignment_log_created on assignment_log(created_at desc);
create index if not exists idx_assignment_log_outcome on assignment_log(outcome, created_at desc);

alter table assignment_log enable row level security;
