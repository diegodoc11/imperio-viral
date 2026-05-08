// Inspecciona un perfil scrapeado: metadata, baseline, top posts por tier.
//
// Uso:
//   npm run peek:profile                                  (todos, últimos 90d)
//   npm run peek:profile -- --user=pedrosobral
//   npm run peek:profile -- --recent=7                    (última semana)
//   npm run peek:profile -- --recent=30                   (último mes)
//   npm run peek:profile -- --recent=180                  (últimos 6 meses)
//   npm run peek:profile -- --all                         (sin filtro temporal)

import "dotenv/config";
import { getDb } from "../lib/db";
import { TIER_LABEL } from "../lib/baseline";
import type { ViralTier } from "../lib/types";

const args: Record<string, string> = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)=(.*)$/);
  if (m) args[m[1]] = m[2];
  else if (a === "--all") args.all = "true";
}

const recentDays = args.all ? null : Number(args.recent ?? "90");
if (recentDays != null && (Number.isNaN(recentDays) || recentDays <= 0)) {
  throw new Error(`--recent inválido: ${args.recent}`);
}
const cutoff =
  recentDays != null
    ? Math.floor(Date.now() / 1000) - recentDays * 86400
    : null;

const db = getDb();

const profiles = (
  args.user
    ? db
        .prepare("SELECT * FROM profiles WHERE username = ?")
        .all(args.user.toLowerCase())
    : db.prepare("SELECT * FROM profiles ORDER BY scraped_at DESC").all()
) as any[];

if (profiles.length === 0) {
  console.log("Sin perfiles en la DB. Corre npm run scrape:profile.");
  process.exit(0);
}

const windowLabel = cutoff
  ? `últimos ${recentDays} días`
  : "todo el histórico";
console.log(`\nVentana: ${windowLabel}`);

for (const p of profiles) {
  console.log("\n" + "═".repeat(60));
  console.log(`📊 @${p.username}  ${p.is_verified ? "✓" : ""}`);
  if (p.full_name) console.log(`   ${p.full_name}`);
  if (p.bio)
    console.log(
      `   "${p.bio.slice(0, 100)}${p.bio.length > 100 ? "…" : ""}"`
    );
  console.log("═".repeat(60));

  console.log(
    `Followers: ${p.followers_count?.toLocaleString() ?? "—"}  ` +
      `Following: ${p.following_count?.toLocaleString() ?? "—"}  ` +
      `Posts: ${p.posts_count?.toLocaleString() ?? "—"}`
  );
  console.log(
    `Idioma: ${p.language ?? "?"}  ` +
      `Mediana ER: ${p.median_engagement_rate?.toFixed(2) ?? "—"}%  ` +
      `Mediana score: ${p.median_engagement_score?.toFixed(0) ?? "—"}  ` +
      `Mediana views: ${p.median_views?.toLocaleString() ?? "—"}`
  );

  const tierFilter = cutoff
    ? `AND posted_at > ${cutoff}`
    : "";

  const tierCounts = db
    .prepare(
      `SELECT viral_tier AS tier, COUNT(*) AS n
       FROM posts
       WHERE source_profile = ? AND viral_tier IS NOT NULL ${tierFilter}
       GROUP BY viral_tier`
    )
    .all(p.username) as Array<{ tier: ViralTier; n: number }>;

  if (tierCounts.length > 0) {
    console.log(`\nTiers virales (${windowLabel}):`);
    const order: ViralTier[] = ["good", "viral", "gem", "diamond", "unicorn"];
    for (const t of order) {
      const found = tierCounts.find((x) => x.tier === t);
      if (found) console.log(`  ${TIER_LABEL[t]} → ${found.n} post(s)`);
    }
  } else {
    console.log(`\n(Sin posts ≥2× la mediana en ${windowLabel}.)`);
  }

  const topPosts = db
    .prepare(
      `SELECT short_code, type,
              likes_count, comments_count,
              COALESCE(video_view_count, video_play_count) AS plays,
              engagement_rate, viralidad_multiplier, viral_tier,
              caption, posted_at
       FROM posts
       WHERE source_profile = ?
         AND viralidad_multiplier IS NOT NULL
         ${tierFilter}
       ORDER BY viralidad_multiplier DESC
       LIMIT 10`
    )
    .all(p.username) as any[];

  if (topPosts.length > 0) {
    console.log(`\nTop posts del perfil (${windowLabel}, multiplicador desc):`);
    for (const r of topPosts) {
      const tier = r.viral_tier as ViralTier | null;
      const badge = tier ? TIER_LABEL[tier] : "—";
      const ageDays = ((Date.now() / 1000 - r.posted_at) / 86400).toFixed(0);
      const plays =
        r.plays != null ? `${(r.plays as number).toLocaleString()}` : "—";
      const er =
        r.engagement_rate != null ? `${r.engagement_rate.toFixed(1)}%` : "—";
      const cap = (r.caption ?? "").replace(/\s+/g, " ").slice(0, 40);
      console.log(
        `  ${badge.padEnd(13)} ${r.viralidad_multiplier.toFixed(1)}x  ` +
          `${r.type.padEnd(7)} ❤️${String(r.likes_count).padStart(5)} ` +
          `💬${String(r.comments_count).padStart(4)} ▶️${plays.padStart(8)} ` +
          `ER=${er.padStart(5)}  ${ageDays}d  "${cap}…"`
      );
    }
  }
}

console.log();
