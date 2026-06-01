import "dotenv/config";
import { query, getPool } from "../lib/db";

(async () => {
  console.log("→ Aplicando migración thumbnail_storage_path...");
  await query(
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumbnail_storage_path text"
  );
  const r = await query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'thumbnail_storage_path'"
  );
  console.log(`Columna existe: ${r.length > 0 ? "✓" : "✗"}`);
  await getPool().end();
})();
