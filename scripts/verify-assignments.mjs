// Audits assignment_log against role_schedule: did each assignment land on a
// dispatcher who was actually IN their messaging slot (in_round_robin) at that hour?
// Usage: node --env-file=.env.local scripts/verify-assignments.mjs [days]
import pg from "pg";

const days = Number(process.argv[2] || 7);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DATABASE_URL in .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows } = await client.query(
  `
  with tz as (select coalesce(schedule_tz, 'America/Chicago') as z from app_settings where id),
  al as (
    select
      l.id, l.created_at, l.outcome, l.channel, l.contact_name,
      l.dispatcher_id, d.full_name,
      (l.created_at at time zone (select z from tz))::date        as work_date,
      extract(hour from (l.created_at at time zone (select z from tz)))::smallint as hour
    from assignment_log l
    join dispatchers d on d.id = l.dispatcher_id
    where l.outcome in ('assigned', 'reassigned')
      and l.dispatcher_id is not null
      and l.created_at > now() - ($1 || ' days')::interval
  )
  select
    al.*,
    exists(
      select 1 from role_schedule rs
      where rs.dispatcher_id = al.dispatcher_id
        and rs.work_date = al.work_date
        and rs.hour = al.hour
        and rs.in_round_robin = true
    ) as in_schedule,
    (select rs2.sigla from role_schedule rs2
      where rs2.dispatcher_id = al.dispatcher_id
        and rs2.work_date = al.work_date
        and rs2.hour = al.hour
      limit 1) as sigla_at_hour
  from al
  order by al.created_at desc
  `,
  [days]
);
await client.end();

const total = rows.length;
const bad = rows.filter((r) => !r.in_schedule);
const ok = total - bad.length;

console.log(`\nAsignaciones (outcome assigned/reassigned) últimos ${days} días: ${total}`);
console.log(`  ✅ en horario:       ${ok}`);
console.log(`  ❌ fuera de horario: ${bad.length}`);

if (bad.length) {
  console.log(`\n--- Fuera de horario (dispatcher no estaba en round-robin esa hora) ---`);
  for (const r of bad) {
    const when = new Date(r.created_at).toISOString().replace("T", " ").slice(0, 16);
    console.log(
      `  ${when}Z  ${r.full_name.padEnd(22)}  fecha=${r.work_date} h=${String(r.hour).padStart(2, "0")}  ` +
        `sigla=${r.sigla_at_hour ?? "(sin fila)"}  ${r.outcome}  ${r.channel ?? ""}  ${r.contact_name ?? ""}`
    );
  }
}

// Breakdown por dispatcher.
const byDisp = new Map();
for (const r of rows) {
  const e = byDisp.get(r.full_name) || { ok: 0, bad: 0 };
  r.in_schedule ? e.ok++ : e.bad++;
  byDisp.set(r.full_name, e);
}
console.log(`\n--- Por dispatcher (en horario / fuera) ---`);
for (const [name, e] of [...byDisp.entries()].sort((a, b) => b[1].bad - a[1].bad)) {
  console.log(`  ${name.padEnd(24)}  ✅ ${String(e.ok).padStart(3)}   ❌ ${e.bad}`);
}
console.log("");
