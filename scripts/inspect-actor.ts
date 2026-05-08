// Lista los inputs aceptados por el actor de Apify.
// Uso: npm run inspect-actor

import "dotenv/config";
import { ApifyClient } from "apify-client";

const ACTOR_ID = process.argv.find((a) => a.startsWith("--actor="))?.split("=")[1]
  ?? "apify/instagram-hashtag-scraper";

async function main() {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Falta APIFY_TOKEN");

  const client = new ApifyClient({ token });
  const actor = await client.actor(ACTOR_ID).get();

  if (!actor) {
    console.log("Actor no encontrado");
    return;
  }

  console.log("Nombre:", actor.title ?? actor.name);
  console.log("ID:", actor.id);
  console.log("\nLast modified:", actor.modifiedAt);
  console.log("\nExample input:");
  console.log(JSON.stringify(actor.exampleRunInput?.body ?? null, null, 2));

  // Schema del input — vía Apify HTTP API directamente.
  const buildsList = await client.actor(ACTOR_ID).builds().list();
  const latestBuildId = buildsList.items[0]?.id;
  if (!latestBuildId) {
    console.log("\nNo hay builds.");
    return;
  }

  const buildResp = await fetch(
    `https://api.apify.com/v2/actor-builds/${latestBuildId}?token=${token}`
  );
  const buildJson = (await buildResp.json()) as any;
  const inputSchema = buildJson?.data?.actorDefinition?.input;

  console.log("\nInput schema (propiedades):");
  if (inputSchema?.properties) {
    for (const [key, val] of Object.entries(inputSchema.properties)) {
      const v = val as any;
      console.log(
        `  - ${key} (${v.type ?? "?"}): ${v.title ?? ""}${
          v.enum ? "  enum=[" + v.enum.join(", ") + "]" : ""
        }`
      );
      if (v.description) {
        console.log(
          `      ${v.description.split("\n")[0].slice(0, 120)}`
        );
      }
    }
    console.log("\nDefault values:");
    console.log(JSON.stringify(buildJson?.data?.actorDefinition?.exampleInput ?? null, null, 2));
  } else {
    console.log("  (no disponible)");
    console.log("Build raw keys:", Object.keys(buildJson?.data ?? {}));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
