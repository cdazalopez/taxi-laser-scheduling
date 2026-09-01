// Parses ALL role siglas (phone cols B-T + messaging cols U+) into role_schedule.
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";
const xlsxPath = process.argv[2] || "/Users/carlosdaza/Downloads/Horarios Taxi Laser LLC.xlsx";
const COMMIT = process.argv.includes("--commit");
const MSG_COL_START = 20; // Excel col U (0-indexed)
const MONTHS={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12};
const WEEKDAYS=["lunes","martes","miercoles","jueves","viernes","sabado","domingo"];
const norm=s=>String(s??"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim();
const isoDate=(y,m,d)=>`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
function addDays(y,m,d,n){const dt=new Date(Date.UTC(y,m-1,d+n));return{y:dt.getUTCFullYear(),m:dt.getUTCMonth()+1,d:dt.getUTCDate(),dow:dt.getUTCDay()};}
function mondayOf(name){const mm=norm(name).match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[_\s]+(\d{1,2})/);if(!mm)return null;const month=MONTHS[mm[1]],day=Number(mm[2]);for(let y=2024;y<=2027;y++)if(addDays(y,month,day,0).dow===1)return{y,month,day};return null;}
const codeToRef=cell=>{const m=String(cell??"").trim().match(/(\d{2,3})\s*$/);return m?"D"+m[1].padStart(3,"0"):null;};
function hourToNum(h){const m=norm(h).match(/(\d{1,2}):?\d{0,2}\s*(am|pm)/);if(!m)return null;let hr=Number(m[1])%12;if(m[2]==="pm")hr+=12;return hr;}
const RR=/^(NE|MC[1-6]?)$/i;
const wb=xlsx.readFile(xlsxPath);
const records=[]; const bySection={phone:{},messaging:{}};
for(const sheetName of wb.SheetNames){
  const monday=mondayOf(sheetName); if(!monday)continue;
  const rows=xlsx.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:""});
  for(let r=0;r<rows.length-1;r++){
    const dayIdx=WEEKDAYS.indexOf(norm(rows[r][0])); if(dayIdx===-1)continue;
    const hdr=rows[r+1]; if(norm(hdr[0])!=="hora")continue;
    const dd=addDays(monday.y,monday.month,monday.day,dayIdx); const date=isoDate(dd.y,dd.m,dd.d);
    const cols=[]; for(let c=1;c<hdr.length;c++){const ref=codeToRef(hdr[c]);if(ref)cols.push({c,ref});}
    for(let h=0;h<24;h++){const row=rows[r+2+h];if(!row)break;const hour=hourToNum(row[0]);if(hour===null)continue;
      for(const{c,ref}of cols){const sigla=String(row[c]??"").trim().toUpperCase();if(!sigla)continue;
        const rr=RR.test(sigla); // categorize by SIGLA, not column: NE/MC*=round-robin, MR=messaging(no RR), else phone
        const section=rr||sigla==="MR"?"messaging":"phone";
        records.push({ref,date,hour,section,sigla,in_round_robin:rr});
        bySection[section][sigla]=(bySection[section][sigla]||0)+1;}}
  }
}
console.log("siglas TELÉFONO (B-T):",JSON.stringify(bySection.phone));
console.log("siglas MENSAJERÍA (U+):",JSON.stringify(bySection.messaging));
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const{data:disp}=await sb.from("dispatchers").select("id,external_ref");
const idByRef=new Map(disp.map(d=>[d.external_ref,d.id]));
const seen=new Set(),rowsIns=[],unmatched=new Set();
for(const rec of records){const id=idByRef.get(rec.ref);if(!id){unmatched.add(rec.ref);continue;}const k=`${id}|${rec.date}|${rec.hour}`;if(seen.has(k))continue;seen.add(k);rowsIns.push({dispatcher_id:id,work_date:rec.date,hour:rec.hour,section:rec.section,sigla:rec.sigla,in_round_robin:rec.in_round_robin});}
console.log("total:",records.length,"| únicos:",rowsIns.length,"| RR:",rowsIns.filter(r=>r.in_round_robin).length,"| sin match:",[...unmatched].join(",")||"—");
if(!COMMIT){console.log("(DRY RUN — usá --commit)");process.exit(0);}
await sb.from("role_schedule").delete().neq("id","00000000-0000-0000-0000-000000000000");
let total=0;for(let i=0;i<rowsIns.length;i+=500){const{data,error}=await sb.from("role_schedule").upsert(rowsIns.slice(i,i+500),{onConflict:"dispatcher_id,work_date,hour"}).select("id");if(error){console.error(error.message);process.exit(1);}total+=data.length;}
console.log("✅ insertados",total);
