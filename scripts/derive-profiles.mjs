import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const sql = `
with per_shift as (
  select dispatcher_id, shift_date, date_trunc('week', shift_date) wk,
         extract(epoch from (shift_end - shift_start))/3600.0 hrs, shift_start, shift_end
  from schedule),
daily as (  -- one working window per (dispatcher, day)
  select dispatcher_id, shift_date, extract(dow from shift_date)::int dow, date_trunc('week',shift_date) wk,
         min(shift_start) ds, max(shift_end) de, sum(hrs) day_hrs
  from per_shift group by 1,2,3,4),
weekly as (select dispatcher_id, wk, sum(day_hrs) wk_hrs from daily group by 1,2),
agg as (
  select dispatcher_id, count(distinct wk) n_weeks, avg(wk_hrs) avg_wk,
         percentile_cont(0.9) within group (order by wk_hrs) p90_wk
  from weekly group by 1),
dowc as (select dispatcher_id, dow, count(distinct shift_date) days_on from daily group by 1,2),
wdays as (select d.dispatcher_id, array_agg(d.dow order by d.dow) work_days
          from dowc d join agg a on a.dispatcher_id=d.dispatcher_id
          where d.days_on::numeric/nullif(a.n_weeks,0) >= 0.4 group by 1),
typ as (select dispatcher_id, mode() within group (order by ds) ts, mode() within group (order by de) te from daily group by 1)
insert into dispatcher_profiles
 (dispatcher_id, avg_hours_week, weeks_sampled, work_days, typical_start, typical_end, employment, max_hours_week, min_hours_week, can_message, updated_at)
select a.dispatcher_id, round(a.avg_wk::numeric,1), a.n_weeks, coalesce(wd.work_days,'{}'), t.ts, t.te,
  case when a.avg_wk>=35 then 'full_time' else 'part_time' end,
  least(60, ceil(a.p90_wk))::int, round(a.avg_wk*0.8)::int,
  exists(select 1 from messaging_schedule ms where ms.dispatcher_id=a.dispatcher_id), now()
from agg a
left join wdays wd on wd.dispatcher_id=a.dispatcher_id
left join typ t on t.dispatcher_id=a.dispatcher_id
on conflict (dispatcher_id) do update set
  avg_hours_week=excluded.avg_hours_week, weeks_sampled=excluded.weeks_sampled, work_days=excluded.work_days,
  typical_start=excluded.typical_start, typical_end=excluded.typical_end, employment=excluded.employment,
  max_hours_week=excluded.max_hours_week, min_hours_week=excluded.min_hours_week, can_message=excluded.can_message, updated_at=now()
where dispatcher_profiles.edited = false;`;
const res = await c.query(sql);
console.log("perfiles:", res.rowCount);
const { rows } = await c.query(`select d.external_ref, d.full_name, p.employment, p.avg_hours_week, p.max_hours_week, p.work_days, p.typical_start, p.typical_end, p.can_message from dispatcher_profiles p join dispatchers d on d.id=p.dispatcher_id where d.status='activo' order by p.avg_hours_week desc nulls last limit 10`);
const DOW=['D','L','M','X','J','V','S'];
for (const r of rows) console.log(`  ${r.external_ref} ${r.full_name.slice(0,20).padEnd(20)} ${(r.employment||'?').padEnd(9)} ~${r.avg_hours_week}h (máx ${r.max_hours_week}) | ${(r.work_days||[]).map(d=>DOW[d]).join('')} | ${String(r.typical_start||'').slice(0,5)}-${String(r.typical_end||'').slice(0,5)} | msg:${r.can_message?'sí':'no'}`);
await c.end();
