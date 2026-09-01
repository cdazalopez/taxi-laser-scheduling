// Automatic schedule generator (Fase B v2 — greedy optimizer).
// Each dispatcher works their typical days; the SHIFT START is chosen within their
// availability window to cover the hours with the most unmet messaging demand.
// Usage: node --env-file=.env.local scripts/generate-schedule.mjs [weekStartMonday] [daysOff]
import pg from "pg";

const weekStart = process.argv[2] || "2026-08-10";
const daysOff = Number(process.argv[3] || 2);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const dateAt = (n) => { const d = new Date(weekStart + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dowOf = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();
const weekDates = Array.from({ length: 7 }, (_, i) => dateAt(i));

const { rows: profiles } = await c.query(`
  select p.dispatcher_id, d.external_ref, p.work_days, p.typical_start, p.typical_end,
         coalesce(p.max_hours_week,52) max_h, p.can_message
  from dispatcher_profiles p join dispatchers d on d.id=p.dispatcher_id where d.status='activo'`);
const { rows: perms } = await c.query(`select dispatcher_id, start_date, end_date from permisos where estado='aprobado' and start_date <= $2 and end_date >= $1`, [weekDates[0], weekDates[6]]);
const onLeave = (id, iso) => perms.some((p) => p.dispatcher_id === id && iso >= p.start_date.toISOString().slice(0,10) && iso <= p.end_date.toISOString().slice(0,10));
const { rows: cov } = await c.query(`select dow, hour, target from coverage_targets where role='msg'`);
const tgt = {}; for (const r of cov) (tgt[r.dow] = tgt[r.dow] || {})[r.hour] = r.target;

// remaining messaging need per (date, hour)
const need = {}; const target = {};
for (const iso of weekDates) { need[iso] = {}; target[iso] = {}; for (let h = 0; h < 24; h++) { const t = tgt[dowOf(iso)]?.[h] ?? 0; need[iso][h] = t; target[iso][h] = t; } }

const hourOf = (t, def) => (t ? Number(String(t).slice(0, 2)) : def);
// process messaging-capable first (they fill the msg need)
profiles.sort((a, b) => (b.can_message === a.can_message ? 0 : b.can_message ? 1 : -1));

const shifts = [];
for (const p of profiles) {
  const wdays = p.work_days && p.work_days.length ? p.work_days : [1,2,3,4,5];
  const avail = weekDates.filter((iso) => wdays.includes(dowOf(iso)) && !onLeave(p.dispatcher_id, iso));
  const numWork = Math.min(avail.length, 7 - daysOff);
  if (numWork <= 0) continue;
  const floor = numWork >= 6 ? 48 : 40;
  let len = Math.max(10, Math.ceil(floor / numWork));
  if (len * numWork > p.max_h) len = Math.floor(p.max_h / numWork);
  len = Math.min(13, Math.max(8, len));
  const wStart = hourOf(p.typical_start, 8);
  const wEnd = Math.min(24, Math.max(wStart + len, hourOf(p.typical_end, wStart + len)));
  const latest = Math.max(wStart, Math.min(wEnd - len, 24 - len));

  for (const iso of avail.slice(0, numWork)) {
    let start = wStart;
    if (p.can_message) {
      // choose start covering the most remaining need
      let best = -1;
      for (let s = wStart; s <= latest; s++) {
        let val = 0; for (let h = s; h < s + len; h++) val += Math.max(0, need[iso][h] ?? 0);
        if (val > best) { best = val; start = s; }
      }
      for (let h = start; h < start + len; h++) if (need[iso][h] > 0) need[iso][h]--;
    }
    shifts.push({ dispatcher_id: p.dispatcher_id, work_date: iso, start_hour: start, end_hour: start + len, role_hint: p.can_message ? "msg" : "phone" });
  }
}

// coverage
let th = 0, ch = 0, gaps = [];
for (const iso of weekDates) for (let h = 0; h < 24; h++) {
  const t = target[iso][h]; if (!t) continue;
  const covered = t - need[iso][h];
  th += t; ch += covered;
  if (covered < t) gaps.push({ iso, h, t, covered });
}

const run = await c.query(`insert into schedule_runs (week_start, days_off) values ($1,$2) returning id`, [weekStart, daysOff]);
const runId = run.rows[0].id;
if (shifts.length) {
  const vals = shifts.map((s) => `('${runId}','${s.dispatcher_id}','${s.work_date}',${s.start_hour},${s.end_hour},'${s.role_hint}')`).join(",");
  await c.query(`insert into generated_shifts (run_id,dispatcher_id,work_date,start_hour,end_hour,role_hint) values ${vals}`);
}
const nd = new Set(shifts.map((s) => s.dispatcher_id)).size;
const totalHrs = shifts.reduce((a, s) => a + (s.end_hour - s.start_hour), 0);
console.log(`Semana ${weekStart} | días libres ${daysOff}`);
console.log(`Turnos: ${shifts.length} | dispatchers: ${nd} | horas totales: ${totalHrs} (~${(totalHrs/nd).toFixed(1)}/persona)`);
console.log(`Cobertura mensajería: ${ch}/${th} (${((ch/th)*100).toFixed(0)}%) | slots con déficit: ${gaps.length}`);
console.log(`Peores déficits:`, gaps.sort((a,b)=>(b.t-b.covered)-(a.t-a.covered)).slice(0,6).map(g=>`${g.iso}(dow${dowOf(g.iso)}) ${g.h}h ${g.covered}/${g.t}`).join(" | "));
console.log(`run_id: ${runId}`);
await c.end();
