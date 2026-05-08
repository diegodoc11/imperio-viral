// Inferencia de idioma para un post.
//
// Estrategia en dos pasos:
//   1. Si el hashtag origen está mapeado a un idioma claro (`aiads` → "en",
//      `trafegopago` → "pt", `anunciosconia` → "es"), lo usamos directo.
//   2. Si el hashtag es neutro/multi-idioma (`claudeai`, `iaparanegocios`,
//      `chatgpt`...), inferimos a partir del caption del post mediante
//      conteo de stopwords distintivas y caracteres específicos (ñ, ã, õ).

// "other" = idioma detectado pero no soportado (francés, italiano, alemán,
// hindi, árabe, chino, etc.). El usuario los filtra con "Solo ES/EN/PT".
export type Language = "es" | "en" | "pt" | "other";

// null = el hashtag aparece en varios idiomas con la misma grafía → inferir de caption.
const HASHTAG_LANG: Record<string, Language | null> = {
  // Español
  anunciosconia: "es",
  creativosconia: "es",
  pautadigital: "es",
  traficopago: "es",
  automatizacionia: "es",
  chatgptparanegocios: "es",
  ganarconia: "es",
  iaparaemprender: "es",
  iagenerativa: "es",

  // Inglés
  aiads: "en",
  aimarketing: "en",
  aiformarketers: "en",
  aitools: "en",
  aicreatives: "en",
  mediabuying: "en",
  aibusiness: "en",
  promptengineering: "en",

  // Portugués (Brasil)
  trafegopago: "pt",
  gestordetrafego: "pt",
  anunciosnoinstagram: "pt",
  chatgptbrasil: "pt",
  iaparaempreender: "pt",

  // Neutros / proper nouns / mismo spelling en varios idiomas → null
  claudeai: null,
  anthropic: null,
  iaparanegocios: null,
  inteligenciaartificial: null,
  chatgpt: null,
  ia: null,
  openai: null,
};

// Tokens distintivos por idioma. Diseñados para NO solaparse entre listas:
// "está" aparece en ES y PT, así que NO está aquí. "están" (ES) vs "estão" (PT) sí.
const STOPWORDS_ES = new Set([
  "el", "la", "los", "las", "están", "más", "qué", "dónde", "cómo",
  "porqué", "mucho", "muchos", "mucha", "muchas", "ahora", "después",
  "siempre", "nunca", "también", "según", "aquí", "ahí",
]);

const STOPWORDS_EN = new Set([
  "the", "is", "are", "with", "for", "your", "you", "have", "has",
  "this", "that", "but", "and", "how", "what", "where", "when",
  "why", "from", "they", "their", "would", "could", "should",
]);

const STOPWORDS_PT = new Set([
  "é", "são", "estão", "não", "muito", "muitos", "muita", "muitas",
  "você", "vocês", "isso", "aqui", "lá", "nós", "também", "agora",
  "sempre", "nunca", "depois", "antes",
]);

// Stopwords distintivas de francés (no se solapan con ES/PT en formas
// flexionadas). Si una caption tiene varias de estas, casi seguro es FR.
const STOPWORDS_FR = new Set([
  "le", "les", "des", "du", "ce", "cette", "ces", "vous", "nous", "tout",
  "tous", "toute", "très", "bien", "être", "avec", "pour", "sans", "sur",
  "sous", "dans", "chez", "qui", "que", "quoi", "où", "comment", "pourquoi",
  "il", "elle", "ils", "elles", "je", "tu", "moi", "toi", "lui", "elle",
  "est", "sont", "était", "sera", "ai", "as", "avons", "avez", "ont",
  "fait", "faire", "dit", "dire", "veux", "peux", "doit", "vais",
]);

// Rangos Unicode de scripts no latinos. Captura: hebreo (0590-05FF),
// árabe (0600-06FF), siríaco (0700-074F), devanagari/hindi (0900-097F),
// thai (0E00-0E7F), CJK Unified Ideographs (4E00-9FFF), hiragana/katakana
// (3040-30FF), hangul/coreano (AC00-D7AF), cirílico/ruso (0400-04FF).
const NON_LATIN_RE =
  /[֐-׿؀-ۿ܀-ݏऀ-ॿ฀-๿぀-ヿ一-鿿가-힯Ѐ-ӿ]/;

function hasNonLatinScript(text: string): boolean {
  return NON_LATIN_RE.test(text);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\.,!?;:¿¡()\[\]"'„""«»\-—…\/\\#@$%&*+=<>|~`]+/)
    .filter((t) => t.length > 0);
}

function inferFromCaption(caption: string): Language | null {
  if (caption.length < 20) return null;

  // Caracteres no latinos → "other" inmediatamente (hindi, árabe, chino...)
  if (hasNonLatinScript(caption)) return "other";

  const tokens = tokenize(caption);
  const scores: Record<string, number> = {
    es: 0,
    en: 0,
    pt: 0,
    fr: 0,
  };

  for (const tok of tokens) {
    if (STOPWORDS_ES.has(tok)) scores.es++;
    if (STOPWORDS_EN.has(tok)) scores.en++;
    if (STOPWORDS_PT.has(tok)) scores.pt++;
    if (STOPWORDS_FR.has(tok)) scores.fr++;
  }

  // Boost por caracteres distintivos (señal muy fuerte)
  const lower = caption.toLowerCase();
  if (lower.includes("ñ")) scores.es += 3;
  if (lower.includes("ã") || lower.includes("õ")) scores.pt += 3;
  // ç + acentos circunflejos → fuerte señal de francés (no usados en ES,
  // PT lo usa pero menos)
  if (/[âêîôûë]/i.test(caption)) scores.fr += 2;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  // Necesitamos al menos 2 puntos y un margen de 1.5x sobre el segundo
  // para devolver un idioma con confianza. Si no, devolvemos null.
  if (sorted[0][1] < 2) return null;
  if (sorted[1][1] > 0 && sorted[0][1] / sorted[1][1] < 1.5) return null;

  const winner = sorted[0][0];
  // FR detectado con confianza → "other" (no soportado, pero al menos
  // sabemos que tampoco es ES/EN/PT y se filtra correctamente).
  if (winner === "fr") return "other";
  return winner as Language;
}

export function inferLanguage(
  sourceHashtag: string | null,
  caption: string | null
): Language | null {
  // Caption con script no latino → "other" aunque el hashtag sea ES/EN/PT.
  // (Caso real: un hashtag global como #claudeai con post en hindi.)
  if (caption && hasNonLatinScript(caption)) return "other";

  if (sourceHashtag) {
    const clean = sourceHashtag.toLowerCase().replace(/^#+/, "");
    if (clean in HASHTAG_LANG) {
      const mapped = HASHTAG_LANG[clean];
      if (mapped !== null) return mapped as Language;
      // null → el hashtag es neutro, fallback a caption
    }
  }

  if (!caption) return null;
  return inferFromCaption(caption);
}
