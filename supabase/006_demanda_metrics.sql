-- =============================================================
-- Capture the full hourly metrics block from the schedule Excel
-- (Semana Pas, Calls / Disp., Total, … — beyond ride_count/dispatchers_on).
-- Run: node --env-file=.env.local scripts/migrate.mjs 006_demanda_metrics.sql
-- =============================================================

alter table demanda_historica add column if not exists metrics jsonb not null default '{}'::jsonb;

comment on column demanda_historica.metrics is
  'Per-hour metrics from the source Excel keyed by normalized header: disp_hora, calls_prom, semana_pas, calls_disp, total.';
