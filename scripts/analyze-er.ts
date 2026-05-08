// Analiza el engagement rate de un post comparando con varias fórmulas
// que usan herramientas de la industria.
//
// Uso: npm run analyze-er -- --short=DYCkEI-xqev
//      npm run analyze-er -- --id=<post_id>

import "dotenv/config";
import { getDb } from "../lib/db";

const args: Record<string, string> = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)=(.*)$/);
  if (m) args[m[1]] = m[2];
}

const db = getDb();
let r: any;
if (args.id) {
  r = db.prepare("SELECT * FROM posts WHERE id = ?").get(args.id);
} else if (args.short) {
  r = db.prepare("SELECT * FROM posts WHERE short_code = ?").get(args.short);
} else {
  throw new Error("Pasa --id=<id> o --short=<shortcode>");
}

if (!r) {
  console.log("Post no encontrado en la DB.");
  process.exit(1);
}

// Buscar followers — primero source_profile, luego owner_username
const profileRow = db
  .prepare(
    `SELECT followers_count
     FROM profiles
     WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)
     LIMIT 1`
  )
  .get(r.source_profile ?? "", r.owner_username ?? "") as
  | { followers_count: number | null }
  | undefined;

const likes = r.likes_count ?? 0;
const comments = r.comments_count ?? 0;
const shares = r.shares_count ?? 0;
const views = r.video_view_count ?? r.video_play_count ?? null;
const followers = profileRow?.followers_count ?? null;

console.log("=".repeat(70));
console.log(`Post: ${r.short_code}  (https://www.instagram.com/p/${r.short_code}/)`);
console.log(`Tipo: ${r.type}  Autor: @${r.owner_username}`);
console.log(`Origen: profile=${r.source_profile ?? "—"}  hashtag=${r.source_hashtag ?? "—"}`);
console.log("=".repeat(70));
console.log("");
console.log("MÉTRICAS CRUDAS:");
console.log(`  likes:     ${likes === -1 ? "OCULTOS por el autor" : likes.toLocaleString()}`);
console.log(`  comments:  ${comments.toLocaleString()}`);
console.log(`  shares:    ${shares}`);
console.log(`  views:     ${views?.toLocaleString() ?? "NULL"}`);
console.log(
  `  followers: ${
    followers != null
      ? followers.toLocaleString()
      : "NO TENEMOS — usa enriquecimiento en /hashtags"
  }`
);
console.log("");
console.log("ENGAGEMENT RATE:");
console.log("");

if (followers && followers > 0) {
  const erByFollowers = ((Math.max(0, likes) + comments) / followers) * 100;
  console.log(`  ⭐ ESTÁNDAR DE MERCADO — (likes + comments) / followers × 100:`);
  console.log(
    `     = (${Math.max(0, likes)} + ${comments}) / ${followers} × 100 = ${erByFollowers.toFixed(2)}%`
  );
  console.log(
    `     ↳ La fórmula que usan Hootsuite, Sprout Social, HubSpot, HypeAuditor, Modash, etc.`
  );
  console.log(
    `     ↳ Benchmarks: <1% bajo · 1-3% promedio · 3-6% bueno · 6-9% excelente · 9%+ outlier`
  );
  console.log("");
} else {
  console.log(`  ⭐ ESTÁNDAR DE MERCADO — necesita followers (no tenemos):`);
  console.log(`     (likes + comments) / followers × 100 = N/A`);
  console.log(`     ↳ Enriquece a @${r.owner_username} en /hashtags para calcularlo.`);
  console.log("");
}

if (views) {
  const viewRate = ((Math.max(0, likes) + comments) / views) * 100;
  console.log(`  📊 COMPLEMENTARIO (solo reels) — (likes + comments) / views × 100:`);
  console.log(
    `     = (${Math.max(0, likes)} + ${comments}) / ${views} × 100 = ${viewRate.toFixed(2)}%`
  );
  console.log(`     ↳ Indica engagement entre los que vieron. NO es el ER principal.`);
  console.log("");
}

console.log("VALORES GUARDADOS EN NUESTRA DB:");
console.log(`  engagement_rate (mercado): ${r.engagement_rate?.toFixed(4) ?? "NULL"}%`);
console.log(`  view_rate (complementario): ${r.view_rate?.toFixed(4) ?? "NULL"}%`);
console.log(`  viral_score:                ${r.viral_score?.toFixed(4) ?? "NULL"}`);
console.log("");
console.log("=".repeat(70));
