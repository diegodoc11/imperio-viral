// "Enriquecimiento" de followers para autores descubiertos vía hashtag.
//
// Caso de uso: identificar joyas ocultas — cuentas pequeñas con reels que
// están explotando. Para eso necesitamos `followersCount` del autor, que
// no viene en hashtag scrapes. Solución: scrape de "details" (metadata
// solo) que es muy barato (~$0.003 por autor).
//
// Filtro de candidatos: usamos VIEW_RATE (engagement / views), NO el ER
// estándar — porque el ER estándar requiere followers, que es justo lo
// que estamos intentando obtener. Lógica circular si filtramos por ER.
// view_rate funciona porque es nativo del reel (tenemos views siempre).
//
// Una vez enriquecido el autor, recalculamos su ER real (por followers).

import { runProfileDetailsScrape } from "./apify";
import { recomputeAllHashtagHeat } from "./hashtag-heat";
import { recomputeProfileBaseline } from "./baseline";
import { getDb } from "./db";
import { upsertProfile } from "./persist";
import type { HeatLevel } from "./queries";

// Umbrales de ER% que coinciden con classifyHeat()
const HEAT_MIN_ER: Record<HeatLevel, number> = {
  fresco: 1,
  tibio: 3,
  caliente: 6,
  explosivo: 9,
};

export interface EnrichmentCandidate {
  username: string;
  reelCount: number;
  bestEr: number;
}

// Devuelve usernames únicos de autores de reels cuyo VIEW_RATE >= umbral,
// y que NO están todavía en la tabla profiles. Usamos view_rate (no
// engagement_rate) porque el ER estándar requiere followers — que es
// precisamente lo que estamos a punto de obtener vía enriquecimiento.
//
// Umbrales en view_rate (engagement / views) son DISTINTOS de los del ER
// estándar (engagement / followers). En view_rate, 5%+ ya es contenido
// con buena interacción dentro de los que vieron.
export function getEnrichmentCandidates(
  minHeat: HeatLevel = "caliente"
): EnrichmentCandidate[] {
  const db = getDb();
  const minER = HEAT_MIN_ER[minHeat];

  const rows = db
    .prepare(
      `SELECT
         p.owner_username AS username,
         COUNT(*)         AS reel_count,
         MAX(p.view_rate) AS best_er
       FROM posts p
       LEFT JOIN profiles pr ON LOWER(pr.username) = LOWER(p.owner_username)
       WHERE p.type = 'Video'
         AND p.view_rate >= ?
         AND p.owner_username IS NOT NULL
         AND p.owner_username != ''
         AND pr.username IS NULL
       GROUP BY p.owner_username
       ORDER BY best_er DESC`
    )
    .all(minER) as Array<{ username: string; reel_count: number; best_er: number }>;

  return rows.map((r) => ({
    username: r.username,
    reelCount: r.reel_count,
    bestEr: r.best_er,
  }));
}

export interface EnrichmentResult {
  enriched: number; // datos reales de Apify
  stubbed: number;  // Apify no devolvió data — guardamos stub para no reintentar
  failed: number;
  apifyRunId: string;
  affectedPosts: number;
}

export async function enrichProfiles(
  usernames: string[]
): Promise<EnrichmentResult> {
  if (usernames.length === 0) {
    return {
      enriched: 0,
      stubbed: 0,
      failed: 0,
      apifyRunId: "",
      affectedPosts: 0,
    };
  }

  const result = await runProfileDetailsScrape({ usernames });
  const scrapedAt = Math.floor(Date.now() / 1000);

  // Indexar lo que Apify SÍ devolvió, por username (lowercase).
  const returned = new Map<string, any>();
  for (const item of result.items) {
    if (item.username) {
      returned.set(item.username.toLowerCase(), item);
    }
  }

  let enriched = 0;
  let stubbed = 0;
  let failed = 0;

  // Iterar sobre los que pedimos (no sobre lo que Apify devolvió). Para los
  // que NO recibimos data (cuenta privada, banned, deleted...), creamos un
  // stub: profile con followers=null pero existente en la tabla. Así el
  // siguiente getEnrichmentCandidates ya no los considera "no enriquecidos"
  // y se acaba el bucle de "faltan X".
  for (const requested of usernames) {
    const key = requested.toLowerCase();
    const item = returned.get(key);
    try {
      if (item) {
        upsertProfile({
          username: key,
          fullName: item.fullName ?? null,
          bio: item.biography ?? null,
          followersCount: item.followersCount ?? null,
          followingCount: item.followsCount ?? null,
          postsCount: item.postsCount ?? null,
          profilePicUrl: item.profilePicUrlHD ?? item.profilePicUrl ?? null,
          isVerified: typeof item.verified === "boolean" ? item.verified : null,
          language: null,
          medianEngagementScore: null,
          medianEngagementRate: null,
          medianViews: null,
          scrapedAt,
        });
        enriched++;
      } else {
        // Stub: marca explícita de "intentamos, no se pudo".
        upsertProfile({
          username: key,
          fullName: null,
          bio: "[no enriquecido — cuenta privada, eliminada o sin acceso]",
          followersCount: null,
          followingCount: null,
          postsCount: null,
          profilePicUrl: null,
          isVerified: null,
          language: null,
          medianEngagementScore: null,
          medianEngagementRate: null,
          medianViews: null,
          scrapedAt,
        });
        stubbed++;
      }
    } catch (e) {
      console.error("enrich error:", e);
      failed++;
    }
  }

  // Tras enriquecer, recomputar scores para que los posts no-reels de
  // estos autores ahora tengan engagement_rate (necesitaba followers).
  const affectedPosts = recomputeScoresForOwners(usernames);

  // También recompute baselines y heat de hashtag por si cambian.
  for (const u of usernames) {
    try {
      recomputeProfileBaseline(u);
    } catch {}
  }
  recomputeAllHashtagHeat();

  return {
    enriched,
    stubbed,
    failed,
    apifyRunId: result.runId,
    affectedPosts,
  };
}

// Recomputa engagement_rate para posts cuyo owner_username está en la
// lista (ahora que tenemos sus followers en profiles).
function recomputeScoresForOwners(usernames: string[]): number {
  const db = getDb();
  if (usernames.length === 0) return 0;

  const placeholders = usernames.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT p.id, p.raw_json,
              COALESCE(pr1.followers_count, pr2.followers_count) AS followers
       FROM posts p
       LEFT JOIN profiles pr1 ON LOWER(pr1.username) = LOWER(p.source_profile)
       LEFT JOIN profiles pr2 ON LOWER(pr2.username) = LOWER(p.owner_username)
       WHERE LOWER(p.owner_username) IN (${placeholders})`
    )
    .all(...usernames.map((u) => u.toLowerCase())) as Array<{
    id: string;
    raw_json: string;
    followers: number | null;
  }>;

  if (rows.length === 0) return 0;

  // Lazy import para evitar ciclo
  const { computeScores } = require("./score");
  const update = db.prepare(
    `UPDATE posts SET
       engagement_score = ?,
       engagement_rate  = ?,
       view_rate        = ?,
       viral_velocity   = ?,
       viral_score      = ?
     WHERE id = ?`
  );

  let n = 0;
  db.exec("BEGIN");
  try {
    for (const r of rows) {
      const item = JSON.parse(r.raw_json);
      const s = computeScores(item, { followersCount: r.followers });
      update.run(
        s.engagementScore,
        s.engagementRate,
        s.viewRate,
        s.viralVelocity,
        s.viralScore,
        r.id
      );
      n++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return n;
}
