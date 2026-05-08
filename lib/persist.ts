// Normalización y persistencia: ApifyHashtagItem -> StoredPost en SQLite.

import type { ApifyHashtagItem, StoredPost, StoredProfile } from "./types";
import { computeScores } from "./score";
import { inferLanguage } from "./language";
import { getDb } from "./db";

export interface NormalizeOptions {
  sourceHashtag?: string | null;
  sourceProfile?: string | null;
}

export function normalize(
  item: ApifyHashtagItem,
  scrapedAt: number,
  opts: NormalizeOptions = {}
): StoredPost {
  const sourceHashtag = opts.sourceHashtag ?? null;
  const sourceProfile = opts.sourceProfile ?? null;
  const scores = computeScores(item);
  const postedAt = item.timestamp
    ? Math.floor(new Date(item.timestamp).getTime() / 1000)
    : scrapedAt;

  const childImages = (item.childPosts ?? [])
    .map((c) => c.displayUrl)
    .filter((u): u is string => !!u);
  const images: string[] =
    item.images && item.images.length > 0
      ? item.images
      : childImages.length > 0
      ? childImages
      : item.displayUrl
      ? [item.displayUrl]
      : [];

  return {
    id: item.id,
    shortCode: item.shortCode ?? null,
    url: item.url,
    type: item.type,

    ownerUsername: item.ownerUsername ?? null,
    ownerFullName: item.ownerFullName ?? null,
    ownerId: item.ownerId ?? null,

    caption: item.caption ?? null,
    hashtags: item.hashtags ?? [],
    mentions: item.mentions ?? [],
    locationName: item.locationName ?? null,

    videoUrl: item.videoUrl ?? null,
    videoDuration: item.videoDuration ?? null,
    images,
    displayUrl: item.displayUrl ?? null,

    musicArtist: item.musicInfo?.artist_name ?? null,
    musicTrack: item.musicInfo?.song_name ?? null,
    musicId: item.musicInfo?.audio_id ?? null,

    likesCount: item.likesCount ?? 0,
    commentsCount: item.commentsCount ?? 0,
    videoViewCount: item.videoViewCount ?? null,
    videoPlayCount: item.videoPlayCount ?? null,
    sharesCount: item.sharesCount ?? null,

    postedAt,
    scrapedAt,
    sourceHashtag,
    sourceProfile,
    language: inferLanguage(sourceHashtag, item.caption ?? null),

    engagementScore: scores.engagementScore,
    engagementRate: scores.engagementRate,
    viewRate: scores.viewRate,
    viralVelocity: scores.viralVelocity,
    viralScore: scores.viralScore,
    viralidadMultiplier: null, // se calcula post-scrape en lib/baseline.ts
    viralTier: null,

    rawJson: JSON.stringify(item),
  };
}

const UPSERT_SQL = `
INSERT INTO posts (
  id, short_code, url, type,
  owner_username, owner_full_name, owner_id,
  caption, hashtags, mentions, location_name,
  video_url, video_duration, images, display_url,
  music_artist, music_track, music_id,
  likes_count, comments_count, video_view_count, video_play_count, shares_count,
  posted_at, scraped_at, source_hashtag, source_profile, language,
  viral_velocity, engagement_score, engagement_rate, view_rate, viral_score,
  raw_json
) VALUES (
  :id, :shortCode, :url, :type,
  :ownerUsername, :ownerFullName, :ownerId,
  :caption, :hashtags, :mentions, :locationName,
  :videoUrl, :videoDuration, :images, :displayUrl,
  :musicArtist, :musicTrack, :musicId,
  :likesCount, :commentsCount, :videoViewCount, :videoPlayCount, :sharesCount,
  :postedAt, :scrapedAt, :sourceHashtag, :sourceProfile, :language,
  :viralVelocity, :engagementScore, :engagementRate, :viewRate, :viralScore,
  :rawJson
)
ON CONFLICT(id) DO UPDATE SET
  likes_count       = excluded.likes_count,
  comments_count    = excluded.comments_count,
  video_view_count  = excluded.video_view_count,
  video_play_count  = excluded.video_play_count,
  shares_count      = excluded.shares_count,
  scraped_at        = excluded.scraped_at,
  source_profile    = COALESCE(excluded.source_profile, posts.source_profile),
  language          = COALESCE(posts.language, excluded.language),
  viral_velocity    = excluded.viral_velocity,
  engagement_score  = excluded.engagement_score,
  engagement_rate   = excluded.engagement_rate,
  view_rate         = excluded.view_rate,
  viral_score       = excluded.viral_score,
  raw_json          = excluded.raw_json
`;

export interface UpsertResult {
  inserted: number;
  updated: number;
  failed: number;
}

// Convierte un valor potencialmente conflictivo (BigInt, NaN, undefined) en
// algo que node:sqlite acepta. Sanitiza preventivamente — el bug de
// "parameter 299" en melisaescobarta vino de aquí.
function sanitize(v: unknown): string | number | bigint | Buffer | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (Number.isNaN(v) || !Number.isFinite(v)) return null;
    return v;
  }
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  // Cualquier otra cosa la stringificamos.
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

