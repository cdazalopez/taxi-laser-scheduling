-- =============================================================
-- Taxi Laser LLC — Scheduling System schema
-- Run in Supabase SQL Editor, or via: psql "$DATABASE_URL" -f supabase/schema.sql
-- =============================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
do $$ begin
  create type dispatcher_status as enum ('activo', 'inactivo', 'suspendido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type permiso_tipo as enum ('vacaciones', 'permiso', 'enfermedad', 'personal', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type permiso_estado as enum ('pendiente', 'aprobado', 'rechazado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type shift_estado as enum ('programado', 'confirmado', 'ausente', 'cubierto');
exception when duplicate_object then null; end $$;

-- ---------- DISPATCHERS ----------
create table if not exists dispatchers (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  email         text unique,
  phone         text,
  role          text default 'dispatcher',        -- dispatcher | supervisor | lead
  status        dispatcher_status not null default 'activo',
  skills        text[] default '{}',              -- e.g. {'bilingual','night_shift'}
  hire_date     date,
  external_ref  text,                             -- id in Make/legacy system
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- SCHEDULE (weekly shifts) ----------
create table if not exists schedule (
  id             uuid primary key default gen_random_uuid(),
  dispatcher_id  uuid not null references dispatchers(id) on delete cascade,
  shift_date     date not null,
  shift_start    time not null,
  shift_end      time not null,
  position       text,                            -- role/desk on that shift
  status         shift_estado not null default 'programado',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (dispatcher_id, shift_date, shift_start)
);
create index if not exists idx_schedule_date on schedule(shift_date);
create index if not exists idx_schedule_dispatcher on schedule(dispatcher_id);

-- ---------- PERMISOS (time-off / vacation requests) ----------
create table if not exists permisos (
  id             uuid primary key default gen_random_uuid(),
  dispatcher_id  uuid not null references dispatchers(id) on delete cascade,
  tipo           permiso_tipo not null,
  estado         permiso_estado not null default 'pendiente',
  start_date     date not null,
  end_date       date not null,
  reason         text,
  approved_by    uuid references dispatchers(id),
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists idx_permisos_estado on permisos(estado);
create index if not exists idx_permisos_dispatcher on permisos(dispatcher_id);
create index if not exists idx_permisos_range on permisos(start_date, end_date);

-- ---------- POOL_ACTIVO (who is available right now — updated hourly by Make.com) ----------
create table if not exists pool_activo (
  dispatcher_id  uuid primary key references dispatchers(id) on delete cascade,
  is_active      boolean not null default false,
  current_status text,                            -- 'online' | 'on_break' | 'offline' | 'on_call'
  source         text default 'make.com',
  updated_at     timestamptz not null default now()
);
create index if not exists idx_pool_active on pool_activo(is_active);

-- ---------- DEMANDA_HISTORICA (historical demand for AI forecasting) ----------
create table if not exists demanda_historica (
  id             uuid primary key default gen_random_uuid(),
  demand_date    date not null,
  hour           smallint not null check (hour between 0 and 23),
  ride_count     integer not null default 0,
  dispatchers_on integer,                         -- how many were staffed
  source         text default 'import',
  created_at     timestamptz not null default now(),
  unique (demand_date, hour)
);
create index if not exists idx_demanda_date on demanda_historica(demand_date);

-- ---------- updated_at trigger ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['dispatchers','schedule','permisos'] loop
    execute format(
      'drop trigger if exists trg_%1$s_updated on %1$s;
       create trigger trg_%1$s_updated before update on %1$s
       for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ---------- RLS ----------
-- Service role (used by the Next.js server) bypasses RLS, so the app keeps working.
-- Enable RLS so the anon/public key cannot read/write directly.
alter table dispatchers        enable row level security;
alter table schedule           enable row level security;
alter table permisos           enable row level security;
alter table pool_activo        enable row level security;
alter table demanda_historica  enable row level security;
