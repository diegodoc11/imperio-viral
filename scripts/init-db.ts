// Crea/actualiza el schema de SQLite y rellena campos faltantes.
// Uso: npm run init-db

import "dotenv/config";
import { getDb, initSchema } from "../lib/db";
import { inferLanguage } from "../lib/language";

function backfillLanguage(): number {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, source_hashtag, caption FROM posts WHERE language IS NULL"
    )
    .all() as Array<{
    id: string;
    source_hashtag: string | null;
    caption: string | null;
  }>;

  if (rows.length === 0) return 0;

  const update = db.prepare("UPDATE posts SET language = ? WHERE id = ?");
  let n = 0;
  db.exec("BEGIN");
  try {
    for (const r of rows) {
      const lang = inferLanguage(r.source_hashtag, r.caption);
      if (lang) {
        update.run(lang, r.id);
        n++;
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return n;
}

function main() {
  initSchema();
  const filled = backfillLanguage();
  if (filled > 0) {
    console.log(`Backfill: ${filled} post(s) actualizados con idioma.`);
  }

  const db = getDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>;

  console.log("\nDB lista. Tablas:");
  for (const t of tables) {
    if (t.name === "sqlite_sequence") continue;
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`)
      .get() as { n: number };
    console.log(`  - ${t.name}: ${count.n} filas`);
  }
}

main();
