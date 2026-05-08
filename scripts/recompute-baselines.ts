// Recalcula baselines de TODOS los perfiles con las ventanas configuradas:
//   - Mediana sobre últimos 180 días
//   - Posts >365 días pierden tier/multiplier
// Útil al cambiar la fórmula o ventanas. No re-scrapea nada (cero coste).

import "dotenv/config";
import { getDb, initSchema } from "../lib/db";
import { recomputeProfileBaseline } from "../lib/baseline";

function main() {
  initSchema();
  const db = getDb();

  const profiles = db
    .prepare("SELECT username FROM profiles ORDER BY username")
    .all() as Array<{ username: string }>;

  if (profiles.length === 0) {
    console.log("No hay perfiles. Corre npm run scrape:profile primero.");
    return;
  }

  console.log(`Recomputando baselines para ${profiles.length} perfil(es)…\n`);

  for (const { username } of profiles) {
    const r = recomputeProfileBaseline(username);
    console.log(
      `@${username}` +
        `  | sample baseline: ${r.baselineSampleSize}` +
        `  | activos: ${r.activePostsCount}` +
        `  | mediana ER: ${r.medianEngagementRate?.toFixed(2) ?? "—"}%` +
        `  | tagged: ${r.taggedPosts}`
    );
  }
  console.log();
}

main();
