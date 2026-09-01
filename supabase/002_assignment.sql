-- =============================================================
-- GHL conversation round-robin assignment support
-- Run: node --env-file=.env.local scripts/migrate.mjs 002_assignment.sql
-- =============================================================

-- GHL user id per dispatcher (populated by scripts/sync-ghl-users.mjs, matched by email).
alter table dispatchers add column if not exists ghl_user_id text;

-- Round-robin pointer: least-recently-assigned wins. NULL = never assigned (goes first).
alter table dispatchers add column if not exists last_assigned_at timestamptz;

create index if not exists idx_dispatchers_last_assigned on dispatchers(last_assigned_at nulls first);

-- Atomic "pick next active dispatcher in rotation" for GHL assignment.
-- Chooses the active (pool_activo.is_active) dispatcher assigned longest ago,
-- stamps last_assigned_at = now(), and returns their identity in one statement.
create or replace function assign_next_dispatcher()
returns table (dispatcher_id uuid, full_name text, email text, ghl_user_id text)
language plpgsql
as $$
declare
  chosen uuid;
begin
  select d.id into chosen
  from dispatchers d
  join pool_activo p on p.dispatcher_id = d.id
  where d.status = 'activo' and p.is_active = true
  order by d.last_assigned_at asc nulls first, d.id
  limit 1
  for update of d skip locked;

  if chosen is null then
    return; -- no active dispatcher available
  end if;

  update dispatchers d set last_assigned_at = now() where d.id = chosen;

  return query
  select d.id, d.full_name, d.email, d.ghl_user_id
  from dispatchers d where d.id = chosen;
end;
$$;
