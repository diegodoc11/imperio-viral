// Queries server-side reutilizadas por páginas de Next.js.
// Acceden directamente a SQLite (estamos local, sin red).

import { getDb } from "./db";
import type { ViralTier, Decision } from "./types";

const DAY = 86400;

// ─────────────────────────────────────────────────────────────
// PERFILES
// ─────────────────────────────────────────────────────────────

export interface ProfileSummary {
  username: string;
  fullName: string | null;
  bio: string | null;
  followersCount: number | null;
  followingCount: number | null;
  postsCount: number | null;
  profilePicUrl: string | null;
  isVerified: boolean;
  language: string | null;
  medianEngagementScore: number | null;
  medianEngagementRate: number | null;
  medianViews: number | null;
  scrapedAt: number;
  // Derivado
  totalPostsInDb: number;
  taggedPostsCount: number;
}

export function getAllProfiles(): ProfileSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM posts WHERE source_profile = p.username) AS total_posts,
              (SELECT COUNT(*) FROM posts WHERE source_profile = p.username AND viral_tier IS NOT NULL) AS tagged_posts
       FROM profiles p
       ORDER BY p.followers_count DESC NULLS LAST`
    )
    .all() as any[];

  return rows.map(rowToProfileSummary);
}

export function getProfile(username: string): ProfileSummary | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM posts WHERE source_profile = p.username) AS total_posts,
              (SELECT COUNT(*) FROM posts WHERE source_profile = p.username AND viral_tier IS NOT NULL) AS tagged_posts
       FROM profiles p
       WHERE p.username = ?`
    )
    .get(username.toLowerCase()) as any;
  return row ? rowToProfileSummary(row) : null;
}

function rowToProfileSummary(r: any): ProfileSummary {
  return {
    username: r.username,
    fullName: r.full_name,
    bio: r.bio,
    followersCount: r.followers_count,
    followingCount: r.following_count,
    postsCount: r.posts_count,
    profilePicUrl: r.profile_pic_url,
    isVerified: !!r.is_verified,
    language: r.language,
    medianEngagementScore: r.median_engagement_score,
    medianEngagementRate: r.median_engagement_rate,
    medianViews: r.median_views,
    scrapedAt: r.scraped_at,
    totalPostsInDb: r.total_posts,
    taggedPostsCount: r.tagged_posts,
  };
}

// ─────────────────────────────────────────────────────────────
// POSTS
// ─────────────────────────────────────────────────────────────

export type PostType = "Image" | "Sidecar" | "Video";
export type SortKey =
  | "viralScore" // combinado, funciona para todos los tipos
  | "viralidadMultiplier"
  | "engagementRate"
  | "viralVelocity"
  | "engagementScore"
  | "viewsPerFollower" // joyas ocultas: cuentas chicas con reel viral
  | "postedAt"
  | "videoViewCount";

export type HeatLevel = "fresco" | "tibio" | "caliente" | "explosivo";

const HEAT_MIN_ER: Record<HeatLevel, number> = {
  fresco: 1,
  tibio: 3,
  caliente: 6,
  explosivo: 9,
};

export interface PostFilters {
  recentDays?: number; // null = sin filtro
  // "supported" filtra a posts donde language IN ('es','en','pt')
  // (excluye 'other' y null). Útil para descartar francés, hindi, etc.
  language?: "es" | "en" | "pt" | "supported" | null;
  types?: PostType[]; // si vacío, todos
  minTier?: ViralTier | null;
  // Calor mínimo basado en engagement_rate (%). Solo aplica a reels (sin
  // ER no hay clasificación). Si está activo, los posts/carruseles quedan
  // excluidos automáticamente.
  minHeat?: HeatLevel | null;
  decision?: Decision | "none" | null; // 'none' = sin decisión aún
  sort?: SortKey;
  // Filtro por origen del scrape:
  //   "any"        → cualquier post que vino de un hashtag scrape
  //   "<hashtag>"  → solo de ese hashtag específico
  //   null/undef   → sin filtro
  sourceHashtag?: string | "any" | null;
}

