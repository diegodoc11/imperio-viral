# CLAUDE.md

Notas operativas y lecciones del proyecto **Imperio Viral**. Léelas antes de
tocar el código — están aquí porque varios bugs subutiles me costaron horas.

## Qué es este proyecto

App web para descubrir reels, fotos y carruseles virales de Instagram.
Multi-niche desde el día 1 (cualquier vertical, cualquier cliente). Pipeline:

1. **Scraper** (Node + TypeScript) → llama a Apify, normaliza, persiste en SQLite.
2. **App Next.js** → grid visual con filtros, decisiones rápidas, detalle interactivo.

Stack en producción: Next.js 15, Tailwind 3, `node:sqlite` (NO better-sqlite3),
`apify-client`, `tsx` para scripts. Datos persistidos en `./data/content.db`.

## Stack y por qué

- **Node.js v22+** con **`node:sqlite`** built-in. NO usar `better-sqlite3`:
  en Windows requiere Python + Visual Studio Build Tools (~6 GB) y la
  instalación falla con `node-gyp` casi siempre.
- **`apify-client`** oficial.
- **`tsx`** para ejecutar scripts TypeScript directamente.
- **Next.js 15 App Router** con server components + URL params para filtros
  (no client state global). Páginas con `export const dynamic = "force-dynamic"`
  porque leen SQLite local sin caché.

## Comandos

```bash
npm install                                          # primero
npm run init-db                                      # schema + migraciones (idempotente)
npm run dev                                          # Next.js en localhost:3000

# Scrapers
npm run scrape -- --hashtag=X --limit=N --type=both|posts|reels
npm run scrape:profile -- --user=X --limit=200       # incremental por defecto
npm run scrape:profile -- --user=X --full            # ignora cutoff de 1 año
npm run import-run -- --runId=X --user=Y             # importa de un Apify run existente (sin gastar)

# Recomputes (correr tras cambiar fórmulas)
npm run recompute-scores                             # recalcula engagement, ER, viral_score
npm run recompute-baselines                          # recalcula medianas + tiers
npm run recompute-hashtag-heat                       # recalcula heat relativo al hashtag
npm run refresh-language                             # reclasifica idioma (incluye "other")

# Debug
npm run peek                                         # ranking top-10 hashtag
npm run peek:profile -- [--user=X] [--recent=7]
npm run dump-raw -- --type=Video [--idx=N]           # JSON crudo de un item
npm run analyze-er -- --id=X | --short=Y             # auditoría de ER de un post
npm run diagnose-post -- --id=X                      # explica por qué un post no tiene clasificación
npm run inspect-actor -- [--actor=apify/instagram-scraper]
```

## Métricas de viralidad — lectura DETENIDA

### `engagement_rate` — ESTÁNDAR DE MERCADO (NO inventar fórmulas custom)

```
ER = (likes + comments) / followers × 100
```

**Misma fórmula para TODOS los tipos** (reels, fotos, carruseles). Es la que
usan Hootsuite, Sprout Social, HubSpot, HypeAuditor, Modash, Influencer
Marketing Hub. Los benchmarks publicados están calibrados para esta fórmula:

- `<1%` bajo · `1-3%` promedio · `3-6%` bueno · `6-9%` excelente · `9%+` outlier

**Si no conocemos `followers` del autor → ER queda null.** Por eso existe la
sección de enriquecimiento (lib/enrichment.ts).

⚠️ **NO usar fórmula ponderada** `(likes + comments×4 + shares×6) / views` —
genera números 3-5× más altos que el estándar y rompe la comparación con
otras herramientas. Tuve que cambiar esto a mitad del proyecto cuando el
usuario quiso comparar números con otros tools.

### `view_rate` — solo reels, métrica complementaria

```
view_rate = (likes + comments) / views × 100
```

Útil cuando `engagement_rate` no se puede calcular (autor sin enriquecer).
**Visible en el detalle del post pero NO es el ER principal.** También se
usa como criterio para identificar candidatos a enriquecer (ver enrichment).

### `engagement_score` — score absoluto ponderado, ranking interno

```
engagement_score = likes + comments×4 + shares×6
```

