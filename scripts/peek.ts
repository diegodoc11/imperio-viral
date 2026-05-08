// Inspecciona los posts: totales, desglose por idioma, top virales con
// engagement_rate (%) y tier visual.
// Uso: npm run peek

import "dotenv/config";
import { getDb } from "../lib/db";
import { engagementTier, type EngagementTier } from "../lib/score";

const TIER_BADGE: Record<EngagementTier, string> = {
  weak: "⚪ weak    ",
  decent: "🔵 decent  ",
  good: "🟡 good    ",
  winner: "🟢 winner  ",
  validate: "🟠 validate",
};

const db = getDb();

const total = (db.prepare("SELECT COUNT(*) AS n FROM posts").get() as {
  n: number;
}).n;

console.log(`\n=== ${total} posts en la DB ===\n`);

const byLang = db
  .prepare(
    "SELECT COALESCE(language, '?') AS lang, COUNT(*) AS n FROM posts GROUP BY language ORDER BY n DESC"
  )
  .all() as Array<{ lang: string; n: number }>;
console.log("Por idioma:");
for (const l of byLang) console.log(`  ${l.lang}: ${l.n}`);

const langs: Array<"es" | "en" | "pt"> = ["es", "en", "pt"];
const stmt = db.prepare(
  `SELECT
     short_code, type, owner_username, language,
     likes_count, comments_count, shares_count,
     COALESCE(video_view_count, video_play_count) AS plays,
     engagement_score, engagement_rate,
     viral_velocity, viral_score,
     posted_at, source_hashtag
   FROM posts
   WHERE language = ? AND type = 'Video'
   ORDER BY engagement_rate DESC NULLS LAST
   LIMIT 5`
);

for (const lang of langs) {
  const rows = stmt.all(lang) as any[];
  if (rows.length === 0) continue;
  console.log(`\nTop 5 reels [${lang.toUpperCase()}] por engagement_rate:\n`);
  for (const r of rows) {
    const ageHours = ((Date.now() / 1000 - r.posted_at) / 3600).toFixed(1);
    const plays =
      r.plays != null ? `${(r.plays as number).toLocaleString()}` : "—";
    const er = r.engagement_rate != null ? `${r.engagement_rate.toFixed(2)}%` : "—";
    const tier = engagementTier(r.engagement_rate);
    const badge = tier ? TIER_BADGE[tier] : "—          ";
    console.log(
      `  ${badge}  @${(r.owner_username ?? "?").padEnd(20)} ` +
        `❤️${String(r.likes_count).padStart(5)}  ` +
        `💬${String(r.comments_count).padStart(4)}  ` +
        `▶️${plays.padStart(8)}  ` +
        `ER=${er.padStart(6)}  ` +
        `⏱${ageHours}h  #${r.source_hashtag}`
    );
  }
}

console.log();
