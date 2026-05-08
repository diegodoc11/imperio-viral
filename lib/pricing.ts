// Estimaciones de coste de Apify. Pricing público (puede variar ±10%).
// Verificado 2026-05-08 desde la página de cada actor.
//
// Si Apify cambia el pricing, ajustar aquí. La app muestra "estimación".

export const APIFY_PROFILE_COST_PER_ITEM = 0.0027; // $/post — apify/instagram-scraper $2.70/1k
export const APIFY_HASHTAG_COST_PER_ITEM = 0.0026; // $/post — apify/instagram-hashtag-scraper $2.60/1k
export const APIFY_PLAN_NAME = "Starter"; // user upgraded 2026-05-08
export const APIFY_MONTHLY_CREDIT = 29; // USD — Starter plan ($29/mes, Bronze tier)
// Nota: Bronze tier da un pequeño descuento sobre los actores del Store
// (típicamente 5-10%). El consumo real será un poco menor que la estimación
// nominal mostrada — Apify lo refleja en su dashboard de billing.

export function estimateProfileScrapeCost(
  postsPerProfile: number,
  profileCount = 1
): number {
  return postsPerProfile * profileCount * APIFY_PROFILE_COST_PER_ITEM;
}

export function estimateHashtagScrapeCost(
  postsPerCall: number,
  typeCount = 1
): number {
  return postsPerCall * typeCount * APIFY_HASHTAG_COST_PER_ITEM;
}

export function fmtCost(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

// Cuántos perfiles caben en el plan free dado un límite de posts/perfil.
export function profilesPerFreeMonth(postsPerProfile: number): number {
  return Math.floor(
    APIFY_MONTHLY_CREDIT /
      (postsPerProfile * APIFY_PROFILE_COST_PER_ITEM)
  );
}
