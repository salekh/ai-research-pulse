# BACKLOG.md — AI Research Pulse Engineering & Product Backlog

> **Maintained by:** `@architect-docs` · **Audited by:** `@critic-ux`  
> **Governance:** Every item must satisfy [`CONSTITUTION.md`](./CONSTITUTION.md) and [`SPEC.md`](./SPEC.md) before transitioning to `Done`.  
> **Priority Legend:** `P0` = Current Release Blocker · `P1` = Next Sprint High-Impact · `P2` = Planned Hardening & Optimization

---

## Active & Prioritized Backlog

### Item #0 — Academic Research Track (arXiv 6-Month Backfill), Grounded Paper & Lab Q&A (`POST /api/ask`), and Gemini 4 Neon + Hydrogen Routing
- **Priority:** `P0`
- **Status:** `Done`
- **Description:**
  1. Add a strictly isolated **Academic Research** tab (`category = 'academic'`, never mixed with Lab articles `category = 'lab'`) indexing AI/LLMs/Intelligence/Learning arXiv papers back-dated 6 months (`2026-05-25` → `2026-11-25`) plus live incremental ingestion.
  2. Store **only** metadata, abstract, short `gemini-4-hydrogen` summary, deterministic taxonomy tags, 768-dim vector embedding, and direct `arXiv` / `PDF` links (never full paper text in DB).
  3. Add interactive multi-turn **Ask Paper / Ask Article** Q&A (`POST /api/ask` + `components/ask-paper-drawer.tsx`) across **both** Academic Papers and Frontier Lab Articles, fetching arXiv HTML / article text on demand ephemerally without DB indexing.
  4. Upgrade all cognitive-heavy workloads (`POST /api/ask`, `POST /api/a2ui`, `POST /api/trends`, `POST /api/self-improve`, podcast scripting) to **`gemini-4-neon`** and route light cognition (short summaries, batch filtering/tagging, overview scripting, audio transcription) to **`gemini-4-hydrogen`**.

---

### Item #1 — A2UI 1.0 Visual Article Renderer
- **Priority:** `P0`
- **Status:** `Done` (`@a2ui-engineer`)
- **Description:** Convert any indexed research article into a rich, interactive visual brief strictly adhering to the Google Cloud AI Tech Group (FDE) corporate design system (`CONSTITUTION.md` Articles II, III, VI) using the declarative **A2UI 1.0** wire protocol.
- **Scope:**
  - `lib/a2ui/spec.ts` & `lib/a2ui/validator.ts`: A2UI 1.0 wire envelope (`createSurface`, `updateDataModel`, `updateComponents`, `deleteSurface`), Basic + Research Brief extension catalogs (`catalogId` override per `common_types.json`), RFC 6901 JSON Pointer + `@call` resolver, prototype-pollution & `http(s)`/public-IP URL sanitizer, DFS cycle/depth (`<= 24`)/node (`<= 200`) guards, and deterministic fallback builder.
  - `app/api/a2ui/route.ts`: `POST /api/a2ui` with hop-by-hop SSRF-safe article text extraction, upgraded `gemini-4-hydrogen` structured JSON generation, server-side validation + uncached deterministic fallback, LRU caching (`128` entries, `6h` TTL), and `Accept: application/a2ui+json` content negotiation.
  - `components/a2ui/{catalog.tsx,A2UIRenderer.tsx,ArticleVisualDrawer.tsx}`: Corporate-styled allowlisted multi-catalog components, spec-compliant A2UI 1.0 renderer, responsive full-height drawer/modal with loading skeleton, retry, and `"Inspect A2UI 1.0 Payload"` toggle.
  - `components/news-card.tsx` & `components/news-feed.tsx`: Clean, non-crowding single-row `"Visual Brief"` button on every article card, shared drawer mount, AA contrast & mono-weight cleanup, and dynamic `All 9 Labs` dropdown.
