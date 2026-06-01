// Importa la data exportada (data/export/*.json) al proyecto Supabase
// configurado en DATABASE_URL. Preserva UUIDs para mantener referencias.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const URL = process.env.DATABASE_URL;
if (!URL) {
  console.error("❌ Falta DATABASE_URL en .env");
  process.exit(1);
}

// Orden importa: respeta dependencies. scrape_runs.id es bigserial — lo
// excluimos para que PG asigne nuevos ids.
const PLAN: Array<{ table: string; excludeCols?: string[] }> = [
  { table: "workspaces" },
  { table: "niches" },
  { table: "profiles" },
  { table: "posts" },
  { table: "decisions" },
  { table: "transcriptions" },
  { table: "adaptations" },
  { table: "scrape_runs", excludeCols: ["id"] },
  { table: "jobs" },
];

function readTable(table: string): any[] {
  const file = path.resolve("data/export", `${table}.json`);
  if (!fs.existsSync(file)) {
    console.log(`  (skip ${table}: ${file} no existe)`);
    return [];
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function importTable(
  client: Client,
  table: string,
  excludeCols: string[] = []
): Promise<{ ok: number; failed: number }> {
  const rows = readTable(table);
  if (rows.length === 0) return { ok: 0, failed: 0 };

  // Detectar columnas del primer row (todas las tablas tienen mismas
  // columnas por row, asumimos schema parejo).
  const allCols = Object.keys(rows[0]).filter((c) => !excludeCols.includes(c));
  const placeholders = allCols.map((_, i) => `$${i + 1}`).join(", ");
  const colList = allCols.map((c) => `"${c}"`).join(", ");
  const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  let ok = 0;
  let failed = 0;
  const errs: string[] = [];
  for (const r of rows) {
    try {
      await client.query(sql, allCols.map((c) => r[c]));
      ok++;
    } catch (e) {
      failed++;
      if (errs.length < 3) errs.push(e instanceof Error ? e.message : String(e));
    }
  }
  console.log(`  ${table}: ${ok}/${rows.length} insertados, ${failed} fallos`);
  errs.forEach((e) => console.log(`    · ${e}`));
  return { ok, failed };
}

(async () => {
  const c = new Client({
    connectionString: URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log("Conectado al proyecto destino.\n");

  try {
    for (const step of PLAN) {
      await importTable(c, step.table, step.excludeCols);
    }
    console.log("\n✅ Import completo.");
  } finally {
    await c.end();
  }
})();
