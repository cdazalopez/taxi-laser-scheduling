-- =============================================================
-- Capture contact name + channel on each assignment, for the live view.
-- Run: node --env-file=.env.local scripts/migrate.mjs 008_assignment_log_contact.sql
-- =============================================================

alter table assignment_log add column if not exists contact_name text;
alter table assignment_log add column if not exists channel text;
alter table assignment_log add column if not exists contact_id text;