Mantiene el peso del experto inicial. Lo usamos para ranking interno,
baselines de perfil y heat relativo al hashtag. **Nunca se muestra como
"engagement rate"** — eso confunde con el estándar de mercado.

### `viral_velocity` y `viral_score`

- `viral_velocity = views / horas_desde_publicación` (o engagement_score/h
  para no-reels). Captura "está reventando AHORA".
- `viral_score = log10(velocity + 1) × (1 + ER%/100)` — combina velocidad y
  engagement, suavizado log para no aplastar ranking. Funciona para todos
  los tipos. **Es el sort default recomendado.**

## Tiers visuales — DOS sistemas distintos, no confundir

### 1. Tier de perfil (basado en mediana del creador)

Solo aplica a posts de perfiles trackeados. `viralidad_multiplier =
post.engagement_score / profile.median_engagement_score`.

| Multiplier | Tier |
|---|---|
| 2-5× | 🟢 good |
| 5-10× | 🥉 viral |
| 10-25× | 🥈 gem |
| 25-50× | 🥇 diamond |
| 50×+ | 💎 unicorn |

### 2. Heat (basado en ER% absoluto, estándar mercado)

Aplica a cualquier post cuyo autor tenga followers conocidos.

| ER% | Heat |
|---|---|
| 1-3% | 🌿 fresco |
| 3-6% | 🔥 tibio |
| 6-9% | 🔥🔥 caliente |
| 9%+ | 🔥🔥🔥 explosivo (validar — puede ser bait) |

### 3. Hashtag heat (fallback para no-reels sin followers)

Para fotos/carruseles cuyo autor NO está enriquecido, el ER es null.
Calculamos `hashtag_heat_mult = post.engagement_score / median(engagement_score)`
de su misma `(hashtag, type)`. Tiers: 2-5× tibio · 5-10× caliente · 10×+ explosivo.

Ver `lib/hashtag-heat.ts`. Se recomputa automáticamente tras cada hashtag scrape.

## Inferencia de idioma — 4 categorías

`lib/language.ts` clasifica como `es`, `en`, `pt`, `other`, o `null`:

1. **Hashtag → idioma directo**: `aiads → en`, `trafegopago → pt`, etc.
2. **Caption con script no latino** (Devanagari/Hindi, árabe, CJK, cirílico,
   thai, hebreo) → `other` directamente.
3. **Heurística de caption** con stopwords distintivas para es/en/pt/fr.
   Si gana `fr` → `other`. Si confianza baja → `null`.

**Filtro UI "Solo ES/EN/PT"** filtra `language IN ('es','en','pt')` —
excluye `other` Y `null`. Útil cuando el usuario no maneja otros idiomas.

⚠️ **No mapear a `null` para "no soportado"** — usar `other`. Reservar
`null` solo para "no se pudo clasificar" (caption muy corto).

## Apify — gotchas críticas

### Actores que usamos

| Actor | Para qué | Cuesta |
|---|---|---:|
| `apify/instagram-hashtag-scraper` | Hashtag scrapes | $2.60/1k items |
| `apify/instagram-scraper` (posts) | Profile scrape (reels + carruseles) | $2.70/1k items |
| `apify/instagram-scraper` (details) | Enriquecimiento (solo metadata, 1 item/perfil) | $2.70/1k items |

Plan del usuario: **Apify Starter** ($29/mo, Bronze tier discount). Constants
en `lib/pricing.ts`. Si Apify cambia precios, ajustar ahí — toda la app se
actualiza sola.

### Inputs del hashtag-scraper

- `resultsType` por defecto es `"posts"` → devuelve solo Image + Sidecar,
  CERO reels. Para reels: `resultsType: "reels"`.
- **NO acepta `onlyPostsNewerThan`** — la versión hashtag no tiene filtro
  temporal. Solo el profile-scraper sí lo tiene.
- **Plan Starter mantiene la limitación de "primera página"** del feed del
  hashtag — solo se desbloquea con tiers más altos.

### Inputs del profile-scraper (`apify/instagram-scraper`)

- `directUrls` (array de URLs de perfil)
- `resultsType: "posts"` (default — todos los tipos) o `"details"` (solo
  metadata, 1 item por perfil — para enriquecimiento)
