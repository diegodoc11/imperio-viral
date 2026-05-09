"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const TIME_WINDOWS = [
  { value: "7", label: "Última semana" },
  { value: "15", label: "Últimos 15 días" },
  { value: "30", label: "Último mes" },
  { value: "90", label: "Últimos 3 meses" },
  { value: "180", label: "Últimos 6 meses" },
  { value: "365", label: "Último año" },
  { value: "all", label: "Todo el histórico" },
];

const LANGS = [
  { value: "all", label: "Todos los idiomas" },
  { value: "supported", label: "✅ Solo ES/EN/PT (excluye fr/hindi/etc.)" },
  { value: "es", label: "🇪🇸 Español" },
  { value: "en", label: "🇺🇸 English" },
  { value: "pt", label: "🇧🇷 Português" },
];

const TYPES = [
  { value: "all", label: "Todos los tipos" },
  { value: "Video", label: "🎬 Reels" },
  { value: "Sidecar", label: "🖼️ Carruseles" },
  { value: "Image", label: "📷 Fotos" },
];

const TIERS = [
  { value: "all", label: "Cualquier tier" },
  { value: "good", label: "🟢 good (2-5×)" },
  { value: "viral", label: "🥉 viral (5-10×)" },
  { value: "gem", label: "🥈 gem (10-25×)" },
  { value: "diamond", label: "🥇 diamond (25-50×)" },
  { value: "unicorn", label: "💎 unicorn (50×+)" },
];

const HEATS = [
  { value: "all", label: "Cualquier calor" },
  { value: "fresco", label: "🌿 Fresco+ (≥1%)" },
  { value: "tibio", label: "🔥 Tibio+ (≥3%)" },
  { value: "caliente", label: "🔥🔥 Caliente+ (≥6%)" },
  { value: "explosivo", label: "🔥🔥🔥 Solo explosivo (≥9%)" },
];

const SORTS = [
  { value: "viralScore", label: "🔥 Score viral (recomendado)" },
  { value: "viewsPerFollower", label: "🚀 Joyas ocultas (views/followers)" },
  { value: "viralidadMultiplier", label: "Viralidad vs perfil (mult.)" },
  { value: "engagementRate", label: "Engagement %" },
  { value: "viralVelocity", label: "Velocidad viral (views/h)" },
  { value: "videoViewCount", label: "Más vistas (solo reels)" },
];

const DECISIONS = [
  { value: "all", label: "Todos" },
  { value: "none", label: "Sin decidir" },
  { value: "replicate", label: "✓ Replicar" },
  { value: "maybe", label: "? Tal vez" },
  { value: "skip", label: "✕ Skip" },
];

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(sp.toString());
      if (value === "all" || value === "") next.delete(key);
      else next.set(key, value);
      router.push(`${pathname}?${next.toString()}`);
    },
    [router, pathname, sp]
  );

  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <Select
        label="Ventana"
        value={sp.get("window") ?? "90"}
        options={TIME_WINDOWS}
        onChange={(v) => update("window", v === "90" ? "" : v)}
      />
      <Select
        label="Idioma"
        value={sp.get("lang") ?? "all"}
        options={LANGS}
        onChange={(v) => update("lang", v)}
      />
      <Select
        label="Tipo"
        value={sp.get("type") ?? "all"}
        options={TYPES}
        onChange={(v) => update("type", v)}
      />
      <Select
        label="Tier perfil"
        value={sp.get("tier") ?? "all"}
        options={TIERS}
        onChange={(v) => update("tier", v)}
      />
      <Select
        label="Calor (ER%)"
        value={sp.get("heat") ?? "all"}
        options={HEATS}
        onChange={(v) => update("heat", v)}
      />
      <Select
        label="Decisión"
        value={sp.get("decision") ?? "all"}
        options={DECISIONS}
        onChange={(v) => update("decision", v)}
      />
      <Select
        label="Ordenar"
        value={sp.get("sort") ?? "viralScore"}
        options={SORTS}
        onChange={(v) => update("sort", v === "viralScore" ? "" : v)}
      />
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-400">
      <span>{label}</span>
      <select
        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 hover:border-neutral-500 focus:border-blue-500 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
