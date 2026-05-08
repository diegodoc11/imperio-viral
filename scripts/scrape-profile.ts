// Script de scrape por perfil. Llama a apify/instagram-scraper, normaliza
// con sourceProfile, calcula baselines y aplica viralidad multipliers + tiers.
//
// Uso:
//   npm run scrape:profile -- --user=pedrosobral --limit=200
//   npm run scrape:profile -- --user=pedrosobral,babruna
//   npm run scrape:profile -- --user=https://instagram.com/pedrosobral
//   npm run scrape:profile -- --user=pedrosobral --full   (ignora cutoff de 1 año)
//
// Default: limit=200, cutoff de 1 año.
// Incremental: si el perfil ya existe, usa profiles.scraped_at como cutoff
// para traer SOLO los posts nuevos desde el último scrape (mucho más barato).

import "dotenv/config";
import { extractUsername, runProfileScrape } from "../lib/apify";
import { getDb, initSchema } from "../lib/db";
import {
  normalize,
  upsertPosts,
  upsertProfile,
  recordScrapeRun,
} from "../lib/persist";
import { recomputeProfileBaseline, TIER_LABEL } from "../lib/baseline";
import type { StoredProfile } from "../lib/types";
import { inferLanguage } from "../lib/language";

const DEFAULT_LIMIT = 200;
const HARD_CUTOFF_DAYS = 365;

interface CliArgs {
  usernames: string[];
  limit: number;
  full: boolean; // si true, ignora cutoff de 1 año
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a === "--full") args.full = "true";
  }
  if (!args.user) throw new Error("Falta --user=<username|url>[,...]");
  const usernames = Array.from(
    new Set(
      args.user
        .split(",")
        .map((s) => extractUsername(s))
        .filter(Boolean)
    )
  );
  const limit = Number(args.limit ?? String(DEFAULT_LIMIT));
  if (Number.isNaN(limit) || limit <= 0) {
    throw new Error(`--limit inválido: ${args.limit}`);
  }
  return { usernames, limit, full: args.full === "true" };
}

function toIsoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

// Decide qué fecha pasar a Apify como onlyPostsNewerThan:
//   - Si --full: ningún cutoff (lo histórico también)
//   - Si el perfil ya está en DB: el último scraped_at − 1 día (overlap)
//   - Si es primera vez: 1 año atrás (HARD_CUTOFF_DAYS)
function decideCutoff(
  username: string,
  full: boolean
): { cutoff: string | undefined; reason: string } {
  if (full) return { cutoff: undefined, reason: "full (sin cutoff)" };

  const db = getDb();
  const existing = db
    .prepare("SELECT scraped_at FROM profiles WHERE username = ?")
    .get(username) as { scraped_at: number } | undefined;

  if (existing?.scraped_at) {
    const overlap = existing.scraped_at - 86400; // 1 día atrás
    return {
      cutoff: toIsoDate(overlap),
      reason: `incremental desde último scrape (${toIsoDate(existing.scraped_at)})`,
    };
  }

  const oneYearAgo = Math.floor(Date.now() / 1000) - HARD_CUTOFF_DAYS * 86400;
  return {
    cutoff: toIsoDate(oneYearAgo),
    reason: `primer scrape — cutoff 1 año (${toIsoDate(oneYearAgo)})`,
  };
}

// apify/instagram-scraper inyecta los campos del owner en el root de cada item
// (followersCount, followsCount, biography, postsCount, verified, etc.).
function extractProfileFromItem(item: any): Partial<StoredProfile> {
  return {
    fullName: item.fullName ?? item.ownerFullName ?? null,
    bio: item.biography ?? null,
    followersCount: item.followersCount ?? null,
    followingCount: item.followsCount ?? null, // ojo: actor usa "followsCount"
    postsCount: item.postsCount ?? null,
    profilePicUrl: item.profilePicUrlHD ?? item.profilePicUrl ?? null,
    isVerified: typeof item.verified === "boolean" ? item.verified : null,
  };
}

async function main() {
  const { usernames, limit, full } = parseArgs(process.argv.slice(2));
  initSchema();

  console.log(`\n=== Scrape de perfiles ===`);
  console.log(`Perfiles: ${usernames.join(", ")}`);
  console.log(`Límite por perfil: ${limit}${full ? " (--full)" : ""}\n`);

  const startedAt = Math.floor(Date.now() / 1000);

  // Apify devuelve mezclado todo lo que pidió de los N perfiles.
  // Mejor lanzar una llamada por perfil para tener trazabilidad clara.
  for (const username of usernames) {
    const tagStart = Math.floor(Date.now() / 1000);
    let runId: string | null = null;
    let error: string | null = null;
    let receivedCount = 0;

    try {
      const { cutoff, reason } = decideCutoff(username, full);
      console.log(`  cutoff: ${reason}`);

      const result = await runProfileScrape({
        usernames: [username],
        resultsLimit: limit,
        onlyPostsNewerThan: cutoff,
      });
      runId = result.runId;
      receivedCount = result.items.length;

      if (receivedCount === 0) {
        console.log(`  @${username}: sin items (¿perfil privado o mal nombre?)`);
        continue;
      }

      const scrapedAt = Math.floor(Date.now() / 1000);

      // Normalizar y persistir posts
      const normalized = result.items.map((it) =>
        normalize(it, scrapedAt, { sourceProfile: username })
      );
      const { inserted, updated } = upsertPosts(normalized);

      // Extraer datos de perfil desde el primer item (todos vienen del mismo)
      const sample = result.items[0] as any;
      const profileData = extractProfileFromItem(sample);
      const profileLang = inferLanguage(null, sample.caption ?? null);

      upsertProfile({
        username,
        fullName: profileData.fullName ?? null,
        bio: profileData.bio ?? null,
        followersCount: profileData.followersCount ?? null,
        followingCount: profileData.followingCount ?? null,
        postsCount: profileData.postsCount ?? null,
        profilePicUrl: profileData.profilePicUrl ?? null,
        isVerified: profileData.isVerified ?? null,
        language: profileLang,
        medianEngagementScore: null, // se rellena al recomputar baseline
        medianEngagementRate: null,
        medianViews: null,
        scrapedAt,
      });

      // Calcular baseline y aplicar tiers
      const baseline = recomputeProfileBaseline(username);

      console.log(
        `  @${username}: ${receivedCount} items → ${inserted} nuevos, ${updated} actualizados`
      );
      console.log(
        `    mediana ER score: ${baseline.medianEngagementScore?.toFixed(0) ?? "—"}` +
          `  | mediana ER%: ${baseline.medianEngagementRate?.toFixed(2) ?? "—"}%` +
          `  | tagged: ${baseline.taggedPosts} posts (≥2x)`
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.error(`  @${username}: ERROR — ${error}`);
    } finally {
      recordScrapeRun({
        hashtag: `profile:${username}`,
        startedAt: tagStart,
        finishedAt: Math.floor(Date.now() / 1000),
        itemsCount: receivedCount,
        apifyRunId: runId,
        error,
      });
    }
  }

  const elapsed = Math.floor(Date.now() / 1000) - startedAt;
  console.log(`\n✓ Listo en ${elapsed}s.\n`);
  console.log("Tiers virales detectados:");
  for (const tier of Object.keys(TIER_LABEL) as Array<keyof typeof TIER_LABEL>) {
    console.log(`  ${TIER_LABEL[tier]}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