export interface PostListItem {
  id: string;
  shortCode: string | null;
  url: string;
  type: PostType;
  ownerUsername: string | null;
  ownerFullName: string | null;
  caption: string | null;
  displayUrl: string | null;
  videoUrl: string | null;
  images: string[];
  hashtags: string[];
  likesCount: number;
  commentsCount: number;
  sharesCount: number | null;
  videoViewCount: number | null;
  videoPlayCount: number | null;
  videoDuration: number | null;
  musicArtist: string | null;
  musicTrack: string | null;
  engagementScore: number | null;
  engagementRate: number | null;
  viewRate: number | null;
  viralVelocity: number | null;
  viralScore: number | null;
  viralidadMultiplier: number | null;
  viralTier: ViralTier | null;
  hashtagHeatMult: number | null;
  hashtagHeatTier: HeatLevel | null;
  // Conteo de followers del autor (si lo conocemos) y ratio views/followers.
  // Útil para detectar "joyas ocultas": cuentas pequeñas con reels viralizando.
  ownerFollowersCount: number | null;
  viewsPerFollower: number | null;
  postedAt: number;
  language: string | null;
  sourceProfile: string | null;
  sourceHashtag: string | null;
  decision: Decision | null;
  decisionNotes: string | null;
}

export function getProfilePosts(
  username: string,
  filters: PostFilters
): PostListItem[] {
  return queryPosts({ ...filters, sourceProfile: username });
}

interface InternalQueryFilters extends PostFilters {
  sourceProfile?: string;
}

export function queryPosts(filters: InternalQueryFilters): PostListItem[] {
  const db = getDb();
  const where: string[] = ["1=1"];
  const params: any[] = [];

  if (filters.sourceProfile) {
    where.push("p.source_profile = ?");
    params.push(filters.sourceProfile.toLowerCase());
  }

  if (filters.sourceHashtag === "any") {
    where.push("p.source_hashtag IS NOT NULL");
  } else if (filters.sourceHashtag) {
    where.push("p.source_hashtag = ?");
    params.push(filters.sourceHashtag.toLowerCase());
  }

  if (filters.recentDays != null) {
    const cutoff = Math.floor(Date.now() / 1000) - filters.recentDays * DAY;
    where.push("p.posted_at > ?");
    params.push(cutoff);
  }

  if (filters.language === "supported") {
    where.push("p.language IN ('es','en','pt')");
  } else if (filters.language) {
    where.push("p.language = ?");
    params.push(filters.language);
  }

  if (filters.types && filters.types.length > 0) {
    where.push(
      `p.type IN (${filters.types.map(() => "?").join(",")})`
    );
    params.push(...filters.types);
  }

  if (filters.minTier) {
    const order: ViralTier[] = ["good", "viral", "gem", "diamond", "unicorn"];
    const minIdx = order.indexOf(filters.minTier);
    const allowed = order.slice(minIdx);
    where.push(`p.viral_tier IN (${allowed.map(() => "?").join(",")})`);
    params.push(...allowed);
  }

  if (filters.minHeat) {
    where.push("p.engagement_rate >= ?");
    params.push(HEAT_MIN_ER[filters.minHeat]);
  }

  if (filters.decision === "none") {
    where.push("d.decision IS NULL");
  } else if (filters.decision) {
    where.push("d.decision = ?");
    params.push(filters.decision);
  }

  const sortKey = filters.sort ?? "viralidadMultiplier";
  const orderBy: Record<SortKey, string> = {
    viralScore: "p.viral_score DESC NULLS LAST",
    viralidadMultiplier: "p.viralidad_multiplier DESC NULLS LAST",
    engagementRate: "p.engagement_rate DESC NULLS LAST",
    viralVelocity: "p.viral_velocity DESC NULLS LAST",
    engagementScore: "p.engagement_score DESC NULLS LAST",
    viewsPerFollower:
      "(CAST(COALESCE(p.video_view_count, p.video_play_count) AS REAL) / NULLIF(COALESCE(pr1.followers_count, pr2.followers_count), 0)) DESC NULLS LAST",
    postedAt: "p.posted_at DESC",
    videoViewCount:
      "COALESCE(p.video_view_count, p.video_play_count) DESC NULLS LAST",
  };

  // Tiebreakers: si el campo primario es NULL para muchos posts, queremos
  // un orden secundario sensato (engagement_score y fecha) en vez de aleatorio.
  const sql = `
    SELECT p.*,
           d.decision AS decision,
           d.notes    AS decision_notes,
           COALESCE(pr1.followers_count, pr2.followers_count) AS owner_followers
    FROM posts p
    LEFT JOIN decisions d  ON d.post_id = p.id
    LEFT JOIN profiles pr1 ON LOWER(pr1.username) = LOWER(p.source_profile)
    LEFT JOIN profiles pr2 ON LOWER(pr2.username) = LOWER(p.owner_username)
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy[sortKey]},
             p.engagement_score DESC NULLS LAST,
             p.posted_at DESC
    LIMIT 500
  `;

  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(rowToPost);
}

