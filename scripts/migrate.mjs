// Applies supabase/schema.sql to the Postgres database.
// Usage: node --env-file=.env.local scripts/migrate.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || "schema.sql";
const sql = readFileSync(join(__dirname, "..", "supabase", file), "utf8");
console.log(`Applying supabase/${file} …`);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DATABASE_URL in .env.local (Supabase > Settings > Database > Connection string).");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("✅ Schema applied successfully.");
} catch (err) {
  console.error("❌ Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
