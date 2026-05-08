// "Heat" relativo al hashtag para fotos y carruseles que NO tienen
// engagement_rate (Instagram no expone views públicas para no-reels).
//
// Lógica: para cada (hashtag, type), calculamos la mediana de
// engagement_score. Cada post recibe un multiplicador relativo y un tier:
//
//   <2×    → null (sin badge — performance bajo dentro del hashtag)
//   2-5×   → 🔥 tibio
//   5-10×  → 🔥🔥 caliente
//   10×+   → 🔥🔥🔥 explosivo
//
// Solo aplica a posts que vinieron de hashtag scrape. Se almacena en
// columnas hashtag_heat_mult y hashtag_heat_tier.

import { getDb } from "./db";
import type { HeatLevel } from "./queries";

const HEAT_TIER_THRESHOLDS: Array<{ min: number; tier: HeatLevel }> = [
  { min: 10, tier: "explosivo" },
  { min: 5, tier: "caliente" },
  { min: 2, tier: "tibio" },
];

function median(values: number[]): number | null {
  const xs = values.filter((v) => v != null && Number.isFinite(v)).sort(
    (a, b) => a - b
  );
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

function classify(mult: number): HeatLevel | null {
  for (const t of HEAT_TIER_THRESHOLDS) {
    if (mult >= t.min) return t.tier;
  }
  return null;
}

export interface HashtagHeatResult {
  hashtag: string;
  byType: Record<string, { median: number | null; tagged: number }>;
}

export function recomputeHashtagHeat(hashtag: string): HashtagHeatResult {
  const db = getDb();
  const tag = hashtag.toLowerCase();

  const byType: HashtagHeatResult["byType"] = {};

  // Computamos por tipo (Image, Sidecar, Video) por separado, así un
  // carrusel se compara solo contra otros carruseles del mismo hashtag.
  for (const type of ["Image", "Sidecar", "Video"]) {
    const rows = db
      .prepare(
        `SELECT id, engagement_score
         FROM posts
         WHERE source_hashtag = ? AND type = ?
           AND engagement_score IS NOT NULL`
      )
      .all(tag, type) as Array<{ id: string; engagement_score: number }>;

    if (rows.length === 0) {
      byType[type] = { median: null, tagged: 0 };
      continue;
    }

    const scores = rows.map((r) => r.engagement_score).filter((s) => s > 0);
    const med = median(scores);

    if (!med || med === 0) {
      // Limpiar tier si no podemos calcular
      db.prepare(
        `UPDATE posts SET hashtag_heat_mult = NULL, hashtag_heat_tier = NULL
         WHERE source_hashtag = ? AND type = ?`
      ).run(tag, type);
      byType[type] = { median: null, tagged: 0 };
      continue;
    }

    const update = db.prepare(
      `UPDATE posts SET hashtag_heat_mult = ?, hashtag_heat_tier = ?
       WHERE id = ?`
    );

    let tagged = 0;
    db.exec("BEGIN");
    try {
      for (const r of rows) {
        const mult = r.engagement_score / med;
        const tier = classify(mult);
        update.run(mult, tier, r.id);
        if (tier) tagged++;
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }

    byType[type] = { median: med, tagged };
  }

  return { hashtag: tag, byType };
}

// Recalcula para todos los hashtags ya scrapeados.
export function recomputeAllHashtagHeat(): HashtagHeatResult[] {
  const db = getDb();
  const tags = db
    .prepare(
      "SELECT DISTINCT source_hashtag FROM posts WHERE source_hashtag IS NOT NULL"
    )
    .all() as Array<{ source_hashtag: string }>;
  return tags.map((t) => recomputeHashtagHeat(t.source_hashtag));
}