export function getPostById(id: string): PostListItem | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT p.*,
              d.decision AS decision,
              d.notes    AS decision_notes,
              COALESCE(pr1.followers_count, pr2.followers_count) AS owner_followers
       FROM posts p
       LEFT JOIN decisions d  ON d.post_id = p.id
       LEFT JOIN profiles pr1 ON LOWER(pr1.username) = LOWER(p.source_profile)
       LEFT JOIN profiles pr2 ON LOWER(pr2.username) = LOWER(p.owner_username)
       WHERE p.id = ?`
    )
    .get(id) as any;
  return row ? rowToPost(row) : null;
}

function rowToPost(r: any): PostListItem {
  let images: string[] = [];
  let hashtags: string[] = [];
  try {
    images = JSON.parse(r.images || "[]");
  } catch {}
  try {
    hashtags = JSON.parse(r.hashtags || "[]");
  } catch {}

  return {
    id: r.id,
    shortCode: r.short_code,
    url: r.url,
    type: r.type,
    ownerUsername: r.owner_username,
    ownerFullName: r.owner_full_name,
    caption: r.caption,
    displayUrl: r.display_url,
    videoUrl: r.video_url,
    images,
    hashtags,
    likesCount: r.likes_count ?? 0,
    commentsCount: r.comments_count ?? 0,
    sharesCount: r.shares_count,
    videoViewCount: r.video_view_count,
    videoPlayCount: r.video_play_count,
    videoDuration: r.video_duration,
    musicArtist: r.music_artist,
    musicTrack: r.music_track,
    engagementScore: r.engagement_score,
    engagementRate: r.engagement_rate,
    viewRate: r.view_rate,
    viralVelocity: r.viral_velocity,
    viralScore: r.viral_score,
    viralidadMultiplier: r.viralidad_multiplier,
    viralTier: r.viral_tier,
    hashtagHeatMult: r.hashtag_heat_mult,
    hashtagHeatTier: r.hashtag_heat_tier,
    ownerFollowersCount: r.owner_followers ?? null,
    viewsPerFollower: (() => {
      const views = r.video_view_count ?? r.video_play_count ?? null;
      const followers = r.owner_followers ?? null;
      if (views == null || followers == null || followers <= 0) return null;
      return views / followers;
    })(),
    postedAt: r.posted_at,
    language: r.language,
    sourceProfile: r.source_profile,
    sourceHashtag: r.source_hashtag,
    decision: r.decision,
    decisionNotes: r.decision_notes,
  };
}

// ─────────────────────────────────────────────────────────────
// DECISIONS
// ─────────────────────────────────────────────────────────────

export function setDecision(
  postId: string,
  decision: Decision | null,
  notes?: string | null
): void {
  const db = getDb();
  if (decision === null) {
    db.prepare("DELETE FROM decisions WHERE post_id = ?").run(postId);
    return;
  }
  db.prepare(
    `INSERT INTO decisions (post_id, decision, notes, decided_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET
       decision   = excluded.decision,
       notes      = COALESCE(excluded.notes, decisions.notes),
       decided_at = excluded.decided_at`
  ).run(postId, decision, notes ?? null, Math.floor(Date.now() / 1000));
}

// ─────────────────────────────────────────────────────────────
// HASHTAGS
// ─────────────────────────────────────────────────────────────

export interface HashtagSummary {
  hashtag: string;
  totalPosts: number;
  taggedPosts: number;
  reels: number;
  carousels: number;
  images: number;
  lastScrapedAt: number;
}

export function getAllHashtagsWithCounts(): HashtagSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         source_hashtag AS hashtag,
         COUNT(*) AS total_posts,
         COUNT(CASE WHEN viral_tier IS NOT NULL THEN 1 END) AS tagged_posts,
         COUNT(CASE WHEN type = 'Video'   THEN 1 END) AS reels,
         COUNT(CASE WHEN type = 'Sidecar' THEN 1 END) AS carousels,
         COUNT(CASE WHEN type = 'Image'   THEN 1 END) AS images,
         MAX(scraped_at) AS last_scraped_at
       FROM posts
       WHERE source_hashtag IS NOT NULL
       GROUP BY source_hashtag
       ORDER BY total_posts DESC`
    )
    .all() as any[];

  return rows.map((r) => ({
    hashtag: r.hashtag,
    totalPosts: r.total_posts,
    taggedPosts: r.tagged_posts,
    reels: r.reels,
    carousels: r.carousels,
    images: r.images,
    lastScrapedAt: r.last_scraped_at,
  }));
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────────────────────

