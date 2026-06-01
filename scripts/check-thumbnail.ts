import "dotenv/config";
import { query, getPool } from "../lib/db";

(async () => {
  const id = process.argv[2];
  const r = await query<any>(
    `SELECT id, source_hashtag, thumbnail_storage_path, scraped_at, type
       FROM posts WHERE id = $1`,
    [id]
  );
  for (const p of r) {
    console.log(`id:                     ${p.id}`);
    console.log(`type:                   ${p.type}`);
    console.log(`source_hashtag:         ${p.source_hashtag}`);
    console.log(`thumbnail_storage_path: ${p.thumbnail_storage_path ?? "(NULL)"}`);
    console.log(`scraped_at:             ${new Date(p.scraped_at * 1000).toLocaleString("es-CO")}`);
  }
  await getPool().end();
})();