- `onlyPostsNewerThan: "YYYY-MM-DD"` ← úsalo para incremental
- `addParentData: true` para que cada item incluya `followersCount`,
  `biography`, etc. del owner

### Quirks de la respuesta

- **Reels devuelven `videoPlayCount` e `igPlayCount`** — NO `videoViewCount`.
  Hacer fallback: `videoViewCount ?? videoPlayCount`. SQL: `COALESCE(...)`.
- **`likesCount: -1` significa "Instagram ocultó el contador"** (cuentas
  grandes pueden activar esa opción). Tratar como 0 en cálculos PERO
  mostrar como "ocultos" en UI. **No mostrar `❤️ -1`.**
- **Posts/carruseles recién publicados llegan con likes=0, comments=0** —
  IG no expone métricas de posts de segundos en el grid de hashtag. Por eso
  los reels son más confiables (tienen plays desde minuto 1).
- **Bios de Instagram vienen TRUNCADAS** desde el API (terminan en "…").
  No es bug nuestro. Para bio completa habría que usar otro actor.

### Quirks del SDK `apify-client`

- **`client.actor(id).defaultBuild().get()` NO existe**. Para inspeccionar
  el schema de inputs hay que pegarle al HTTP API directamente:
  `GET https://api.apify.com/v2/actor-builds/{buildId}?token=...`
- `client.actor(id).get()` sí existe pero `exampleRunInput.body` es
  basura (suele ser `"{ \"helloWorld\": 123 }"`).

### Apify NO permite "skip these IDs"

Cuando re-scrapeamos un hashtag, **pagamos por todo lo que devuelva incluso
si ya lo teníamos**. Lo único que podemos hacer:

1. **Warning preventivo** (`/api/hashtag/info` — `components/ScrapeHashtagForm.tsx`):
   antes del submit, calcula días desde último scrape y muestra estimación
   de overlap (90% si <24h, 75% si <3d, etc).
2. **Visibilidad post-scrape**: el resultado del job separa "X nuevos" vs
   "Y duplicados". El upsert por `id` deduplica el storage; el cobro de
   Apify sí va igual.

## Image proxy (`/api/img`) — esencial

Las URLs del CDN de Instagram (`*.cdninstagram.com`, `*.fbcdn.net`) **están
firmadas para el navegador del owner del post** y devuelven 403 al pedirlas
desde otro browser por política de referer.

**Solución**: proxy server-side en `app/api/img/route.ts`. Recibe `?url=...`,
valida que el host sea de IG, descarga del lado servidor (que sí pasa la
validación), retransmite con cache-control 24h.

Helper: `imgProxy(url)` en `lib/img.ts`. **TODOS los `<img>` de la app
deben pasar por ahí.**

⚠️ Cuando una URL devuelve 403 desde el proxy, lo más probable es que la
URL upstream esté caducada (signed-url expirado, no que nuestro proxy esté
roto). Logs de upstream status ayudan a diagnosticar rápido.

## Joyas ocultas y enriquecimiento

Caso de uso: detectar **cuentas pequeñas con reels viralizando** (cuando
views >> followers). Para eso necesitamos `followersCount` del autor.

### Flow

1. Usuario scrapea hashtag → reels obtienen `view_rate` (engagement/views)
   pero NO `engagement_rate` (no tenemos followers).
2. En `/hashtags`, sección **"Detectar joyas ocultas"** (`components/EnrichSection.tsx`):
   - Filtro por calor mínimo (basado en `view_rate`, no en `engagement_rate`,
     porque circular: para tener ER necesitamos followers, que es lo que
     vamos a obtener).
   - Muestra count de candidatos + costo estimado.
3. Usuario clicka → llama a `apify/instagram-scraper` con `resultsType: "details"`
   (1 item por perfil, ~$0.003 cada uno).
4. Tras enriquecer: `recomputeScoresForOwners()` recalcula ER de TODOS los
   posts de esos autores (incluyendo fotos/carruseles que estaban en null).

### Bug histórico: stub para perfiles inaccesibles

Si Apify no devuelve data para un perfil (cuenta privada, banned, deleted),
**ANTES** lo descartábamos silenciosamente y los candidatos seguían apareciendo
para siempre — bucle infinito de "faltan 2 por enriquecer".

