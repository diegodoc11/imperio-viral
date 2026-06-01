import "dotenv/config";
import { Client } from "pg";

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const wsId = process.env.DEFAULT_WORKSPACE_ID!;
  console.log(`Workspace: ${wsId}\n`);
  const tables = [
    "workspaces",
    "niches",
    "profiles",
    "posts",
    "decisions",
    "transcriptions",
    "adaptations",
    "scrape_runs",
    "jobs",
  ];
  for (const t of tables) {
    const q =
      t === "workspaces"
        ? `SELECT COUNT(*)::int n FROM workspaces WHERE id = $1`
        : `SELECT COUNT(*)::int n FROM ${t} WHERE workspace_id = $1`;
    const r = await c.query(q, [wsId]);
    console.log(`  ${t.padEnd(15)} ${r.rows[0].n}`);
  }
  await c.end();
})();
