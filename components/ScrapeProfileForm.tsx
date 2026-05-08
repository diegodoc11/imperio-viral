"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  APIFY_PROFILE_COST_PER_ITEM,
  estimateProfileScrapeCost,
  fmtCost,
} from "@/lib/pricing";
import { JobStatus } from "./JobStatus";

const PRESETS = [50, 100, 200, 300];

export function ScrapeProfileForm() {
  const router = useRouter();
  const [users, setUsers] = useState("");
  const [limit, setLimit] = useState(200);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Parsear usernames del textarea (uno por línea o coma)
  const parsed = users
    .split(/[\s,;\n]+/)
    .map((u) => u.trim().replace(/^@/, "").replace(/^https?:\/\/.*?instagram\.com\/(.+?)\/?$/i, "$1"))
    .filter(Boolean);

  const cost = estimateProfileScrapeCost(limit, parsed.length || 1);

  async function handleSubmit() {
    setError(null);
    if (parsed.length === 0) {
      setError("Pega al menos un username");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/scrape/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: parsed, limit }),
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
    setUsers("");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold">🔍 Investigar perfiles</h2>
        <p className="text-xs text-neutral-500">
          Pega usernames o URLs de Instagram, separados por coma o salto de línea.
          Si ya hay un perfil en la DB, el scrape será incremental (solo posts nuevos).
        </p>
      </header>

      <textarea
        value={users}
        onChange={(e) => setUsers(e.target.value)}
        rows={3}
        disabled={!!jobId}
        placeholder="pedrosobral, @juanlombana, https://instagram.com/babruna"
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 p-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <span>Posts/perfil:</span>
          <div className="flex gap-1">
            {PRESETS.map((n) => (
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

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right text-xs">
            <div className="text-neutral-500">Costo estimado</div>
            <div className="font-mono text-emerald-400">
              ~{fmtCost(cost)}
            </div>
            <div className="text-[10px] text-neutral-600">
              {parsed.length || 1} × {limit} × ${APIFY_PROFILE_COST_PER_ITEM.toFixed(4)}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !!jobId || parsed.length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-neutral-700"
          >
            {submitting ? "Lanzando…" : `Analizar ${parsed.length || ""} →`}
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
