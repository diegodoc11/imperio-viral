// Recalcula engagement_score, engagement_rate, viral_velocity y viral_score
// para todos los posts existentes, usando la fórmula actual de lib/score.ts.
//
// Para posts no-reels, intenta encontrar followers_count del autor en la
// tabla profiles (match por username) — esto permite calcular ER% con la
// fórmula (likes+comments)/followers para fotos y carruseles.
//
// Uso: npm run recompute-scores

import "dotenv/config";
import { getDb, initSchema } from "../lib/db";
import { computeScores } from "../lib/score";
import type { ApifyHashtagItem } from "../lib/types";

interface Row {
  id: string;
  raw_json: string;
  type: string;
  owner_username: string | null;
  source_profile: string | null;
  followers: number | null;
}

function main() {
  initSchema();
  const db = getDb();

  // Join con profiles para conseguir followers del autor.
  // Hacemos LEFT JOIN tanto por source_profile como por owner_username
  // (algunos posts vienen solo de hashtag pero el autor sí está trackeado).
  const rows = db
    .prepare(
      `SELECT
         p.id,
         p.raw_json,
         p.type,
         p.owner_username,
         p.source_profile,
         COALESCE(pr1.followers_count, pr2.followers_count) AS followers
       FROM posts p
       LEFT JOIN profiles pr1 ON LOWER(pr1.username) = LOWER(p.source_profile)
       LEFT JOIN profiles pr2 ON LOWER(pr2.username) = LOWER(p.owner_username)`
    )
    .all() as Row[];

  if (rows.length === 0) {
    console.log("No hay posts para recalcular.");
    return;
  }

  const update = db.prepare(`
    UPDATE posts SET
      engagement_score = :engagementScore,
      engagement_rate  = :engagementRate,
      view_rate        = :viewRate,
      viral_velocity   = :viralVelocity,
      viral_score      = :viralScore
    WHERE id = :id
  `);

  let n = 0;
  let withFollowers = 0;
  let withER = 0;
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      const item = JSON.parse(row.raw_json) as ApifyHashtagItem;
      // Para reels el ER se calcula contra views (no necesita followers).
      // Para fotos/carruseles necesitamos followers; si no, ER queda null.
      const followers = row.followers;
      if (followers != null) withFollowers++;

      const s = computeScores(item, { followersCount: followers });
      if (s.engagementRate != null) withER++;

      update.run({
        id: row.id,
        engagementScore: s.engagementScore,
        engagementRate: s.engagementRate,
        viewRate: s.viewRate,
        viralVelocity: s.viralVelocity,
        viralScore: s.viralScore,
      });
      n++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  console.log(
    `✓ Recalculados ${n} posts. ` +
      `${withFollowers} con followers conocidos, ${withER} con ER% calculado.`
  );
}

main();
