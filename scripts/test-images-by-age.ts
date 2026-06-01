// Prueba el display_url de posts de distintas edades para ver si hay un
// patrón de caducidad. Si los nuevos cargan y los viejos no, hay ventana
// de validez. Si todos fallan, IG bloquea de raíz.

import "dotenv/config";
import { query, getPool, getWorkspaceId } from "../lib/db";

async function testUrl(url: string): Promise<{ status: number; bytes: number }> {
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const buf = await r.arrayBuffer();
    return { status: r.status, bytes: buf.byteLength };
  } catch (e: any) {
    return { status: -1, bytes: 0 };
  }
}

(async () => {
  const wsId = getWorkspaceId();
  const now = Math.floor(Date.now() / 1000);

  const buckets = [
    { label: "≤ 6 horas", min: 0, max: 6 * 3600 },
    { label: "6-24 horas", min: 6 * 3600, max: 24 * 3600 },
    { label: "1-3 días", min: 24 * 3600, max: 3 * 24 * 3600 },
    { label: "3-7 días", min: 3 * 24 * 3600, max: 7 * 24 * 3600 },
    { label: "7-30 días", min: 7 * 24 * 3600, max: 30 * 24 * 3600 },
    { label: "> 30 días", min: 30 * 24 * 3600, max: 365 * 24 * 3600 },
  ];

  console.log("\nProbando 3 posts por cada bucket de antigüedad...\n");
  console.log("Bucket".padEnd(15) + "Status".padEnd(10) + "Bytes".padEnd(12) + "Post ID");
  console.log("─".repeat(80));

  for (const b of buckets) {
    const fromTs = now - b.max;
    const toTs = now - b.min;
    const posts = await query<{ id: string; display_url: string | null; scraped_at: number }>(
      `SELECT id, display_url, scraped_at
         FROM posts
        WHERE workspace_id = $1
          AND scraped_at BETWEEN $2 AND $3
          AND display_url IS NOT NULL
        ORDER BY RANDOM()
        LIMIT 3`,
      [wsId, fromTs, toTs]
    );

    if (posts.length === 0) {
      console.log(b.label.padEnd(15) + "(no hay posts en este rango)");
      continue;
    }

    for (const p of posts) {
      const r = await testUrl(p.display_url!);
      const statusStr =
        r.status === 200 ? `✓ ${r.status}` : r.status === -1 ? "✗ ERR" : `✗ ${r.status}`;
      console.log(
        b.label.padEnd(15) + statusStr.padEnd(10) + String(r.bytes).padEnd(12) + p.id
      );
    }
  }

  await getPool().end();
})();
