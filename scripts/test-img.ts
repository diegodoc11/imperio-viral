import "dotenv/config";
import { getDb } from "../lib/db";

async function main() {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT display_url, profile_pic_url FROM posts p LEFT JOIN profiles pr ON pr.username = p.source_profile WHERE source_profile = 'pedrosobral' AND display_url IS NOT NULL LIMIT 2"
    )
    .all() as any[];

  for (const r of rows) {
    console.log("\nFULL_URL=" + r.display_url);
    console.log("PROFILE_URL=" + r.profile_pic_url);
    try {
      const res = await fetch(r.display_url);
      console.log(`  display → status: ${res.status}, content-type: ${res.headers.get("content-type")}, size: ${res.headers.get("content-length")}`);
    } catch (e) {
      console.log(`  display → ERROR: ${e}`);
    }
    if (r.profile_pic_url) {
      try {
        const res = await fetch(r.profile_pic_url);
        console.log(`  profile → status: ${res.status}, content-type: ${res.headers.get("content-type")}, size: ${res.headers.get("content-length")}`);
      } catch (e) {
        console.log(`  profile → ERROR: ${e}`);
      }
    }
    break;
  }
}

main();
