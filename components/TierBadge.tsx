import type { ViralTier } from "@/lib/types";

const TIER_CONFIG: Record<
  ViralTier,
  { label: string; emoji: string; bg: string; text: string; border: string }
> = {
  good: {
    label: "good",
    emoji: "🟢",
    bg: "bg-emerald-950/40",
    text: "text-emerald-300",
    border: "border-emerald-700/50",
  },
  viral: {
    label: "viral",
    emoji: "🥉",
    bg: "bg-amber-950/40",
    text: "text-amber-300",
    border: "border-amber-700/50",
  },
  gem: {
    label: "gem",
    emoji: "🥈",
    bg: "bg-slate-800/60",
    text: "text-slate-200",
    border: "border-slate-500/60",
  },
  diamond: {
    label: "diamond",
    emoji: "🥇",
    bg: "bg-yellow-950/40",
    text: "text-yellow-300",
    border: "border-yellow-600/60",
  },
  unicorn: {
    label: "unicorn",
    emoji: "💎",
    bg: "bg-purple-950/50",
    text: "text-purple-300",
    border: "border-purple-500/60",
  },
};

export function TierBadge({
  tier,
  multiplier,
  size = "md",
}: {
  tier: ViralTier;
  multiplier?: number | null;
  size?: "sm" | "md";
}) {
  const c = TIER_CONFIG[tier];
  const padding = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-medium ${padding} ${c.bg} ${c.text} ${c.border}`}
    >
      <span>{c.emoji}</span>
      <span className="uppercase tracking-wide">{c.label}</span>
      {multiplier != null && (
        <span className="opacity-70">{multiplier.toFixed(1)}×</span>
      )}
    </span>
  );
}

export function EngagementBadge({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-gray-500 text-xs">— ER</span>;
  let color = "text-gray-400";
  if (rate >= 9) color = "text-orange-400";
  else if (rate >= 6) color = "text-emerald-400";
  else if (rate >= 3) color = "text-yellow-400";
  else if (rate >= 1) color = "text-blue-400";
  else color = "text-gray-500";
  return <span className={`text-xs font-mono ${color}`}>{rate.toFixed(1)}% ER</span>;
}

// Tipos de calor basados en engagement_rate (%) — fórmula industria-estándar:
// (likes + comments) / FOLLOWERS × 100 para todos los tipos.
// Umbrales calibrados a benchmarks publicados por Hootsuite, Sprout Social,
// HubSpot, HypeAuditor, etc.
//
//  ER ≥ 9%   → 🔥🔥🔥 explosivo (outlier — validar)
//  ER 6-9%   → 🔥🔥  caliente (excelente)
//  ER 3-6%   → 🔥   tibio (bueno)
//  ER 1-3%   → 🌿   fresco (promedio mercado)
//  ER < 1%   → (sin badge — bajo benchmark)
export type HeatLevel = "fresco" | "tibio" | "caliente" | "explosivo";

const HEAT_ORDER: HeatLevel[] = ["fresco", "tibio", "caliente", "explosivo"];

export function classifyHeat(rate: number | null): HeatLevel | null {
  if (rate == null || rate < 1) return null;
  if (rate >= 9) return "explosivo";
  if (rate >= 6) return "caliente";
  if (rate >= 3) return "tibio";
  return "fresco";
}

export function heatRank(level: HeatLevel): number {
  return HEAT_ORDER.indexOf(level);
}

const HEAT_CONFIG: Record<
  HeatLevel,
  { emoji: string; label: string; bg: string; text: string; border: string }
> = {
  fresco: {
    emoji: "🌿",
    label: "fresco",
    bg: "bg-stone-800/60",
    text: "text-stone-300",
    border: "border-stone-600/60",
  },
  tibio: {
    emoji: "🔥",
    label: "tibio",
    bg: "bg-yellow-950/40",
    text: "text-yellow-300",
    border: "border-yellow-700/50",
  },
  caliente: {
    emoji: "🔥🔥",
    label: "caliente",
    bg: "bg-emerald-950/50",
    text: "text-emerald-300",
    border: "border-emerald-600/60",
  },
  explosivo: {
    emoji: "🔥🔥🔥",
    label: "explosivo",
    bg: "bg-orange-950/50",
    text: "text-orange-300",
    border: "border-orange-600/60",
  },
};

export function HeatBadge({
  rate,
  size = "sm",
}: {
  rate: number | null;
  size?: "sm" | "md";
}) {
  const level = classifyHeat(rate);
  if (!level) return null;
  const c = HEAT_CONFIG[level];
  const padding =
    size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-medium ${padding} ${c.bg} ${c.text} ${c.border}`}
    >
      <span>{c.emoji}</span>
      <span className="uppercase tracking-wide">{c.label}</span>
    </span>
  );
}

// HashtagHeatBadge: clasificación de fotos/carruseles relativo a la mediana
// del hashtag. Visualmente igual que HeatBadge pero con el multiplicador
// expuesto y un sufijo "vs hashtag" para distinguirlo conceptualmente.
export function HashtagHeatBadge({
  tier,
  mult,
  size = "sm",
}: {
  tier: HeatLevel;
  mult: number | null;
  size?: "sm" | "md";
}) {
  const c = HEAT_CONFIG[tier];
  const padding =
    size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-medium ${padding} ${c.bg} ${c.text} ${c.border}`}
      title={`${(mult ?? 0).toFixed(1)}× la mediana de su tipo en el hashtag`}
    >
      <span>{c.emoji}</span>
      <span className="uppercase tracking-wide">{c.label}</span>
      {mult != null && (
        <span className="opacity-70">{mult.toFixed(1)}×</span>
      )}
    </span>
  );
}
