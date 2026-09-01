-- =============================================================
-- Aggregated demand by day-of-week + hour, for staffing insights.
-- Run: node --env-file=.env.local scripts/migrate.mjs 007_demand_insights.sql
-- =============================================================

create or replace view demand_by_dow_hour as
select
  extract(dow from demand_date)::int as dow,          -- 0 = Sunday … 6 = Saturday
  hour,
  round(avg(ride_count))::int                as avg_demand,
  round(max(ride_count))::int                as max_demand,
  round(avg(nullif(dispatchers_on, 0)), 1)   as avg_staff,
  round(avg((metrics->>'calls_disp')::numeric) filter (where metrics ? 'calls_disp'), 1) as avg_load,
  count(*)                                    as samples
from demanda_historica
group by 1, 2;
