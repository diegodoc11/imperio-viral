import { NextRequest, NextResponse } from "next/server";
import type { ResultsType } from "@/lib/apify";
import { scrapeHashtag } from "@/lib/scrape-actions";
import { createJob, finishJob, updateJobMessage } from "@/lib/jobs";

export const runtime = "nodejs";

// Separa la entrada en hashtags individuales. El usuario puede pegar varios
// separados por coma, espacio o salto de línea (el placeholder del form los
// muestra con comas, así que esto es lo que la gente naturalmente escribe).
// Cada hashtag se limpia de "#" y se baja a minúscula. Apify rechaza un solo
// "hashtag" que contenga comas/espacios — por eso hay que separarlos acá.
function parseHashtags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[\s,]+/)) {
    const clean = piece.trim().replace(/^#+/, "").toLowerCase();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      hashtag?: string;
      limit?: number;
      type?: "posts" | "reels" | "both";
    };
    const hashtags = parseHashtags(body.hashtag ?? "");
    const limit = Math.max(1, Math.min(500, body.limit ?? 50));
    const typeArg = body.type ?? "both";

    if (hashtags.length === 0) {
      return NextResponse.json(
        { error: "Falta hashtag" },
        { status: 400 }
      );
    }

    const types: ResultsType[] =
      typeArg === "both" ? ["posts", "reels"] : [typeArg];

    const label =
      hashtags.length === 1
        ? `Buscar #${hashtags[0]} (${types.join("+")}, ${limit} c/u)`
        : `Buscar ${hashtags.length} hashtags (${types.join("+")}, ${limit} c/u)`;

    const jobId = await createJob(
      "hashtag",
      { hashtags, limit, types },
      label
    );

    runJob(jobId, hashtags, types, limit);

    return NextResponse.json({ jobId, hashtags, limit, types });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}

async function runJob(
  jobId: string,
  hashtags: string[],
  types: ResultsType[],
  limit: number
) {
  const summary: any[] = [];
  // Total de pasos = hashtags × tipos. Cada par (hashtag, tipo) es un scrape
  // independiente con su propia atribución y recompute de heat.
  const total = hashtags.length * types.length;
  let step = 0;
  try {
    for (const hashtag of hashtags) {
      for (const t of types) {
        step++;
        await updateJobMessage(
          jobId,
          `[${step}/${total}] #${hashtag} (${t})…`
        );
        try {
          const r = await scrapeHashtag(hashtag, t, limit);
          summary.push({
            hashtag,
            type: t,
            received: r.itemsReceived,
            inserted: r.inserted,
            updated: r.updated,
          });
        } catch (e) {
          summary.push({
            hashtag,
            type: t,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    const totalReceived = summary.reduce(
      (acc, s) => acc + (s.received ?? 0),
      0
    );
    const label =
      hashtags.length === 1
        ? `Listo — #${hashtags[0]}`
        : `Listo — ${hashtags.length} hashtags · ${totalReceived} items`;
    await finishJob(jobId, "done", {
      result: summary,
      message: label,
    });
  } catch (e) {
    await finishJob(jobId, "failed", {
      error: e instanceof Error ? e.message : String(e),
      result: summary,
    });
  }
}
