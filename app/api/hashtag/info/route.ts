import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// Devuelve info del hashtag para mostrar warning antes de scrapear:
//   - cuántos posts ya tenemos de ese hashtag
//   - cuándo fue el último scrape
//   - estimación de "% probable de duplicados" (si fue reciente)
export async function GET(req: NextRequest) {
  const tag = (req.nextUrl.searchParams.get("tag") ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, "");
  if (!tag) {
    return NextResponse.json({ tag: "", exists: false }, { status: 200 });
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COUNT(*)              AS posts_count,
         MAX(scraped_at)       AS last_scraped_at
       FROM posts
       WHERE source_hashtag = ?`
    )
    .get(tag) as { posts_count: number; last_scraped_at: number | null };

  const exists = (row.posts_count ?? 0) > 0;
  const daysAgo = row.last_scraped_at
    ? (Date.now() / 1000 - row.last_scraped_at) / 86400
    : null;

  // Estimación grosera del % de duplicados que devolvería Apify si rescrapas
  // ahora. Basado en heurística de feeds de hashtag — cambian poco día a día
  // para hashtags maduros, mucho para hashtags pequeños o de noticias.
  let estimatedOverlapPct: number | null = null;
  if (daysAgo != null) {
    if (daysAgo < 1) estimatedOverlapPct = 90;
    else if (daysAgo < 3) estimatedOverlapPct = 75;
    else if (daysAgo < 7) estimatedOverlapPct = 50;
    else if (daysAgo < 30) estimatedOverlapPct = 25;
    else estimatedOverlapPct = 10;
  }

  return NextResponse.json({
    tag,
    exists,
    postsCount: row.posts_count ?? 0,
    lastScrapedAt: row.last_scraped_at,
    daysAgo,
    estimatedOverlapPct,
  });
}