**Fix**: ahora se crea un "stub" en `profiles` con `bio = "[no enriquecido — cuenta privada, eliminada o sin acceso]"`. La candidates query los excluye porque `pr.username IS NOT NULL`. Ver `lib/enrichment.ts:enrichProfiles()`.

### Métrica derivada: views/followers

`viewsPerFollower = views / followers` se computa al query-time
(`lib/queries.ts`). En PostCard:

- **🚀 5×+** badge morado sólido = joya oculta clara (reel salió de la burbuja)
- **2-5×** badge morado tenue = engagement alto vs audiencia
- **<2×** sin badge

Sort option: `viewsPerFollower` (etiqueta "🚀 Joyas ocultas").

## Ventanas temporales — DOS conceptos distintos

- **`baselineWindowDays`** (default 180) — solo posts de los últimos 180d
  entran al cálculo de mediana del perfil. Si incluyes histórico viejo,
  contaminas el baseline (creador con cuenta chica hace 3 años sesga la
  mediana, infla multipliers de posts modernos).
- **`activeWindowDays`** (default 365) — posts más viejos que un año se
  conservan en DB pero `viralidad_multiplier` y `viral_tier` quedan null.
  No aparecen en rankings.
- **Ventana de display** (UI) — lo que el usuario elige (7d/15d/30d/90d/180d/365d/all).
  Filtra solo qué se muestra; no afecta baselines.

⚠️ **Bug que tuve**: cuando el usuario picaba "Todo el histórico" en el
selector, mi código tenía `Number.isFinite(undefined) ? days : 90` y el
fallback silenciosamente lo tornaba a 90d. Hay que separar `undefined =
sin filtro` de `valor inválido = fallback a 90`.

## Incremental scraping (solo perfiles)

`scripts/scrape-profile.ts` es incremental:

1. Lee `profiles.scraped_at` antes del scrape.
2. Si existe → pasa `onlyPostsNewerThan = scraped_at - 1 día` a Apify
   (1 día de overlap por seguridad).
3. Si NO existe (primer scrape) → cutoff de 1 año.
4. Flag `--full` desactiva el cutoff.

Costo del 2º scrape: ~10× menor que el primero. **Hashtag scraper NO tiene
incremental** — re-scrapea siempre la primera página completa.

## Migraciones de schema

`lib/db.ts:runMigrations()` se ejecuta tras `initSchema()`. Para añadir
columnas a `posts` en DBs existentes:

1. Añadir la columna al `CREATE TABLE` en `SCHEMA_SQL` (DBs frescas).
2. Añadir `if (!colNames.has("X")) db.exec("ALTER TABLE posts ADD COLUMN X ...")`
   en `runMigrations()` (DBs preexistentes).
3. **Crear índices nuevos en `runMigrations`, NO en `SCHEMA_SQL`**, porque
   SCHEMA_SQL corre antes que la migración y `CREATE INDEX` sobre columna
   inexistente falla.
4. Backfill retroactivo va en un script dedicado (`scripts/refresh-language.ts`,
   `scripts/recompute-scores.ts`, etc.).

## Diferencias `node:sqlite` vs `better-sqlite3`

Si vienes de better-sqlite3:

- **No hay `db.transaction(fn)`** — usar manualmente `db.exec("BEGIN")`/
  `"COMMIT"`/`"ROLLBACK"`.
- Named params: usar `:name` (no `@name`) en SQL y pasar objeto plano a
  `stmt.run({...})`.
- `DatabaseSync` se importa de `node:sqlite`.
- Sale warning `ExperimentalWarning: SQLite is an experimental feature`
  aunque la API es estable en v22+. Es ruido, ignorable.

### Bug del bind: parameter 299

Si pasás un valor de tipo no soportado (BigInt, Date, NaN, etc) a `stmt.run()`,
node:sqlite tira `TypeError: Provided value cannot be bound to SQLite parameter X`
y aborta TODA la transacción. Pasamos por:

1. Helper `sanitize()` en `lib/persist.ts` que convierte cualquier valor a
   `string|number|null` antes de bind.
2. **Sin transacción global en `upsertPosts`** — un row malo NO debe hacer
   rollback de los otros 299 buenos. Try/catch por row, log de errores.

