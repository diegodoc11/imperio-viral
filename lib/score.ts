// Cálculo de métricas de viralidad — fórmulas industria-estándar.
//
//   engagement_score (REAL)  — Score absoluto ponderado:
//                              likes + comments×4 + shares×6
//                              Usado internamente para ranking, baselines
//                              y heat relativo al hashtag. Mantiene la
//                              ponderación del experto (un comment vale
//                              más que un like).
//
//   engagement_rate  (REAL%) — % industria-estándar:
//                              (likes + comments) / FOLLOWERS × 100
//
//                              Aplicado uniformemente a TODOS los tipos
//                              (reels, fotos, carruseles). Es la fórmula
//                              que usan Hootsuite, Sprout Social, HubSpot,
//                              HypeAuditor, Modash, Influencer Marketing
//                              Hub, etc. Los benchmarks publicados
//                              (1-3% promedio, 3-6% bueno, 6%+ excelente)
//                              están calibrados a esta fórmula.
//
//                              Si no conocemos followers → null.
//
//   view_rate        (REAL%) — Solo para reels: (likes + comments) /
//                              views × 100. Métrica complementaria que
//                              indica engagement entre los que vieron el
//                              reel. NO es el ER principal.
//
//   viral_velocity   (REAL)  — views/hora (o engagement_score/hora si no
//                              hay views).
//
//   viral_score      (REAL)  — log10(velocity+1) × (1 + ER%/100). Score
//                              combinado para ordenar global.
//
// IMPORTANTE: cuando likesCount es -1, IG ocultó el contador. Lo tratamos
// como 0 (es lo único que podemos hacer sin estimar).

import type { ApifyHashtagItem } from "./types";

const MIN_HOURS = 1;

export interface Scores {
  engagementScore: number;
  engagementRate: number | null;
  viewRate: number | null;
  viralVelocity: number | null;
  viralScore: number | null;
}

export interface ComputeScoresOptions {
  // Followers del autor — necesario para calcular el ER% estándar.
  followersCount?: number | null;
}

export function computeScores(
  item: ApifyHashtagItem,
  options: ComputeScoresOptions = {},
  now: Date = new Date()
): Scores {
  // -1 indica "Instagram ocultó el contador". Tratar como 0.
  const likes = Math.max(0, item.likesCount ?? 0);
  const comments = Math.max(0, item.commentsCount ?? 0);
  const shares = Math.max(0, item.sharesCount ?? 0);
  const views = item.videoViewCount ?? item.videoPlayCount ?? null;
  const followers = options.followersCount ?? null;

  // Score absoluto ponderado (ranking interno).
  const engagementScore = likes + comments * 4 + shares * 6;

  // ER% industria-estándar — por followers, para TODOS los tipos.
  let engagementRate: number | null = null;
  if (followers && followers > 0) {
    engagementRate = ((likes + comments) / followers) * 100;
  }

  // View rate (solo reels) — métrica complementaria, no la principal.
  let viewRate: number | null = null;
  if (views && views > 0) {
    viewRate = ((likes + comments) / views) * 100;
  }

  // Viral velocity — items por hora desde publicación.
  let viralVelocity: number | null = null;
  let viralScore: number | null = null;
  const postedAt = item.timestamp ? new Date(item.timestamp) : null;
  if (postedAt && !isNaN(postedAt.getTime())) {
    const hoursSincePosted = Math.max(
      MIN_HOURS,
      (now.getTime() - postedAt.getTime()) / (1000 * 60 * 60)
    );
    const reach = views ?? engagementScore;
    viralVelocity = reach / hoursSincePosted;

    // Combinamos con ER% estándar si lo tenemos, si no con view_rate
    // (mejor que nada para reels sin followers conocidos).
    const erFactor =
      engagementRate != null
        ? 1 + engagementRate / 100
        : viewRate != null
        ? 1 + viewRate / 100
        : 1;
    viralScore = Math.log10(viralVelocity + 1) * erFactor;
  }

  return {
    engagementScore: round(engagementScore, 0),
    engagementRate: engagementRate != null ? round(engagementRate, 2) : null,
    viewRate: viewRate != null ? round(viewRate, 2) : null,
    viralVelocity: viralVelocity != null ? round(viralVelocity, 2) : null,
    viralScore: viralScore != null ? round(viralScore, 4) : null,
  };
}

// Tier de engagement basado en benchmarks de industria para ER por followers.
// Calibración estándar (Hootsuite, Sprout Social, HubSpot, etc.):
export type EngagementTier =
  | "weak" //   <1%
  | "decent" // 1-3%
  | "good" //   3-6%
  | "winner" // 6-9%
  | "validate"; // 9%+ — outlier, validar

export function engagementTier(rate: number | null): EngagementTier | null {
  if (rate == null) return null;
  if (rate < 1) return "weak";
  if (rate < 3) return "decent";
  if (rate < 6) return "good";
  if (rate < 9) return "winner";
  return "validate";
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
