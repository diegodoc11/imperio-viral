// Recalcula la inferencia de idioma para todos los posts.
// Útil tras mejorar la heurística (ej: añadir detección de scripts no
// latinos o francés).
//
// Uso: npm run refresh-language

import "dotenv/config";
import { getDb, initSchema } from "../lib/db";
import { inferLanguage } from "../lib/language";

function main() {
  initSchema();
  const db = getDb();

  const rows = db
    .prepare(
      "SELECT id, source_hashtag, caption FROM posts"
    )
    .all() as Array<{ id: string; source_hashtag: string | null; caption: string | null }>;

  if (rows.length === 0) {
    console.log("No hay posts.");
    return;
  }

  const update = db.prepare("UPDATE posts SET language = ? WHERE id = ?");
  const counts: Record<string, number> = {};

  db.exec("BEGIN");
  try {
    for (const r of rows) {
      const lang = inferLanguage(r.source_hashtag, r.caption);
      const key = lang ?? "null";
      counts[key] = (counts[key] ?? 0) + 1;
      update.run(lang, r.id);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  console.log(`✓ ${rows.length} posts reclasificados:`);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
}

main();
