// Diagnostico rápido: últimos scrape runs + posts recién insertados.
// Funciona contra Postgres (Supabase) usando lib/db.ts. No depende de SQLite.
//
// Uso:
//   npm run diagnose-recent                  # últimas 24h
//   npx tsx scripts/diagnose-recent.ts 6     # últimas 6h

import "dotenv/config";
import { query, getWorkspaceId } from "../lib/db";

async function main() {
  const hours = Number(process.argv[2] ?? "24");
  const wsId = getWorkspaceId();
  const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;

  console.log(`\nWorkspace: ${wsId}`);
  console.log(`Ventana: últimas ${hours}h (epoch >= ${cutoff})\n`);

  // ---- 1. Scrape runs recientes ----
  const runs = await query<{
    id: number;
    hashtag: string | null;
    started_at: number;
    finished_at: number | null;
    items_count: number | null;
    apify_run_id: string | null;
    error: string | null;
  }>(
    `SELECT id, hashtag, started_at, finished_at, items_count, apify_run_id, error
       FROM scrape_runs
      WHERE workspace_id = $1
        AND started_at >= $2
      ORDER BY started_at DESC
      LIMIT 20`,
    [wsId, cutoff]
  );

  console.log(`── SCRAPE RUNS (${runs.length}) ──────────────────────────────`);
  if (runs.length === 0) {
    console.log(`  (sin runs en las últimas ${hours}h)`);
  } else {
    for (const r of runs) {
      const startStr = new Date(r.started_at * 1000).toLocaleString("es-CO");
      const elapsed =
        r.finished_at != null ? r.finished_at - r.started_at : null;
      const status = r.error
        ? `❌ ERROR: ${r.error}`
        : r.finished_at == null
          ? "⏳ en curso"
          : `✓ ${r.items_count ?? "?"} items en ${elapsed}s`;
      console.log(
        `  [${r.id}] ${startStr}  target="${r.hashtag ?? "—"}"  ${status}`
      );
      if (r.apify_run_id) console.log(`        apify_run_id=${r.apify_run_id}`);
    }
  }

  // ---- 2. Posts recién insertados ----
  const postsCount = await query<{
    niche_id: string | null;
    source_hashtag: string | null;
    source_profile: string | null;
    type: string;
    n: string;
  }>(
    `SELECT niche_id, source_hashtag, source_profile, type, COUNT(*)::text AS n
       FROM posts
      WHERE workspace_id = $1
        AND scraped_at >= $2
      GROUP BY niche_id, source_hashtag, source_profile, type
      ORDER BY COUNT(*) DESC`,
    [wsId, cutoff]
  );

  console.log(
    `\n── POSTS INSERTADOS / ACTUALIZADOS (últimas ${hours}h) ──────────`
  );
  if (postsCount.length === 0) {
    console.log(`  (sin posts nuevos en las últimas ${hours}h)`);
  } else {
    let total = 0;
    for (const p of postsCount) {
      total += Number(p.n);
      const source = p.source_hashtag
        ? `#${p.source_hashtag}`
        : p.source_profile
          ? `@${p.source_profile}`
          : "—";
      console.log(
        `  ${source.padEnd(30)} ${p.type.padEnd(8)} niche=${p.niche_id?.slice(0, 8) ?? "—"}…  ${p.n} posts`
      );
    }
    console.log(`  ─────────────────────────────────────────`);
    console.log(`  TOTAL: ${total} posts`);
  }

  // ---- 3. Conteo total en posts (referencia) ----
  const total = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM posts WHERE workspace_id = $1`,
    [wsId]
  );
  console.log(
    `\n── REFERENCIA: total de posts en la DB: ${total[0].n} ──────────\n`
  );

  process.exit(0);
}

main().catch((e) => {
  console.error("Falló:", e);
  process.exit(1);
});
