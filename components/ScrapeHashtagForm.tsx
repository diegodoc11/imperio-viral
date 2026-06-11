"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  APIFY_HASHTAG_COST_PER_ITEM,
  estimateHashtagScrapeCost,
  fmtCost,
} from "@/lib/pricing";
import { JobStatus } from "./JobStatus";

const RESULT_PRESETS = [20, 50, 100];

const TYPE_OPTIONS = [
  { value: "both", label: "Reels + Posts/Carruseles", count: 2 },
  { value: "reels", label: "Solo Reels", count: 1 },
  { value: "posts", label: "Solo Posts/Carruseles", count: 1 },
];

interface TagInfo {
  exists: boolean;
  postsCount: number;
  daysAgo: number | null;
  estimatedOverlapPct: number | null;
}

// Separa la entrada en hashtags individuales (coma, espacio o salto de línea).
// Debe coincidir con parseHashtags() del route para que el costo y el conteo
// que ve el usuario sean los reales.
function parseTags(raw: string): string[] {
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

export function ScrapeHashtagForm() {
  const router = useRouter();
  const [hashtag, setHashtag] = useState("");
  const [limit, setLimit] = useState(50);
  const [type, setType] = useState<"both" | "reels" | "posts">("reels");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tagInfo, setTagInfo] = useState<TagInfo | null>(null);

  const tags = parseTags(hashtag);
  const cleanTag = tags[0] ?? "";
  const typeMeta =
    TYPE_OPTIONS.find((t) => t.value === type) ?? TYPE_OPTIONS[0];
  // El costo escala con la cantidad de hashtags: cada uno es un scrape aparte.
  const cost = estimateHashtagScrapeCost(limit, typeMeta.count) * Math.max(1, tags.length);

  // Debounced fetch del info del hashtag mientras tipea — para warning de
  // duplicados antes de gastar. Solo aplica cuando hay UN hashtag (con varios
  // el chequeo de overlap no tiene un único objetivo claro).
  useEffect(() => {
    if (tags.length !== 1 || cleanTag.length < 2) {
      setTagInfo(null);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/hashtag/info?tag=${encodeURIComponent(cleanTag)}`)
        .then((r) => r.json())
        .then((d) => setTagInfo(d.exists ? d : null))
        .catch(() => setTagInfo(null));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanTag, tags.length]);

  async function handleSubmit() {
    setError(null);
    if (tags.length === 0) {
      setError("Escribe al menos un hashtag");
      return;
    }

    // Warning si re-scrapeo de hashtag con overlap alto previsible (solo
    // aplica cuando hay un único hashtag).
    if (tagInfo && tagInfo.estimatedOverlapPct != null && tagInfo.estimatedOverlapPct >= 50) {
      const days = tagInfo.daysAgo!.toFixed(1);
      const msg = `Ya tienes ${tagInfo.postsCount} posts de #${cleanTag} (último scrape: hace ${days} días).\n\nEstimación: ~${tagInfo.estimatedOverlapPct}% probablemente serán duplicados (Apify no permite filtrar al scrapear).\n\n¿Continuar y pagar de todas formas?`;
      if (!confirm(msg)) return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/scrape/hashtag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashtag: tags.join(","), limit, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setJobId(data.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDone() {
    setJobId(null);
    setHashtag("");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold">🏷️ Buscar por hashtag</h2>
        <p className="text-xs text-neutral-500">
          Apify devuelve la primera página del feed del hashtag (recientes en
          plan free). Para limitar a N días, después usa el filtro temporal.
          {" "}Puedes pegar <strong>varios</strong> separados por coma — cada uno
          se scrapea por separado y el costo se suma.
        </p>
      </header>

      <div className="flex items-center gap-2">
        <span className="text-neutral-500">#</span>
        <input
          type="text"
          value={hashtag}
          onChange={(e) => setHashtag(e.target.value)}
          disabled={!!jobId}
          placeholder="dineroconia, ganarconia, automatizacionia…"
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 p-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
      </div>

      {tagInfo?.exists && tagInfo.daysAgo != null && (
        <div
          className={
            "mt-2 rounded border p-2 text-xs " +
            ((tagInfo.estimatedOverlapPct ?? 0) >= 50
              ? "border-amber-700/50 bg-amber-950/30 text-amber-300"
              : "border-neutral-700 bg-neutral-900/40 text-neutral-300")
          }
        >
          {(tagInfo.estimatedOverlapPct ?? 0) >= 50 ? "⚠️ " : "ⓘ "}
          Ya tienes <strong>{tagInfo.postsCount}</strong> posts de #{cleanTag}
          {" "}(último scrape: hace{" "}
          <strong>
            {tagInfo.daysAgo < 1
              ? `${(tagInfo.daysAgo * 24).toFixed(1)}h`
              : `${tagInfo.daysAgo.toFixed(1)} días`}
          </strong>
          ). Estimación de duplicados si re-scrapeas:{" "}
          <strong>~{tagInfo.estimatedOverlapPct}%</strong>.
          {(tagInfo.estimatedOverlapPct ?? 0) >= 50 && (
            <span> Apify no permite filtrar — se paga igual por todo lo que devuelva.</span>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <span>Resultados:</span>
          <div className="flex gap-1">
            {RESULT_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLimit(n)}
                disabled={!!jobId}
                className={
                  "rounded border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 " +
                  (limit === n
                    ? "border-blue-500 bg-blue-950 text-blue-200"
                    : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800")
                }
              >
                {n}
              </button>
            ))}
          </div>
        </label>

        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <span>Tipo:</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            disabled={!!jobId}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 hover:border-neutral-500 disabled:opacity-50"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right text-xs">
            <div className="text-neutral-500">Costo estimado</div>
            <div className="font-mono text-emerald-400">
              ~{fmtCost(cost)}
            </div>
            <div className="text-[10px] text-neutral-600">
              {limit} × {typeMeta.count}
              {tags.length > 1 ? ` × ${tags.length} tags` : ""} × $
              {APIFY_HASHTAG_COST_PER_ITEM.toFixed(4)}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !!jobId || tags.length === 0}
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-neutral-700"
          >
            {submitting
              ? "Lanzando…"
              : tags.length > 1
                ? `Buscar ${tags.length} hashtags →`
                : `Buscar #${cleanTag || "?"} →`}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-800 bg-red-950/40 p-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {jobId && (
        <div className="mt-4">
          <JobStatus jobId={jobId} onDone={handleDone} />
        </div>
      )}
    </section>
  );
}
