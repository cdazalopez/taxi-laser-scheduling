-- =============================================================
-- Add raw GHL payload column to assignment_log and contact meta
-- columns to active_assignments so the live view has full context.
-- Run: node --env-file=.env.local scripts/migrate.mjs 020_raw_payload_contact_meta.sql
-- =============================================================

alter table assignment_log add column if not exists raw jsonb;

alter table active_assignments add column if not exists contact_name text;
alter table active_assignments add column if not exists channel text;