export function upsertPosts(posts: StoredPost[]): UpsertResult {
  const db = getDb();

  if (posts.length === 0) return { inserted: 0, updated: 0, failed: 0 };

  // Detección de existentes: query individual por id en vez de IN(?,?,...).
  // Más calls pero mucho más robusto frente a un id problemático
  // (un solo id corrupto rompía todo el IN). Es ~5 ms para 300 lookups.
  const existing = new Set<string>();
  const checkStmt = db.prepare("SELECT 1 FROM posts WHERE id = ? LIMIT 1");
  for (const p of posts) {
    try {
      const id = sanitize(p.id);
      if (id != null && checkStmt.get(id) != null) existing.add(p.id);
    } catch {
      // ignorar — si no podemos chequear, lo tratamos como nuevo
    }
  }

  const stmt = db.prepare(UPSERT_SQL);

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const failures: Array<{ id: string; error: string }> = [];

  // Sin transacción global — un row con valor problemático no debe
  // hacer rollback de todo el batch. Trade-off: ~30% más lento, pero
  // robusto.
  for (const p of posts) {
    try {
      const params: Record<string, ReturnType<typeof sanitize>> = {
        id: sanitize(p.id),
        shortCode: sanitize(p.shortCode),
        url: sanitize(p.url),
        type: sanitize(p.type),
        ownerUsername: sanitize(p.ownerUsername),
        ownerFullName: sanitize(p.ownerFullName),
        ownerId: sanitize(p.ownerId),
        caption: sanitize(p.caption),
        hashtags: sanitize(JSON.stringify(p.hashtags)),
        mentions: sanitize(JSON.stringify(p.mentions)),
        locationName: sanitize(p.locationName),
        videoUrl: sanitize(p.videoUrl),
        videoDuration: sanitize(p.videoDuration),
        images: sanitize(JSON.stringify(p.images)),
        displayUrl: sanitize(p.displayUrl),
        musicArtist: sanitize(p.musicArtist),
        musicTrack: sanitize(p.musicTrack),
        musicId: sanitize(p.musicId),
        likesCount: sanitize(p.likesCount),
        commentsCount: sanitize(p.commentsCount),
        videoViewCount: sanitize(p.videoViewCount),
        videoPlayCount: sanitize(p.videoPlayCount),
        sharesCount: sanitize(p.sharesCount),
        postedAt: sanitize(p.postedAt),
        scrapedAt: sanitize(p.scrapedAt),
        sourceHashtag: sanitize(p.sourceHashtag),
        sourceProfile: sanitize(p.sourceProfile),
        language: sanitize(p.language),
        viralVelocity: sanitize(p.viralVelocity),
        engagementScore: sanitize(p.engagementScore),
        engagementRate: sanitize(p.engagementRate),
        viewRate: sanitize(p.viewRate),
        viralScore: sanitize(p.viralScore),
        rawJson: sanitize(p.rawJson),
      };
      stmt.run(params);
      if (existing.has(p.id)) updated++;
      else inserted++;
    } catch (e) {
      failed++;
      failures.push({
        id: p.id,
        error: String(e instanceof Error ? e.message : e),
      });
    }
  }

  if (failures.length > 0) {
    console.warn(`  ⚠ ${failures.length} post(s) saltados por error:`);
    for (const f of failures.slice(0, 5)) {
      console.warn(`    ${f.id}: ${f.error}`);
    }
    if (failures.length > 5) console.warn(`    …y ${failures.length - 5} más`);
  }

  return { inserted, updated, failed };
}

// Upsert de un perfil. Datos básicos vienen del scrape; los campos median_*
// se rellenan después llamando a recomputeProfileBaseline().
export function upsertProfile(profile: StoredProfile): void {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO profiles (
      username, full_name, bio, followers_count, following_count, posts_count,
      profile_pic_url, is_verified, language,
      median_engagement_score, median_engagement_rate, median_views,
      scraped_at
    ) VALUES (
      :username, :fullName, :bio, :followersCount, :followingCount, :postsCount,
      :profilePicUrl, :isVerified, :language,
      :medianEngagementScore, :medianEngagementRate, :medianViews,
      :scrapedAt
    )
    ON CONFLICT(username) DO UPDATE SET
      full_name        = COALESCE(excluded.full_name, profiles.full_name),
      bio              = COALESCE(excluded.bio, profiles.bio),
      followers_count  = COALESCE(excluded.followers_count, profiles.followers_count),
      following_count  = COALESCE(excluded.following_count, profiles.following_count),
      posts_count      = COALESCE(excluded.posts_count, profiles.posts_count),
      profile_pic_url  = COALESCE(excluded.profile_pic_url, profiles.profile_pic_url),
      is_verified      = COALESCE(excluded.is_verified, profiles.is_verified),
      language         = COALESCE(profiles.language, excluded.language),
      scraped_at       = excluded.scraped_at
  `
  ).run({
    username: profile.username,
    fullName: profile.fullName,
    bio: profile.bio,
    followersCount: profile.followersCount,
    followingCount: profile.followingCount,
    postsCount: profile.postsCount,
    profilePicUrl: profile.profilePicUrl,
    isVerified: profile.isVerified == null ? null : profile.isVerified ? 1 : 0,
    language: profile.language,
    medianEngagementScore: profile.medianEngagementScore,
    medianEngagementRate: profile.medianEngagementRate,
    medianViews: profile.medianViews,
    scrapedAt: profile.scrapedAt,
  });
}

export function recordScrapeRun(args: {
  hashtag: string | null;
  startedAt: number;
  finishedAt: number | null;
  itemsCount: number | null;
  apifyRunId: string | null;
  error: string | null;
}): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO scrape_runs (hashtag, started_at, finished_at, items_count, apify_run_id, error)
    VALUES (:hashtag, :startedAt, :finishedAt, :itemsCount, :apifyRunId, :error)
  `);
  const info = stmt.run(args);
  return Number(info.lastInsertRowid);
}
