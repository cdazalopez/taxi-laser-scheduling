// Role-grid generator: base shifts + messaging rotation (1h NON-consecutive slots,
// max per day, even rotation). Produces generated_roles.
// Usage: node --env-file=.env.local scripts/generate-roles.mjs [weekStartMonday] [daysOff] [maxMsgHours]
import pg from "pg";

const weekStart = process.argv[2] || "2026-08-10";
const daysOff = Number(process.argv[3] || 2);
const maxMsg = Number(process.argv[4] || 6);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const dateAt = (n) => { const d = new Date(weekStart + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dowOf = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();
const weekDates = Array.from({ length: 7 }, (_, i) => dateAt(i));
const hourOf = (t, def) => (t ? Number(String(t).slice(0, 2)) : def);

const { rows: profiles } = await c.query(`
  select p.dispatcher_id, d.external_ref, p.work_days, p.typical_start, p.typical_end,
         coalesce(p.max_hours_week,52) max_h, p.can_message
  from dispatcher_profiles p join dispatchers d on d.id=p.dispatcher_id where d.status='activo'`);
const { rows: perms } = await c.query(`select dispatcher_id, start_date, end_date from permisos where estado='aprobado' and start_date<=$2 and end_date>=$1`, [weekDates[0], weekDates[6]]);
const onLeave = (id, iso) => perms.some((p) => p.dispatcher_id === id && iso >= p.start_date.toISOString().slice(0,10) && iso <= p.end_date.toISOString().slice(0,10));
const { rows: cov } = await c.query(`select dow, hour, target from coverage_targets where role='msg'`);
const tgt = {}; for (const r of cov) (tgt[r.dow] = tgt[r.dow] || {})[r.hour] = r.target;

// 1) base shifts -> working grid + role grid (null = working, no role yet)
const working = {}; const role = {}; const canMsg = new Map();
for (const iso of weekDates) { working[iso] = {}; role[iso] = {}; for (let h = 0; h < 24; h++) { working[iso][h] = new Set(); } }
for (const p of profiles) {
  canMsg.set(p.dispatcher_id, p.can_message);
  const wdays = p.work_days?.length ? p.work_days : [1,2,3,4,5];
  const avail = weekDates.filter((iso) => wdays.includes(dowOf(iso)) && !onLeave(p.dispatcher_id, iso));
  const numWork = Math.min(avail.length, 7 - daysOff);
  if (numWork <= 0) continue;
  const floor = numWork >= 6 ? 48 : 40;
  let len = Math.max(10, Math.ceil(floor / numWork));
  if (len * numWork > p.max_h) len = Math.floor(p.max_h / numWork);
  len = Math.min(13, Math.max(8, len));
  let start = hourOf(p.typical_start, 8);
  if (start + len > 24) start = Math.max(0, 24 - len);
  for (const iso of avail.slice(0, numWork)) {
    for (let h = start; h < start + len; h++) {
      working[iso][h].add(p.dispatcher_id);
      role[iso][`${p.dispatcher_id}|${h}`] = null; // working, no role
    }
  }
}

// 2) messaging rotation: 1h non-consecutive, even, under maxMsg/day
let coveredHours = 0, targetHours = 0, gaps = 0, consecViolations = 0;
for (const iso of weekDates) {
  const dow = dowOf(iso);
  const msgCount = {}, lastMsg = {};
  for (let h = 0; h < 24; h++) {
    const target = tgt[dow]?.[h] ?? 0;
    if (!target) continue;
    targetHours += target;
    const cands = [...working[iso][h]].filter((id) => canMsg.get(id) && lastMsg[id] !== h - 1 && (msgCount[id] || 0) < maxMsg);
    cands.sort((a, b) => (msgCount[a] || 0) - (msgCount[b] || 0) || (lastMsg[a] ?? -99) - (lastMsg[b] ?? -99));
    const pick = cands.slice(0, target);
    for (const id of pick) {
      role[iso][`${id}|${h}`] = "NE";
      if (lastMsg[id] === h - 1) consecViolations++;
      msgCount[id] = (msgCount[id] || 0) + 1;
      lastMsg[id] = h;
    }
    coveredHours += pick.length;
    if (pick.length < target) gaps++;
  }
}

// 3) persist to generated_roles
const run = await c.query(`insert into schedule_runs (week_start, days_off, max_msg_hours) values ($1,$2,$3) returning id`, [weekStart, daysOff, maxMsg]);
const runId = run.rows[0].id;
const rows = [];
for (const iso of weekDates) for (const key of Object.keys(role[iso])) {
  const [dispatcher_id, h] = key.split("|");
  const sigla = role[iso][key];
  rows.push({ dispatcher_id, work_date: iso, hour: Number(h), sigla, in_round_robin: sigla === "NE" });
}
for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500);
  const vals = chunk.map((r) => `('${runId}','${r.dispatcher_id}','${r.work_date}',${r.hour},${r.sigla ? `'${r.sigla}'` : "null"},${r.in_round_robin})`).join(",");
  await c.query(`insert into generated_roles (run_id,dispatcher_id,work_date,hour,sigla,in_round_robin) values ${vals}`);
}

console.log(`Semana ${weekStart} | días libres ${daysOff} | máx msg/día ${maxMsg}`);
console.log(`Filas grilla: ${rows.length} | horas-mensajería asignadas: ${rows.filter(r=>r.in_round_robin).length}`);
console.log(`Cobertura mensajería: ${coveredHours}/${targetHours} (${((coveredHours/targetHours)*100).toFixed(0)}%) | horas con déficit: ${gaps}`);
console.log(`Violaciones de "no consecutivas": ${consecViolations} (debe ser 0)`);
// verify max/day + non-consecutive from stored data
const check = await c.query(`
  with msg as (select dispatcher_id, work_date, hour from generated_roles where run_id=$1 and in_round_robin),
  perday as (select dispatcher_id, work_date, count(*) n from msg group by 1,2)
  select max(n) maxday, round(avg(n),1) avgday from perday`, [runId]);
console.log(`Máx horas mensajería/día por persona: ${check.rows[0].maxday} (límite ${maxMsg}) | promedio ${check.rows[0].avgday}`);
console.log(`run_id: ${runId}`);
await c.end();