- **Acceptance Criteria:**
  1. Valid A2UI 1.0 wire payload (`version: "1.0"`, surface/component adjacency list, JSON Pointer bindings) inspectable in-UI.
  2. Strict adherence to FDE palette (`#202124`, `#F8F9FA`, `#4471ED`, `#335CD6`, `#1967D2`, `#8F4E00`, `#DADCE0`), static `Google Sans` / `Google Sans Text` / `Google Sans Mono` (`400` only) fonts (zero `Roboto`), `tabular-nums`, and `55–75ch` reading measure.
  3. Zero XSS / `dangerouslySetInnerHTML`, `http(s)://` + public-IP URL sanitization, cycle & depth protection, HTML5 valid button markup (`buttonNestedP: 0`), and deterministic fallback when LLM fails.
  4. Verified cleanly at Desktop (`1440×900`) and Mobile (`390×844`) with zero horizontal overflow, clipping, or card footer crowding.
- **Verification Notes:** **PASS (Round 2, `@critic-ux` #21)** — `npx tsc --noEmit` + `npm run build` exit `0`; 7/7 validator unit checks PASS; live `POST /api/a2ui` (`version: "1.0"`, `gemini-4-hydrogen`, `fallback: false`, 3 msgs, 23 nodes, 0 warnings); cached `Accept: application/a2ui+json` (`5ms`, `X-A2UI-Cached: true`); SSRF metadata probe (`metadata_leak: false`); Playwright Desktop `1440×900` & Mobile `390×844` visual audit PASS (`robotoHits: 0`, `overflowX: false`, `buttonNestedP: 0`, single-line `HeroBanner` badge, clean 2-row mobile drawer header, zero console/network errors).

---

### Item #2 — Gemini 4 (Hydrogen / Carbon) & Latest Speech Model Upgrade
- **Priority:** `P0`
- **Status:** `Done` (`@models-engineer`)
- **Description:** Research, live-verify against GCP project `sa-learning-1`, and upgrade all LLM and speech model integrations in `lib/vertex.ts`, `lib/audio-generator.ts`, `lib/content-filter.ts`, `lib/reranker.ts`, and `app/api/**` from `gemini-3.8-flash` / `gemini-3.8-flash-tts` to verified **Gemini 4 Hydrogen** (`gemini-4-hydrogen`), **Gemini 4 Carbon** (`gemini-4-carbon`), and latest GA Google speech models (`gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`, `gemini-4-hydrogen` audio transcription), while preserving 768-dim `text-embedding-004` compatibility.
- **Acceptance Criteria:**
  1. Every model ID verified via live API probe against `sa-learning-1` (`location: "global"`).
  2. Clean env-var overrides (`GEMINI_MODEL`, `GEMINI_CARBON_MODEL`/`GEMINI_PRO_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_TTS_LITE_MODEL`, `GEMINI_TRANSCRIPTION_MODEL`, `GEMINI_EMBEDDING_MODEL`, `VERTEX_RERANKER_MODEL`) with verified defaults and `.env.local` updated.
  3. Zero stale `gemini-3.8-flash` primary defaults or hardcoded route-level overrides; `gemini-3.8-flash` / `gemini-3.5-flash` appear **ONLY** in `MODEL_REGISTRY` fallback chains, and `gemini-3.8-flash-tts` / `gemini-3.8-flash-lite-tts` in the TTS registry.
  4. Live smoke tests pass for Hydrogen, Carbon, and Speech models; 768-dim vector search remains 100% functional.
- **Verification Notes:** **PASS (Round 2, `@critic-ux` #19 & #21)** — 7/7 live smoke tests on `sa-learning-1` PASS (`fallbackCount: 0`): Hydrogen JSON (`1469ms`), Carbon deep synthesis (`12866ms`), `filterTechnicalArticles` (`1333ms`), multi-speaker podcast TTS via `v1beta1` `speech_metadata` (`4916ms`, `562KB` single-wrapped `RIFF/WAVE`), single-speaker overview TTS (`1994ms`, `370KB`), `transcribeAudio` diarization (`2982ms`), and 768-dim `text-embedding-004` + `semantic-ranker-512@latest` (`1304ms`). Security hardening verified live (`/api/insights/transcribe` blocks path traversal & metadata SSRF with HTTP `400`; `/api/summarize` SSRF-hardened and no longer caches degraded fallbacks; `/api/self-improve` logs `deterministic-fallback` on error).

---

### Item #3 — Eliminate Remaining Hardcoded Stale UI Metadata & Counts
- **Priority:** `P1`
- **Status:** `Done`
- **Resolution:** Updated all remaining stale `gemini-3.8-flash` / `2,482` / `2,229` / `1,698` / `603` UI strings across `app/layout.tsx`, `components/site-header.tsx`, `components/search-hero.tsx`, `components/self-improve-view.tsx`, `components/insights-view.tsx`, `components/trend-chart.tsx`, and `components/article-selector.tsx` to reflect **Gemini 4 (Hydrogen & Carbon)**, **Gemini 3.8 Flash TTS**, and live/current corpus counts (`2,697` indexed, `1,019` from 2026).

---

### Item #4 — Static Asset File Permissions Hardening for Non-Root Docker (`public/fonts` & `public/brand`)
- **Priority:** `P1`
- **Status:** `Todo`
- **Codebase Audit Finding:** Every font file in `public/fonts/*.ttf` and every brand asset in `public/brand/*` currently has restrictive local mode `0600` (`-rw-------`). In `Dockerfile` (line 36), `COPY --from=builder /app/public ./public` copies files owned by `root:root` before switching to `USER nextjs` (`uid 1001`). In strict container runtimes, `0600` root-owned assets can cause `EACCES` errors when Next.js serves Google Sans TTFs or aurora plates.
- **Acceptance Criteria:**
  1. Set `chmod 644` on all files in `public/fonts/` and `public/brand/`.
  2. Update `Dockerfile` to `COPY --from=builder --chown=nextjs:nodejs /app/public ./public` and verify container startup serves `/fonts/GoogleSans-Regular.ttf` and `/brand/bg_dark_aurora.png` with HTTP `200`.

---

### Item #5 — Persistent Cross-Tier Caching for A2UI Visual Briefs & Summaries
- **Priority:** `P1`
- **Status:** `Todo`
- **Codebase Audit Finding:**
  - `saveCachedSummary()` in `lib/db.ts` currently writes only to local SQLite `cached_summaries` and does not sync to Cloud SQL PostgreSQL `articles.summary` or GCS, causing cache misses across Cloud Run instances.
  - A2UI 1.0 visual briefs initially use an in-memory LRU cache, which resets on container scale-down.
- **Acceptance Criteria:**
  1. Add `a2ui_briefs` table (`link PK`, `payload_json`, `model_used`, `schema_version`, `updated_at`) to both Cloud SQL PostgreSQL and SQLite.
  2. Mirror `saveCachedSummary()` and `saveCachedA2UIBrief()` across Tier 1 (Postgres) and Tier 2 (SQLite) so Cloud Run instances share warm `<5ms` brief hits.

---

### Item #6 — Consolidate SSRF-Safe Scraping into Shared Utility (`lib/scraper.ts`)
- **Priority:** `P2`
- **Status:** `Todo` *(security fixes already landed & verified in `/api/a2ui`, `/api/summarize`, and `/api/insights/transcribe` during Round 1–2)*
- **Codebase Audit Finding:** All three URL-fetching routes (`app/api/a2ui/route.ts`, `app/api/summarize/route.ts`, and `app/api/insights/transcribe/route.ts`) now independently enforce `http:`/`https:` scheme checks, loopback/RFC1918/link-local/`metadata.google.internal` SSRF blocking, timeouts, and bounded response byte caps (verified live in Round 2). Consolidating these duplicated helpers into a single `lib/scraper.ts` module will prevent future drift.
- **Acceptance Criteria:**
  1. Extract shared `isSafePublicUrl()` and `fetchBoundedText()` helpers into `lib/scraper.ts` with hop-by-hop redirect validation and unit tests.
  2. Refactor `/api/summarize`, `/api/a2ui`, and `/api/insights/transcribe` to import from `lib/scraper.ts` with zero behavioral regressions.

---

### Item #7 — 768-Dim Embedding Migration (`text-embedding-004` → `gemini-embedding-001` before Apr 1, 2027) & Full Corpus Backfill
- **Priority:** `P1`
- **Status:** `Todo`
- **Codebase Audit & Live Probe Finding (`@models-engineer` #9):**
  - `text-embedding-004` retires on **April 1, 2027**. `gemini-embedding-001` is already GA/live on `sa-learning-1` (3072-dim native, supports Matryoshka `outputDimensionality: 768`, supported through ≥ May 20, 2028; `gemini-embedding-2` currently returns 404 on `sa-learning-1`).
  - `data/news.db` currently has `2,589 / 2,697` articles embedded (`108` missing embeddings) using `text-embedding-004` (`vector(768)`).
  - SQLite fallback hybrid search (`searchArticlesHybrid()` in `lib/db.ts` line 581) only scans `LIMIT 1000` most recent rows, omitting older historical articles during fallback search.
- **Acceptance Criteria:**
  1. Backfill the remaining `108` unembedded rows immediately to achieve `100%` 768-dim coverage.
  2. Execute a zero-downtime dual-column (`embedding_v2 vector(768)` via `gemini-embedding-001` with `outputDimensionality: 768`) re-embedding migration and atomic swap well before the April 1, 2027 retirement deadline.
  3. Expand or index SQLite fallback search so all `2,697+` articles are searchable when Postgres is offline.

---

### Item #8 — Brand Compliance Cleanup of Legacy Secondary Components
- **Priority:** `P2`
- **Status:** `Todo`
- **Codebase Audit Finding:** Several pre-v2 components still use generic Tailwind classes (`gray-*`, `blue-*`) that violate `CONSTITUTION.md` §2.3, and `components/trend-chart.tsx` `LAB_COLORS` omits `Google Cloud AI` and `Chinese Frontier`:
  - `components/transcript-viewer.tsx`: uses `bg-gray-50`, `border-gray-200`, `text-gray-700/600/900`.
  - `components/weekly-summary-card.tsx`: uses `from-blue-600`, `bg-gray-50`, `bg-blue-50`, and calls deprecated `/api/insights?action=generate_audio`.
  - `app/loading.tsx`: uses `text-blue-500` instead of `text-[#4471ED]`.
  - `components/trend-chart.tsx` (lines 78, 95–103 & 332): Caution text uses `#B06000` on `#FEF7E0` (`4.34:1`, fails WCAG AA — upgrade to `#9A5200` `5.47:1`); `LAB_COLORS` and subtitle omit `Google Cloud AI`, `x.AI`, and `Chinese Frontier`.
- **Acceptance Criteria:**
  1. Migrate `transcript-viewer.tsx` and `app/loading.tsx` to exact FDE hex tokens.
  2. Add `Google Cloud AI` (`#4285F4`) and `Chinese Frontier` (`#DE2910`) to `trend-chart.tsx` `LAB_COLORS` and update subtitle copy to reflect all 9 labs.
  3. Archive or remove unused legacy `weekly-summary-card.tsx` and `/test-insights` route if no longer referenced.

---

### Item #9 — Structured Observability, Latency Histograms & Cloud Monitoring Export
- **Priority:** `P2`
- **Status:** `Todo`
- **Codebase Audit Finding:** `telemetry` in `lib/vertex.ts` is stored in module-local memory (resets per Cloud Run revision/instance) and only tracks rolling average latency without p50/p95 percentiles, error classes, or per-model token consumption.
- **Acceptance Criteria:**
  1. Emit structured JSON logs compatible with Google Cloud Logging (`severity`, `route`, `modelUsed`, `latencyMs`, `cacheHit`, `fallbackUsed`, `tokenUsage`).
  2. Surface p50/p95 latency and cache-hit rate in `SelfImproveView`.

---

### Item #10 — Re-Render Architecture Diagrams to Reflect 9 Labs, Gemini 4 & A2UI 1.0
- **Priority:** `P2`
- **Status:** `Todo`
- **Codebase Audit Finding:** `docs/diagrams/system_architecture.dot` and `docs/diagrams/ingestion_and_hybrid_search.dot` still label `"7 Frontier AI Research Labs"`, `"1,698 Articles"`, and `"gemini-3.8-flash"`.
- **Acceptance Criteria:**
  1. Update `.dot` and `.mmd` sources in `docs/diagrams/` to reflect 9 labs, 2,697+ corpus, Gemini 4 Hydrogen/Carbon + upgraded speech models, and the A2UI 1.0 Visual Brief pipeline.
  2. Re-render high-res PNG/SVG diagrams into `public/architecture/` using `Google Sans`.
