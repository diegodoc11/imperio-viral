// Inspecciona los últimos scrape runs y los items que devolvió Apify.
// Útil para ver por qué un scrape devolvió menos items de los pedidos.
//
// Uso: npm run diagnose-scrape [--limit=5]

import "dotenv/config";
import { getDb } from "../lib/db";

const limit = Number(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "10"
);

const db = getDb();
const runs = db
  .prepare(
    "SELECT * FROM scrape_runs ORDER BY started_at DESC LIMIT ?"
  )
  .all(limit) as any[];

console.log(`\nÚltimos ${runs.length} scrape runs:\n`);
for (const r of runs) {
  const startStr = new Date(r.started_at * 1000).toLocaleString("es-CO");
  const elapsed = r.finished_at ? r.finished_at - r.started_at : null;
  console.log(
    `[${r.id}] ${startStr}  ${r.hashtag ?? "—"}  → ${
      r.items_count ?? "?"
    } items en ${elapsed ?? "?"}s` + (r.error ? `  ❌ ${r.error}` : "")
  );
  if (r.apify_run_id) console.log(`    Apify run: ${r.apify_run_id}`);

  // Si es un hashtag (no profile), mostrar conteo en DB ahora
  if (r.hashtag && !r.hashtag.startsWith("profile:")) {
    const [tag, type] = r.hashtag.includes(":")
      ? r.hashtag.split(":")
      : [r.hashtag, null];
    const sqlType =
      type === "reels" ? "Video" : type === "posts" ? "Image,Sidecar" : null;
    if (sqlType) {
      const counts = db
        .prepare(
          `SELECT type, COUNT(*) AS n FROM posts
           WHERE source_hashtag = ?
             AND scraped_at >= ?
           GROUP BY type`
        )
        .all(tag, r.started_at - 60) as Array<{ type: string; n: number }>;
      console.log(
        `    En DB tras este run: ${counts
          .map((c) => `${c.type}=${c.n}`)
          .join(", ")}`
      );
    }
  }
}
console.log();
