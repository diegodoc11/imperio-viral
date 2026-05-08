// Baselines por perfil + clasificación de viralidad relativa.
//
// Ventanas temporales (configurables):
//   baselineWindowDays  (default 180) — mediana se calcula sobre los posts
//                                       publicados en este rango. Sample
//                                       grande → mediana estable, no
//                                       contaminada por contenido viejo.
//   activeWindowDays    (default 365) — posts más viejos que esta ventana
//                                       se consideran "histórico". Sus
//                                       multiplier y tier se limpian a NULL,
//                                       así no aparecen en rankings ni en
//                                       la app.
//
// Tiers (escala del experto):
//   2-5x   → 🟢 good       (buen performance)
//   5-10x  → 🥉 viral      (viral del perfil)
//   10-25x → 🥈 gem        (joya viral)
//   25-50x → 🥇 diamond    (diamante)
//   50x+   → 💎 unicorn    (unicornio)

import { getDb } from "./db";
import type { ViralTier } from "./types";

const DAY = 86400; // segundos
export const DEFAULT_BASELINE_WINDOW_DAYS = 180;
export const DEFAULT_ACTIVE_WINDOW_DAYS = 365;

export function classifyTier(multiplier: number | null): ViralTier | null {
  if (multiplier == null || multiplier < 2) return null;
  if (multiplier < 5) return "good";
  if (multiplier < 10) return "viral";
  if (multiplier < 25) return "gem";
  if (multiplier < 50) return "diamond";
  return "unicorn";
}

export const TIER_LABEL: Record<ViralTier, string> = {
  good: "🟢 good",
  viral: "🥉 viral",
  gem: "🥈 gem",
  diamond: "🥇 diamond",
  unicorn: "💎 unicorn",
};

function median(values: number[]): number | null {
  const xs = values.filter((v) => v != null && Number.isFinite(v)).sort(
    (a, b) => a - b
  );
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

export interface BaselineOptions {
  baselineWindowDays?: number;
  activeWindowDays?: number;
}

export interface BaselineResult {
  username: string;
  baselineSampleSize: number; // cuántos posts entraron al cálculo de mediana
  activePostsCount: number;   // cuántos posts caen en la ventana activa
  medianEngagementScore: number | null;
  medianEngagementRate: number | null;
  medianViews: number | null;
  taggedPosts: number;
}

export function recomputeProfileBaseline(
  username: string,
  options: BaselineOptions = {}
): BaselineResult {
  const db = getDb();
  const u = username.toLowerCase();

  const baselineDays = options.baselineWindowDays ?? DEFAULT_BASELINE_WINDOW_DAYS;
  const activeDays = options.activeWindowDays ?? DEFAULT_ACTIVE_WINDOW_DAYS;

  const now = Math.floor(Date.now() / 1000);
  const baselineCutoff = now - baselineDays * DAY;
  const activeCutoff = now - activeDays * DAY;

  // 1. Calcular mediana sobre los posts del baseline (últimos N días).
  const baselineRows = db
    .prepare(
      `SELECT engagement_score, engagement_rate,
              COALESCE(video_view_count, video_play_count) AS plays
       FROM posts
       WHERE source_profile = ? AND posted_at > ?`
    )
    .all(u, baselineCutoff) as Array<{
    engagement_score: number | null;
    engagement_rate: number | null;
    plays: number | null;
  }>;

  const medES = median(
    baselineRows.map((r) => r.engagement_score ?? 0).filter((v) => v > 0)
  );
  const medER = median(
    baselineRows
      .map((r) => r.engagement_rate)
      .filter((v): v is number => v != null && v > 0)
  );
  const medViews = median(
    baselineRows
      .map((r) => r.plays)
      .filter((v): v is number => v != null && v > 0)
  );

  db.prepare(
    `UPDATE profiles SET
       median_engagement_score = ?,
       median_engagement_rate  = ?,
       median_views            = ?
     WHERE username = ?`
  ).run(medES, medER, medViews, u);

  // 2. Limpiar multiplier/tier de posts viejos (>activeCutoff).
  db.prepare(
    `UPDATE posts
     SET viralidad_multiplier = NULL, viral_tier = NULL
     WHERE source_profile = ? AND posted_at <= ?`
  ).run(u, activeCutoff);

  // 3. Calcular multiplier y tier para los posts activos.
  const activeRows = db
    .prepare(
      `SELECT id, engagement_score
       FROM posts
       WHERE source_profile = ? AND posted_at > ?`
    )
    .all(u, activeCutoff) as Array<{
    id: string;
    engagement_score: number | null;
  }>;

  const updateStmt = db.prepare(
    `UPDATE posts SET viralidad_multiplier = ?, viral_tier = ? WHERE id = ?`
  );

  let tagged = 0;
  db.exec("BEGIN");
  try {
    for (const r of activeRows) {
      let mult: number | null = null;
      if (medES && medES > 0 && r.engagement_score != null) {
        mult = r.engagement_score / medES;
      }
      const tier = classifyTier(mult);
      updateStmt.run(mult, tier, r.id);
      if (tier) tagged++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  return {
    username: u,
    baselineSampleSize: baselineRows.length,
    activePostsCount: activeRows.length,
    medianEngagementScore: medES,
    medianEngagementRate: medER,
    medianViews: medViews,
    taggedPosts: tagged,
  };
}
