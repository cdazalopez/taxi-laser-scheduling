// Populates dispatchers.ghl_user_id by matching Supabase dispatcher emails to GHL users.
// Usage: node --env-file=.env.local scripts/sync-ghl-users.mjs
//
// Requires: GHL_API_TOKEN (Private Integration token), GHL_LOCATION_ID.
import { createClient } from "@supabase/supabase-js";

const token = process.env.GHL_API_TOKEN;
const locationId = process.env.GHL_LOCATION_ID;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!token || !locationId) throw new Error("Missing GHL_API_TOKEN or GHL_LOCATION_ID");
if (!url || !key) throw new Error("Missing Supabase env vars");

// GHL API v2: list users for the location.
const res = await fetch(`https://services.leadconnectorhq.com/users/?locationId=${locationId}`, {
  headers: {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    Accept: "application/json",
  },
});
if (!res.ok) {
  console.error(`❌ GHL API ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const body = await res.json();
const users = body.users ?? body ?? [];
const ghlByEmail = new Map();
for (const u of users) {
  if (u.email) ghlByEmail.set(String(u.email).toLowerCase().trim(), u.id);
}
console.log(`GHL usuarios: ${users.length}`);

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: dispatchers, error } = await sb.from("dispatchers").select("id, email");
if (error) throw error;

let matched = 0;
const unmatched = [];
for (const d of dispatchers) {
  const gid = d.email ? ghlByEmail.get(String(d.email).toLowerCase().trim()) : null;
  if (gid) {
    await sb.from("dispatchers").update({ ghl_user_id: gid }).eq("id", d.id);
    matched++;
  } else {
    unmatched.push(d.email);
  }
}
console.log(`✅ Mapeados ${matched}/${dispatchers.length} dispatchers a usuarios GHL.`);
if (unmatched.length) console.log(`⚠ Sin match (${unmatched.length}):`, unmatched.join(", "));
