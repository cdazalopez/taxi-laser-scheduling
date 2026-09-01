import pg from "pg";
const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
await c.connect();
const LOAD = Number(process.argv[2]||15); // target calls/dispatcher for messaging
// Phone roles (A/A1/A2/MR): max distinct dispatchers per (dow,hour,sigla) across the role_schedule weeks.
const phone = `
insert into coverage_targets (dow,hour,role,target,source)
select extract(dow from work_date)::int dow, hour, sigla,
       max(cnt)::int, 'derived:history'
from (
  select work_date, hour, sigla, count(distinct dispatcher_id) cnt
  from role_schedule where sigla in ('A','A1','A2','MR') group by 1,2,3
) t group by 1,2,3
on conflict (dow,hour,role) do update set target=excluded.target, source=excluded.source, updated_at=now()
where coverage_targets.edited=false;`;
const p=await c.query(phone);
// Messaging (msg): ceil(avg_demand / target_load) from demand_by_dow_hour.
const msg = `
insert into coverage_targets (dow,hour,role,target,source)
select dow, hour, 'msg', greatest(0, ceil(avg_demand::numeric/${LOAD}))::int, 'derived:demand'
from demand_by_dow_hour
on conflict (dow,hour,role) do update set target=excluded.target, source=excluded.source, updated_at=now()
where coverage_targets.edited=false;`;
const mq=await c.query(msg);
console.log("phone rows:",p.rowCount,"| msg rows:",mq.rowCount);
// sample: Saturday (6) peak hours
const{rows}=await c.query(`select hour, role, target from coverage_targets where dow=6 and hour in (3,9,15,20) order by hour, role`);
const by={}; for(const r of rows){(by[r.hour]=by[r.hour]||{})[r.role]=r.target;}
console.log("Sábado cupos por hora (role:target):");
for(const h of [3,9,15,20]) console.log('  '+String(h).padStart(2)+'h:',JSON.stringify(by[h]||{}));
await c.end();
