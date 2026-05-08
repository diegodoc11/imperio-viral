"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtCost } from "@/lib/pricing";
import { JobStatus } from "./JobStatus";

interface PreviewData {
  minHeat: string;
  count: number;
  estimatedCost: number;
  candidates: Array<{ username: string; reelCount: number; bestEr: number }>;
}

const HEAT_OPTIONS = [
  { value: "explosivo", label: "🔥🔥🔥 Solo top performers (view rate ≥9%)" },
  { value: "caliente", label: "🔥🔥 Caliente+ (view rate ≥6%) — recomendado" },
  { value: "tibio", label: "🔥 Tibio+ (view rate ≥3%) — más cobertura, más caro" },
];

export function EnrichSection() {
  const router = useRouter();
  const [minHeat, setMinHeat] = useState("caliente");
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Cargar preview cuando cambia el filtro
  useEffect(() => {
    if (jobId) return; // no refrescar mientras job corre
    let alive = true;
    setLoading(true);
    fetch(`/api/enrich/preview?minHeat=${minHeat}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData(null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [minHeat, jobId]);

  async function handleStart() {
    setError(null);
    try {
      const res = await fetch("/api/enrich/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minHeat }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Error");
      setJobId(d.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleDone() {
    setJobId(null);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-purple-900/30 bg-purple-950/10 p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            🚀 Detectar joyas ocultas
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Trae el conteo de followers de autores cuyos reels tienen{" "}
            <strong>view rate alto</strong> (engagement / views). Después
            podemos calcular su ER estándar real y detectar joyas ocultas
            (cuentas chicas con reels viralizando).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-purple-400 hover:underline"
        >
          {expanded ? "Ocultar" : "Mostrar"}
        </button>
      </header>

      {expanded && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <span>Calor mínimo:</span>
              <select
                value={minHeat}
                onChange={(e) => setMinHeat(e.target.value)}
                disabled={!!jobId}
                className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 hover:border-neutral-500 disabled:opacity-50"
              >
                {HEAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {loading ? (
              <span className="text-xs text-neutral-500">Calculando…</span>
            ) : data ? (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-neutral-400">
                  Sin enriquecer:{" "}
                  <strong className="text-neutral-100">{data.count}</strong>{" "}
                  autor(es)
                </span>
                <span className="text-neutral-400">
                  Costo:{" "}
                  <strong className="font-mono text-emerald-400">
                    ~{fmtCost(data.estimatedCost)}
                  </strong>
                </span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleStart}
              disabled={!data || data.count === 0 || !!jobId}
              className="ml-auto rounded-md bg-purple-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-neutral-700"
            >
              {data?.count
                ? `Enriquecer ${data.count} autor(es) →`
                : "Nada que enriquecer"}
            </button>
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

          {data && data.count > 0 && !jobId && (
            <details className="mt-3 text-xs text-neutral-400">
              <summary className="cursor-pointer text-neutral-300">
                Ver primeros candidatos
              </summary>
              <ul className="mt-2 space-y-0.5 font-mono">
                {data.candidates.slice(0, 20).map((c) => (
                  <li key={c.username}>
                    @{c.username} — {c.reelCount} reel(s) · mejor view rate{" "}
                    {c.bestEr.toFixed(1)}%
                  </li>
                ))}
                {data.count > 20 && (
                  <li className="text-neutral-500">
                    …y {data.count - 20} más
                  </li>
                )}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
