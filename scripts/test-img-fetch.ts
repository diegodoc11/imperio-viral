import "dotenv/config";
import { queryOne, getPool, getWorkspaceId } from "../lib/db";

(async () => {
  const wsId = getWorkspaceId();
  const id = process.argv[2] ?? "3837056987016563766";

  const p = await queryOne<{ display_url: string; video_url: string | null }>(
    `SELECT display_url, video_url FROM posts WHERE workspace_id = $1 AND id = $2`,
    [wsId, id]
  );

  if (!p) {
    console.log("Post no encontrado");
    process.exit(1);
  }

  console.log("\n→ Probando display_url:");
  console.log(`  ${p.display_url}`);
  try {
    const r = await fetch(p.display_url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    console.log(`  Status: ${r.status} ${r.statusText}`);
    console.log(`  Content-Type: ${r.headers.get("content-type")}`);
    console.log(`  Content-Length: ${r.headers.get("content-length")}`);
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }

  if (p.video_url) {
    console.log("\n→ Probando video_url:");
    console.log(`  ${p.video_url.slice(0, 100)}...`);
    try {
      const r = await fetch(p.video_url, {
        method: "HEAD",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });
      console.log(`  Status: ${r.status} ${r.statusText}`);
    } catch (e: any) {
      console.log(`  ERROR: ${e.message}`);
    }
  }

  await getPool().end();
})();