## Bugs sutiles que pasaron y lecciones

### Sort por campo NULL no cambia nada

ORDER BY un campo que es NULL para todos los rows del subset → ties → orden
arbitrario. **Siempre añadir tiebreakers**:

```sql
ORDER BY <campo_principal> DESC NULLS LAST,
         engagement_score DESC NULLS LAST,
         posted_at DESC
```

Sin esto, el usuario hacía cambiar el sort y "no pasaba nada".

### Lógica circular en filtros

Si un campo A se calcula a partir del campo B, no filtres candidatos por
A cuando lo que estás haciendo es OBTENER B. Caso real: filtré candidatos
para enriquecimiento por `engagement_rate` (que requiere followers), pero
el enriquecimiento es JUSTAMENTE para conseguir followers → quedaba siempre
0 candidatos. Solución: filtrar por `view_rate` (no requiere followers).

### Recalibrar umbrales tras cambiar fórmulas

Cuando cambié la fórmula de ER (custom-weighted → estándar mercado), los
números se redujeron 3-5×. Si dejaba los umbrales viejos (`tibio: 3-7%`),
casi todos los posts quedaban sin badge. Tuve que recalibrar a benchmarks
de industria para la nueva fórmula. Lección: **pricing/escalas SIEMPRE
acompañan los cambios de fórmula**.

### "Solo ES/EN/PT" filter requiere distinción `other` vs `null`

Antes de añadir el tipo `other`, todos los idiomas no soportados quedaban
en `null`. El filtro "todos los idiomas" los incluía → aparecían posts en
hindi y francés mezclados. Distinguir explícitamente:

- `other` = detectado, pero no soportado (filtra explícitamente)
- `null` = no se pudo detectar (caption muy corta — filtra opcionalmente)

## Estructura del proyecto

```
.
├── .env / .env.example         # APIFY_TOKEN, OPENAI_API_KEY (Fase 6+)
├── data/content.db             # SQLite (gitignored)
├── lib/
│   ├── apify.ts                # cliente, runHashtagScrape, runProfileScrape, runProfileDetailsScrape
│   ├── baseline.ts             # recomputeProfileBaseline (mediana + 5 tiers virales)
│   ├── db.ts                   # getDb, SCHEMA_SQL, initSchema, runMigrations
│   ├── enrichment.ts           # joyas ocultas: getEnrichmentCandidates, enrichProfiles
│   ├── hashtag-heat.ts         # heat relativo a la mediana del hashtag (no-reels)
│   ├── img.ts                  # imgProxy() — convierte URLs IG → /api/img
│   ├── jobs.ts                 # tracking de jobs async (createJob, finishJob, getJob)
│   ├── language.ts             # inferLanguage (es/en/pt/other) + STOPWORDS_FR + non-Latin detection
│   ├── persist.ts              # normalize, upsertPosts (con sanitize), upsertProfile
│   ├── pricing.ts              # APIFY_*_COST constants + estimateCost
│   ├── queries.ts              # PostFilters, queryPosts, getProfilePosts, getAllHashtagsWithCounts
│   ├── score.ts                # computeScores (engagement_score, ER, view_rate, viral_velocity, viral_score)
│   ├── scrape-actions.ts       # scrapeProfile, scrapeHashtag (orquestación CLI + API)
│   └── types.ts                # ApifyHashtagItem, StoredPost, StoredProfile, ViralTier, Decision
├── components/
│   ├── AudioToggle.tsx, BackButton.tsx, DecisionButtons.tsx
│   ├── EnrichSection.tsx       # joyas ocultas: preview + start
│   ├── FilterBar.tsx           # window/lang/type/tier/heat/decision/sort
│   ├── HashtagPills.tsx        # selector de hashtag en /hashtags
│   ├── JobStatus.tsx           # polling de job + render de resultados
│   ├── MediaViewer.tsx         # video/carrusel en detalle
│   ├── PostCard.tsx            # tarjeta del grid (con hover-preview audio)
│   ├── ScrapeHashtagForm.tsx   # form home con warning de duplicados
│   ├── ScrapeProfileForm.tsx   # form home
│   └── TierBadge.tsx           # TierBadge, HeatBadge, HashtagHeatBadge, EngagementBadge
├── app/
│   ├── api/
│   │   ├── decisions/          # POST decisión
│   │   ├── enrich/preview/     # GET candidatos
│   │   ├── enrich/start/       # POST iniciar enriquecimiento
│   │   ├── hashtag/info/       # GET info de hashtag (warning preventivo)
│   │   ├── img/                # proxy de imágenes IG
│   │   ├── jobs/[id]/          # GET status del job
│   │   ├── scrape/hashtag/     # POST iniciar scrape de hashtag
│   │   └── scrape/profile/     # POST iniciar scrape de perfil
│   ├── hashtags/page.tsx       # lista de hashtags + grid filtrado
│   ├── posts/[id]/page.tsx     # detalle del post
│   ├── posts/page.tsx          # todos los posts
│   ├── profiles/[username]/page.tsx
│   ├── profiles/page.tsx
│   ├── shortlist/page.tsx
│   ├── layout.tsx, page.tsx, globals.css
└── scripts/
    ├── analyze-er.ts           # auditoría ER de un post
    ├── diagnose-post.ts        # explica por qué un post no tiene clasificación
    ├── dump-raw.ts             # JSON crudo de un item
    ├── import-from-run.ts      # importa de un Apify run existente
    ├── init-db.ts
    ├── inspect-actor.ts        # schema de inputs de un actor
    ├── peek.ts, peek-profile.ts
    ├── recompute-baselines.ts
    ├── recompute-hashtag-heat.ts
    ├── recompute-scores.ts
    ├── refresh-language.ts
    ├── scrape.ts, scrape-profile.ts
    └── test-img.ts             # debug del proxy
```

