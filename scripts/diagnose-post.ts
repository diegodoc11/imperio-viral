// Inspecciona por qué un post no tiene clasificación.
// Uso: npm run diagnose-post -- --id=3885302632181490021

import "dotenv/config";
import { getDb } from "../lib/db";

const id =
  process.argv.find((a) => a.startsWith("--id="))?.split("=")[1];
if (!id) throw new Error("Falta --id=<post_id>");

const db = getDb();
const r = db
  .prepare(
    `SELECT id, type, owner_username, source_profile, source_hashtag,
            posted_at, scraped_at,
            likes_count, comments_count,
            video_view_count, video_play_count,
            engagement_score, engagement_rate, viral_velocity,
            viralidad_multiplier, viral_tier, language, caption
     FROM posts WHERE id = ?`
  )
  .get(id) as any;

if (!r) {
  console.log("Post no existe en la DB.");
  process.exit(0);
}

const ageDays = ((Date.now() / 1000 - r.posted_at) / 86400).toFixed(1);
const plays = r.video_view_count ?? r.video_play_count;

console.log("=".repeat(70));
console.log(`ID: ${r.id}`);
console.log(`Tipo: ${r.type}  (${r.type === "Video" ? "🎬 Reel" : r.type === "Sidecar" ? "🖼️ Carrusel" : "📷 Foto"})`);
console.log(`Autor: @${r.owner_username}`);
console.log(`Edad: ${ageDays} días`);
console.log(`Origen: profile=${r.source_profile ?? "—"}  hashtag=${r.source_hashtag ?? "—"}`);
console.log("");
console.log("Métricas crudas:");
console.log(`  likes:        ${r.likes_count}`);
console.log(`  comments:     ${r.comments_count}`);
console.log(`  views/plays:  ${plays ?? "NULL"}`);
console.log("");
console.log("Métricas calculadas:");
console.log(`  engagement_score:      ${r.engagement_score ?? "NULL"}`);
console.log(`  engagement_rate (%):   ${r.engagement_rate ?? "NULL"}  ← determina HeatBadge (≥3%)`);
console.log(`  viral_velocity:        ${r.viral_velocity ?? "NULL"}`);
console.log(`  viralidad_multiplier:  ${r.viralidad_multiplier ?? "NULL"}  ← determina TierBadge`);
console.log(`  viral_tier:            ${r.viral_tier ?? "NULL"}`);
console.log("");
console.log("Diagnóstico:");
if (r.viral_tier == null && (r.engagement_rate == null || r.engagement_rate < 3)) {
  console.log("  ❌ Sin clasificación porque:");
  if (r.viral_tier == null) {
    if (r.source_profile == null) {
      console.log(`     • No tiene tier de perfil — no fue scrapeado por profile (solo por hashtag)`);
    } else {
      console.log(`     • Tiene perfil ${r.source_profile} pero su multiplier es null o <2× la mediana`);
    }
  }
  if (r.engagement_rate == null) {
    if (r.type !== "Video") {
      console.log(`     • Engagement rate (%) no aplica — ${r.type} no tiene "views" públicas`);
    } else {
      console.log(`     • Es reel pero plays=NULL en la data de Apify`);
    }
  } else if (r.engagement_rate < 3) {
    console.log(`     • Engagement rate ${r.engagement_rate.toFixed(2)}% está por debajo del umbral "tibio" (≥3%)`);
  }
}
console.log("=".repeat(70));
