// Vuelca el JSON crudo de un post para ver qué campos devolvió Apify.
// Uso:
//   npm run dump-raw                           (último post insertado)
//   npm run dump-raw -- --idx=2                (otro)
//   npm run dump-raw -- --type=Video           (primer reel)

import "dotenv/config";
import { getDb } from "../lib/db";

const args: Record<string, string> = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)=(.*)$/);
  if (m) args[m[1]] = m[2];
}

const idx = Number(args.idx ?? "0");
const typeFilter = args.type;

const db = getDb();
const sql = typeFilter
  ? "SELECT raw_json FROM posts WHERE type = ? ORDER BY scraped_at DESC LIMIT 1 OFFSET ?"
  : "SELECT raw_json FROM posts ORDER BY scraped_at DESC LIMIT 1 OFFSET ?";

const stmt = db.prepare(sql);
const row = (typeFilter ? stmt.get(typeFilter, idx) : stmt.get(idx)) as
  | { raw_json: string }
  | undefined;

if (!row) {
  console.log("No hay posts con esos criterios.");
  process.exit(0);
}

const obj = JSON.parse(row.raw_json);
console.log("Claves:", Object.keys(obj).sort().join(", "));
console.log("\nJSON completo:\n");
console.log(JSON.stringify(obj, null, 2));
