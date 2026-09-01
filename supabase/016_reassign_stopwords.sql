-- =============================================================
-- Stop-words that end a conversation: if the last client message contains one,
-- the reassign poller stops reassigning (service considered completed/closed).
-- Run: node --env-file=.env.local scripts/migrate.mjs 016_reassign_stopwords.sql
-- =============================================================

create table if not exists reassign_stopwords (
  id         uuid primary key default gen_random_uuid(),
  word       text not null unique,   -- stored normalized (lowercase, no accents)
  created_at timestamptz not null default now()
);

alter table reassign_stopwords enable row level security;

insert into reassign_stopwords (word) values
  ('gracias'), ('muchas gracias'), ('listo'), ('resuelto'), ('completado'),
  ('ya llego'), ('ya llegó'), ('cancelar'), ('cancelado'), ('todo bien'),
  ('perfecto gracias'), ('no gracias'), ('solucionado')
on conflict (word) do nothing;
