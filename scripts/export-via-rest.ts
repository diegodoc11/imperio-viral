// Extrae toda la data del proyecto Supabase via REST API (PostgREST) usando
// service_role key. Sirve cuando el password de la DB se rompió y no
// podemos usar pg directo.
//
// Guarda cada tabla como JSON en data/export/<table>.json

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

// posts tiene raw_json pesado — pagesize chico para no timeoutear PostgREST
const TABLES: Array<[string, number]> = [
  ["workspaces", 1000],
  ["niches", 1000],
  ["workspace_members", 1000],
  ["profiles", 500],
  ["posts", 100],
  ["decisions", 1000],
  ["transcriptions", 1000],
  ["adaptations", 1000],
  ["scrape_runs", 1000],
  ["jobs", 1000],
];

async function fetchTable(table: string, pageSize: number): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${URL}/rest/v1/${table}?select=*&limit=${pageSize}&offset=${offset}`,
      {
        headers: {
          apikey: KEY!,
          Authorization: `Bearer ${KEY}`,
          "Content-Profile": "public",
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${table}: HTTP ${res.status} — ${body}`);
    }
    const rows = (await res.json()) as any[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

(async () => {
  const outDir = path.resolve("data/export");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Exportando data desde ${URL}\n`);
  for (const [t, ps] of TABLES) {
    try {
      const rows = await fetchTable(t, ps);
      const file = path.join(outDir, `${t}.json`);
      fs.writeFileSync(file, JSON.stringify(rows, null, 2));
      console.log(`  ✅ ${t}: ${rows.length} filas → ${file}`);
    } catch (e) {
      console.log(`  ❌ ${t}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\n✅ Export completo en ${outDir}`);
})();
