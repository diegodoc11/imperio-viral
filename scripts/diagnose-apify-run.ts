// Trae los items de un Apify run y muestra qué tipos devolvió, por qué
// quizás algunos no llegaron a DB.
//
// Uso: npm run diagnose-apify-run -- --runId=RfKMFZMkY3btKoM9n

import "dotenv/config";
import { ApifyClient } from "apify-client";
import { getDb } from "../lib/db";

const runId = process.argv
  .find((a) => a.startsWith("--runId="))
  ?.split("=")[1];
if (!runId) throw new Error("Falta --runId=<id>");

async function main() {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Falta APIFY_TOKEN");
  const client = new ApifyClient({ token });
  const run = await client.run(runId).get();
  if (!run) throw new Error(`Run ${runId} no existe`);

  console.log(`Run: ${runId}`);
  console.log(`Status: ${run.status}`);
  console.log(`Started: ${run.startedAt}  Finished: ${run.finishedAt}`);
  console.log(`Stats: ${JSON.stringify(run.stats, null, 2).slice(0, 500)}`);

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`\nDataset: ${items.length} items\n`);

  const byType: Record<string, number> = {};
  for (const it of items as any[]) {
    const t = it.type ?? "(sin type)";
    byType[t] = (byType[t] ?? 0) + 1;
  }
  console.log("Por type:");
  for (const [t, n] of Object.entries(byType)) console.log(`  ${t}: ${n}`);

  // Cruzar con DB
  const db = getDb();
  const ids = (items as any[]).map((i) => i.id).filter(Boolean);
  if (ids.length === 0) {
    console.log("\n(items sin id)");
    return;
  }
  const placeholders = ids.map(() => "?").join(",");
  const inDb = db
    .prepare(`SELECT id, type FROM posts WHERE id IN (${placeholders})`)
    .all(...ids) as Array<{ id: string; type: string }>;
  const inDbIds = new Set(inDb.map((r) => r.id));

  console.log(`\nEn DB: ${inDb.length}/${items.length}`);
  const notInDb = (items as any[]).filter(
    (i) => i.id && !inDbIds.has(i.id)
  );
  if (notInDb.length > 0) {
    console.log(`\n${notInDb.length} items NO llegaron a DB:`);
    for (const it of notInDb.slice(0, 5)) {
      console.log(`  id=${it.id}  type=${it.type ?? "—"}  shortCode=${it.shortCode ?? "—"}`);
      console.log(
        `    likes=${it.likesCount} comments=${it.commentsCount} views=${
          it.videoPlayCount ?? it.videoViewCount ?? "—"
        }`
      );
    }
  }

  // ¿Hay items con id=undefined?
  const noId = (items as any[]).filter((i) => !i.id);
  if (noId.length > 0) {
    console.log(`\n${noId.length} items SIN id de Apify:`);
    for (const it of noId.slice(0, 3)) {
      console.log(`  type=${it.type}  caption="${(it.caption ?? "").slice(0, 60)}…"`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
