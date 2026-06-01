import "dotenv/config";
import { getPostById } from "../lib/queries";
import { getPool } from "../lib/db";

(async () => {
  const p = await getPostById("3652171099153667590");
  if (!p) {
    console.log("Post no encontrado");
    process.exit(1);
  }
  console.log("Display URL que la app pasará a <img>:");
  console.log(`  ${p.displayUrl}`);
  console.log("\nDebe empezar con https://...supabase.co/storage/v1/...");
  await getPool().end();
})();