## Roadmap

| Fase | Estado | Qué |
|------|--------|-----|
| 1 | ✅ | Estructura, schema SQLite, tipos, scoring |
| 2 | ✅ | Scraper Apify (hashtag + profile) |
| 2.5 | ✅ | Inferencia de idioma (es/en/pt/other) |
| 2.6 | ✅ | Engagement rate (estándar mercado) |
| 2.7 | ✅ | Profile scraping con baseline + 5 tiers virales |
| 2.8 | ✅ | Filtro temporal + incremental scraping |
| 3 | ✅ | App Next.js (grid + filtros + detalle + decisiones) |
| 3.1 | ✅ | Forms para iniciar scrapes desde la UI + cost preview |
| 3.2 | ✅ | Heat para no-reels (relativo al hashtag) + view rate |
| 3.3 | ✅ | Enriquecimiento de followers (joyas ocultas) |
| 3.4 | ✅ | Warning de duplicados al re-scrapear hashtag |
| 6 | pending | Transcripción Whisper + anatomía del guión |
| 7 | pending | Análisis visual con Gemini |

## Cosas que NO hacer

- **No inventar fórmulas de engagement custom**. Usar la estándar mercado.
  El usuario va a comparar con otras herramientas.
- **No usar `better-sqlite3`** ni cualquier dep con `node-gyp` (Windows hostile).
- **No commitear `.env`** ni `data/`.
- **No asumir que `videoViewCount` viene poblado** — usar COALESCE con `videoPlayCount`.
- **No mostrar `❤️ -1`** — IG ocultó likes, mostrar "ocultos".
- **No dejar ORDER BY sin tiebreakers** cuando el campo principal puede ser NULL.
- **No mezclar `null` con "no soportado"** en clasificaciones — usar enum
  explícito (`other`).
- **No crear índices en SCHEMA_SQL para columnas que se añaden via migración** —
  van en `runMigrations()`.
- **No filtrar candidatos para X por una métrica que requiere X** (lógica circular).
- **No cambiar fórmulas sin recalibrar umbrales** que dependan de ellas.

## Seguridad

- `.env` está en `.gitignore`. Nunca commitearlo.
- **El primer token de Apify se filtró en chat al inicio del proyecto** y se rotó.
  Si vuelve a aparecer en logs/mensajes/archivos, rotarlo otra vez.
- No guardar tokens en memoria (`memory/`) ni en CLAUDE.md.
- El proxy `/api/img` valida hostname para evitar SSRF.
- Decisiones API valida tipos y rechaza valores fuera del enum.