export interface GlobalStats {
  totalProfiles: number;
  totalPosts: number;
  totalReels: number;
  totalCarousels: number;
  totalImages: number;
  taggedPosts: number;
  byTier: Record<ViralTier, number>;
  byLanguage: { lang: string; n: number }[];
  decisionsCount: { replicate: number; maybe: number; skip: number };
}

export function getGlobalStats(): GlobalStats {
  const db = getDb();

  const totalProfiles = (
    db.prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n: number }
  ).n;

  const typeRows = db
    .prepare("SELECT type, COUNT(*) AS n FROM posts GROUP BY type")
    .all() as Array<{ type: string; n: number }>;

  const totalPosts = typeRows.reduce((s, r) => s + r.n, 0);
  const totalReels = typeRows.find((r) => r.type === "Video")?.n ?? 0;
  const totalCarousels = typeRows.find((r) => r.type === "Sidecar")?.n ?? 0;
  const totalImages = typeRows.find((r) => r.type === "Image")?.n ?? 0;

  const taggedPosts = (
    db
      .prepare("SELECT COUNT(*) AS n FROM posts WHERE viral_tier IS NOT NULL")
      .get() as { n: number }
  ).n;

  const tierRows = db
    .prepare(
      "SELECT viral_tier AS tier, COUNT(*) AS n FROM posts WHERE viral_tier IS NOT NULL GROUP BY viral_tier"
    )
    .all() as Array<{ tier: ViralTier; n: number }>;

  const byTier: Record<ViralTier, number> = {
    good: 0,
    viral: 0,
    gem: 0,
    diamond: 0,
    unicorn: 0,
  };
  for (const r of tierRows) byTier[r.tier] = r.n;

  const byLanguage = db
    .prepare(
      "SELECT COALESCE(language, '?') AS lang, COUNT(*) AS n FROM posts GROUP BY language ORDER BY n DESC"
    )
    .all() as Array<{ lang: string; n: number }>;

  const decisionRows = db
    .prepare(
      "SELECT decision, COUNT(*) AS n FROM decisions GROUP BY decision"
    )
    .all() as Array<{ decision: Decision; n: number }>;
  const decisionsCount = { replicate: 0, maybe: 0, skip: 0 };
  for (const r of decisionRows) decisionsCount[r.decision] = r.n;

  return {
    totalProfiles,
    totalPosts,
    totalReels,
    totalCarousels,
    totalImages,
    taggedPosts,
    byTier,
    byLanguage,
    decisionsCount,
  };
}
