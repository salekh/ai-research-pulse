# SPEC.md — AI Research Pulse System Specification

> **Release Target:** `v3.1.0-neon-academic-qa` (Gemini 4 Neon + Hydrogen routing, isolated Academic Research arXiv 6-month track, and grounded Paper & Lab Q&A)  
> **GCP Project:** `sa-learning-1` (`us-central1` Cloud Run + Cloud SQL; Vertex AI `location: "global"` REQUIRED for Gemini 4 Neon/Hydrogen & 3.8 TTS; `us-central1` supported only for `text-embedding-004`)  
> **Governance:** Strictly governed by [`CONSTITUTION.md`](./CONSTITUTION.md) and tracked in [`BACKLOG.md`](./BACKLOG.md)

---

## 1. System Overview & Product Capabilities

**AI Research Pulse** is a Next.js 15 App Router (`react@18.3.1`, `tailwindcss@4.1.11`, TypeScript 5.9, Node 22 standalone Docker) intelligence platform serving ML researchers and Google Cloud AI Tech Group (FDE) engineers.

### Core User Journeys
1. **Hero Semantic Discovery (`/` -> `components/search-hero.tsx`):** Full-viewport FDE dark aurora landing page with animated semantic search bar, quick topic pills, primary navigation CTAs (`Explore Labs Feed`, `Academic Research (arXiv)`, `Cross-Lab Trends`, `Self-Improve`), `"Lucky"` random recent paper redirect (`/api/lucky`), and an executive telemetry stat strip.
2. **Frontier Labs Research Feed (`GET /api/news`, `category='lab'` -> `components/news-feed.tsx`, `components/news-card.tsx`):**
   - Strictly isolated to **9 frontier AI labs** (`COALESCE(category, 'lab') = 'lab'` — zero leakage from Academic arXiv preprints).
   - Paginated (`limit=30`) hybrid PostgreSQL (`pgvector` + `ts_rank_cd`/`ILIKE`) search with `350ms` debounce, `AbortController`, time range (`All Time`, `1y`, `1m`, `2w`), lab filter, and non-blocking background RSS refresh.
   - Per-Card Actions: **Read**, **Summary** (`gemini-4-hydrogen`), **Ask** (`POST /api/ask` via `gemini-4-neon`), **Visual** (A2UI 1.0 via `gemini-4-neon`), and **Bookmark**.
3. **Dedicated Academic Research Track (`GET /api/academic`, `category='academic'` -> `components/academic-feed.tsx`, `components/academic-card.tsx`):**
   - Strictly separated from Labs via `category = 'academic'` across Cloud SQL PostgreSQL, local SQLite (`data/news.db`), and GCS Master Archive.
   - Back-dated **6 months** (`2026-05-25` → `2026-11-25`) combining top HuggingFace Daily Papers, high-citation OpenAlex arXiv AI/LLM papers, and latest official arXiv `cs.AI`/`cs.LG`/`cs.CL` submissions (respecting arXiv 3s rate limits).
   - **Abstract + Short Summary Indexing Only:** Never stores full paper bodies in DB — stores only title, authors, arXiv ID, primary track (`cs.AI`, `cs.LG`, `cs.CL`, `cs.CV`, `cs.RO`, `stat.ML`), abstract, concise `gemini-4-hydrogen` short summary, 768-dim embedding, impact score, and direct `arXiv` + `PDF` links.
   - Filters: Time range (`2w`, `1m`, `3m`, `6m`, `all`), arXiv track, sort (`Latest` vs `Most Important`), hybrid semantic+keyword search, and **Ask Paper** (`gemini-4-neon`) + **Visual** (A2UI 1.0) drawers.
4. **Grounded Paper & Lab Article Q&A (`POST /api/ask` -> `components/ask-paper-drawer.tsx`):**
   - Multi-turn conversational Q&A powered by **`gemini-4-neon`** (`MEDIUM` thinking) available on every Academic Paper and every Frontier Lab article.
   - Ephemerally fetches arXiv LaTeXML HTML (`arxiv.org/html/<id>` / `ar5iv`) or article body on demand (in-memory 15-min cache only, never written to DB) with SSRF protection, transparent grounding badge (`Grounded in arXiv HTML` / `Grounded in Full Article` / `Grounded in Abstract & Summary`), and follow-up question suggestions.
3. **Cross-Lab Convergence & Trends (`components/trend-chart.tsx` -> `POST /api/trends`):**
   - Synthesizes up to 60 filtered articles into 6–8 ranked frontier signals (`emerging`, `growing`, `established`, `declining`), Recharts Topic Vector Radar, Investment Treemap, Maturity Signal Donut, Cross-Lab Convergence Matrix table, and an FDE Executive Strategic Synthesis report.
   - Protected by a 10-minute server-side memory cache (`trendsCache`) and a deterministic statistical synthesizer fallback.
4. **Audio Briefings & Multi-Speaker Podcasts (`/insights` -> `components/insights-view.tsx`, `components/article-selector.tsx`):**
   - Serves bundled & GCS-backed weekly **Executive Commuter Briefing** (3 min, single host) and **Deep-Dive Podcast** (5 min, Dr. Anya & Liam) with interactive waveform player and expandable `TranscriptViewer`.
   - Full-catalog interactive `ArticleSelector` (filter by keyword, lab pills, selected-only) to synthesize custom on-demand WAV briefings (`POST /api/insights/generate`).
   - Live **Multimodal Audio Transcription & Speaker Diarization** (`POST /api/insights/transcribe`) returning timestamped speaker turns.
5. **Recursive Self-Improvement Console (`components/self-improve-view.tsx` -> `GET/POST /api/self-improve`):**
   - Displays live DB corpus telemetry, active model registry telemetry, GCS archive status, architectural improvements ledger, and an on-demand **Execute Self-Improve Cycle** button that runs batch metadata enrichment (`processMissingMetadata(50)`) plus an LLM meta-audit critiquing taxonomy coverage and prompt signal-to-noise ratio, persisted to `self_improvement_logs`.

---

## 2. Frontend Architecture & Design System Implementation

### 2.1 Application Routes
| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Toggleable `SearchHero` -> `SiteHeader` + `NewsFeed` + `SiteFooter` |
| `/feed` | `app/feed/page.tsx` | Direct entry into the Research Feed tab |
| `/insights` | `app/insights/page.tsx` | Direct entry into the Audio & Podcasts tab |
| `/test-insights` | `app/test-insights/page.tsx` | Legacy/dev harness for audio insights |

### 2.2 Styling, Fonts & Brand Enforcement
- **CSS Engine:** Tailwind CSS v4 (`@import "tailwindcss";` + `@theme` block in `app/globals.css`).
- **Fonts:** 8 static-instanced TTFs under `public/fonts/` (`GoogleSans-{Regular,Medium,Bold}`, `GoogleSansText-{Regular,Medium,Bold,Italic}`, `GoogleSansCode-Regular`).
- **Root Scale:** `html { font-size: 17.5px; }`, `body { line-height: 1.6; }`, `.tabular-nums` (`font-feature-settings: "tnum" 1`).
- **Palette Source:** `public/brand/palette.json` mirrored to CSS custom properties in `app/globals.css` and governed verbatim by `CONSTITUTION.md` Article II.
- **Component Primitives:** Radix UI primitives wrapped in `components/ui/*` (`button`, `card`, `badge`, `tabs`, `dropdown-menu`, `scroll-area`, `collapsible`, `checkbox`, `input`, `skeleton`, `slider`, `alert`) + `lucide-react` icons + `motion/react` animations.

---

## 3. Data Persistence, 9-Lab Ingestion & Hybrid Retrieval

### 3.1 3-Tier Zero-Loss Persistence Engine (`lib/db.ts`, `lib/gcs-archive.ts`)

| Tier | Technology | Location / Target | Role & Operational Guarantees |
|---|---|---|---|
| **Tier 1 (Primary Cloud)** | Cloud SQL PostgreSQL + `pgvector` | `sa-learning-1:us-central1:ai-research-pulse-db` | `articles` table with `vector(768)` embeddings; singleton `globalThis.__pgPool` (`max: 5`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 2000`); automatic idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migrations; 60s health retry cooldown (`PG_RETRY_INTERVAL_MS`). |
| **Tier 2 (Local Engine & Cache)** | Native Node SQLite (`node:sqlite`) | `data/news.db` (bundled in Docker image) | Sub-2ms local reads, offline/local failover, `cached_summaries` table, `self_improvement_logs` table, and local mirror on every `saveArticles()`. |
| **Tier 3 (Master Archive)** | Google Cloud Storage | `gs://ai-research-pulse-assets/archive/{articles-master.json,news.db}` | 11-nines durable master backup (`<$0.0002/mo`); written asynchronously after `saveArticles()` via `@google-cloud/storage` SDK or `gcloud` REST fallback; read on cold start (public HTTPS -> authenticated SDK -> REST token) to hydrate SQLite (`< 1,500` rows) and cross-sync Cloud SQL in 150-row chunks. |

### 3.2 Database Schema (Ground Truth)
- **`articles` (PostgreSQL & SQLite):**
  - `link TEXT PRIMARY KEY`
  - `title TEXT`, `date TIMESTAMPTZ/TEXT`, `source TEXT`, `snippet TEXT`
  - `tags TEXT` (JSON array of strings)
  - `embedding vector(768)` (Postgres) / `TEXT` (SQLite JSON float array)
  - `summary TEXT`, `key_innovation TEXT`, `significance TEXT`
  - `created_at TIMESTAMPTZ/DATETIME DEFAULT CURRENT_TIMESTAMP`
  - Indexes: `date DESC`, `source`
- **`cached_summaries` (SQLite):** `link TEXT PK`, `summary`, `key_innovation`, `significance`, `topics` (JSON array), `updated_at`.
- **`self_improvement_logs` (SQLite):** `id INTEGER PK AUTOINCREMENT`, `timestamp`, `model_used`, `action`, `metrics_before` (JSON), `metrics_after` (JSON), `notes`.

### 3.3 Verified Corpus Snapshot (`data/news.db`)
- **Total Indexed Articles:** `2,697`
- **2026 Publications:** `1,019`
- **Tagged Coverage:** `2,696 / 2,697` (`99.96%`)
- **768-Dim Embedded Coverage:** `2,589 / 2,697` (`96.0%`)
- **Source Breakdown:** OpenAI (`1,269`), Google Cloud AI (`555`), Chinese Frontier (`263`), Google Research (`180`), Google DeepMind (`178`), Anthropic (`134`), Meta AI (`59`), x.AI (`39`), Microsoft Research (`20`).

### 3.4 9-Lab Ingestion Pipeline (`lib/ingestion.ts`, `lib/content-filter.ts`)
1. **Triggers:** Cloud Scheduler (`0 */6 * * *` -> `POST /api/admin/ingest` with `ADMIN_SECRET` Bearer auth, `maxDuration = 300s`) or non-blocking user refresh (`GET /api/news?refresh=true`, guarded by `isIngesting` mutex + 15-minute cooldown).
2. **Parallel Acquisition:**
   - 14 RSS/Atom/arXiv endpoints in `FEEDS` across all 9 labs (including Qwen blog + arXiv query for DeepSeek/Qwen/Kimi/GLM/CogVideoX with automatic `[DeepSeek]`/`[Qwen]`/`[Kimi]`/`[GLM]` title normalization).
   - Live HTML + `sitemap.xml` crawler (`fetchMetaResearchPortal()`) for `https://research.meta.ai/` and `/blog`.
   - Self-healing Google Cloud AI Blog Boq `batchexecute` RPC (`SQC9mf`, `fetchGoogleCloudBlogArchive(2025)`) triggered if `< 100` Google Cloud AI articles exist.
3. **Deduplication:** Canonicalized link (strip query params & trailing slash) + `(source, normalized_title)` dedup.
4. **Technical Signal Filter:** Deterministic URL/title pruning + direct-keep rules for `Google Cloud AI` and first-party `research.meta.ai` frontier posts + 20-item batched LLM editorial filter (`filterTechnicalArticles()`).
5. **Batched Enrichment (`processMissingMetadata()`):**
   - Tagging: 15 articles/LLM JSON call against 35-tag `TAG_TAXONOMY` (fallback: `extractTagsDeterministic()`).
   - Embeddings: 100 articles/Vertex AI `:predict` call using `text-embedding-004` (768-dim).

### 3.5 Hybrid Retrieval & Reranking (`lib/db.ts`, `lib/reranker.ts`, `app/api/news/route.ts`)
1. **Query Embedding:** `getEmbedding(query)` produces a 768-dim vector.
2. **Primary Retrieval:**
   - When Cloud SQL Postgres is online and `queryEmbedding` exists: pgvector cosine distance (`1 - (embedding <=> $1)`).
   - When falling back to SQLite (scans top 1,000 recent rows): Hybrid scoring formula:
     $$\text{Score}(q, d) = \min\!\Big(0.99,\; 0.65 \cdot \max(0, \cos(\vec{e}_q, \vec{e}_d)) + 0.45\,\mathbb{I}(q \subset \text{title}) + 0.35\,\mathbb{I}(q \subset \text{tags}) + \sum_{t \in T} w(t, d) + 0.20\,\mathbb{I}_{\text{all}}(T, d)\Big)$$
     where $w(t, d) = 0.18$ (title), $0.12$ (tags), or $0.06$ (snippet).
3. **Semantic Reranking:** When `queryEmbedding` succeeds and `articles.length > 1`, results are reranked via Vertex AI Discovery Engine (`semantic-ranker-512@latest`, `default_ranking_config:rank`), falling back cleanly to hybrid score order on error.

---

## 4. Upgraded AI Model Routing Specification (Gemini 4 & Speech)

> **Status:** Live-Verified against GCP project `sa-learning-1` (`location: "global"` REQUIRED — see `@models-engineer` Model Registry Report, board #9).

### 4.1 Verified Tiered Model Registry (`lib/vertex.ts`)
All model identifiers are centralized in `MODEL_REGISTRY` with environment-variable overrides so Cloud Run deployments can pivot without code rebuilds:

| Logical Tier | `MODEL_REGISTRY` Key | Env Override | Verified Live Model ID | Fallback Cascade | Assigned Workloads |
|---|---|---|---|---|---|
| **Hydrogen (Fast / High-Throughput)** | `PRIMARY`, `HYDROGEN` | `GEMINI_MODEL` | `gemini-4-hydrogen` (GA, ~1.5–2.2s, 1M unified context+output) | `gemini-4-hydrogen` → `gemini-3.8-flash` → `gemini-3.5-flash` | `filterTechnicalArticles()`, `generateTagsBatch()`, `POST /api/summarize`, `POST /api/a2ui` (`thinkingLevel: 'LOW'`), `overview` audio script, listwise rerank fallback |
| **Carbon (Flagship Reasoning)** | `CARBON` | `GEMINI_CARBON_MODEL` / `GEMINI_PRO_MODEL` | `gemini-4-carbon` (GA, ~5.5–7.3s, 1M unified context+output) | `gemini-4-carbon` → `gemini-4-hydrogen` → `gemini-3.8-flash` | `POST /api/trends` (`maxOutputTokens: 16384`), `POST /api/self-improve`, multi-speaker `podcast` scripting (`thinkingLevel: 'MEDIUM'`) |
| **Flagship Multi-Speaker TTS** | `TTS` | `GEMINI_TTS_MODEL` | `gemini-3.8-flash-tts` (GA Oct 28, 2026; 132 langs; full `audio/wav` w/ `RIFF` header) | `gemini-3.8-flash-tts` → `gemini-3.8-flash-lite-tts` → bundled WAV | `synthesizeAudio(..., 'podcast')` (`Dr. Anya` / `Liam` via `v1beta1` REST `speech_metadata`, `45s` timeout) |
| **Fast Single-Speaker TTS** | `TTS_LITE` | `GEMINI_TTS_LITE_MODEL` | `gemini-3.8-flash-lite-tts` (GA Oct 28, 2026; 103 langs; full `audio/wav` w/ `RIFF` header) | `gemini-3.8-flash-lite-tts` → `gemini-3.8-flash-tts` → bundled WAV | `synthesizeAudio(..., 'overview')` & TTS fallback (`gemini-4-hydrogen-tts` does not exist — 404) |
| **Audio Transcription & Diarization** | `TRANSCRIPTION` | `GEMINI_TRANSCRIPTION_MODEL` | `gemini-4-hydrogen` (verified live on 480KB WAV, ~3.0–4.9s) | `gemini-4-hydrogen` → `gemini-3.8-flash` → cached JSON | `transcribeAudio()` (`POST /api/insights/transcribe`, base64 WAV `inlineData` → diarized JSON) |
| **Dense Embeddings (Locked 768-dim)** | `EMBEDDING` | `GEMINI_EMBEDDING_MODEL` | `text-embedding-004` (768-dim; retires **Apr 1, 2027**) | Local lexical BM25 fallback | `getEmbeddingsBatch()` — locked at 768 dims for 2,589 indexed vectors; `gemini-embedding-001` migration tracked in `BACKLOG.md` Item #7 |
| **Semantic Reranker** | `RERANKER` | `VERTEX_RERANKER_MODEL` | `semantic-ranker-512@latest` | `gemini-4-hydrogen` listwise rerank → hybrid score order | `rerankArticles()` via Discovery Engine Ranking API (`global`) |

### 4.2 Verified Gemini 4 & 3.8 TTS SDK / Endpoint Safeguards
1. **Endpoint Region (`GOOGLE_CLOUD_LOCATION=global`):** Mandatory for all Gemini 4 and Gemini 3.8 TTS endpoints (`aiplatform.googleapis.com`). `us-central1` returns `404` on Gemini 4 & 3.8 TTS; `us` fails `@google/genai@1.17.0` hostname resolution.
2. **Thinking Budget & `maxOutputTokens` Safeguard:** Gemini 4 counts thinking tokens inside `maxOutputTokens` (`gemini-4-hydrogen` defaults to `HIGH` thinking; `gemini-4-carbon` defaults to `MEDIUM`). Setting small `maxOutputTokens` (`256`–`1024`) causes empty `""` responses.
   - `generateContentWithFallback({ contents, config, preferredModel, tier?: 'hydrogen' | 'carbon', thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' })` automatically enforces safe `thinkingConfig: { thinkingLevel }` defaults (`'LOW'` for fast JSON tasks on Hydrogen, `'MEDIUM'` for deep synthesis on Carbon) and generous `maxOutputTokens` (`>= 4096` Hydrogen / `>= 8192` Carbon, or omitted).
   - **Prohibited parameters:** Never pass `thinkingBudget` or `thinkingLevel: 'MINIMAL'` (HTTP `400` on Gemini 4). Sampling parameters (`temperature`, `topP`, `topK`) are ignored by Gemini 4.
3. **Gemini 3.8 TTS Multi-Speaker & WAV Header Rules:**
   - `@google/genai@1.17.0` rejects `multiSpeakerVoiceConfig` client-side on Vertex AI; multi-speaker synthesis uses Vertex AI `v1beta1` REST with per-turn `speech_metadata: { speaker, style }`.
   - Unary `gemini-3.8-flash-tts` and `gemini-3.8-flash-lite-tts` return complete `RIFF...WAVE` files directly; inspect header bytes before wrapping raw PCM to avoid corrupt double-wrapped WAV headers.
4. **Auth & Cloudtop Resilience:** `@google/genai` SDK primary (`vertexai: true`, `project: "sa-learning-1"`, `location: "global"`), with automatic Vertex AI REST fallback via `google-auth-library` / `gcloud auth print-access-token` if local ADC returns `invalid_rapt` / `invalid_grant`.

---

## 5. A2UI 1.0 Visual Article Renderer Architecture (Backlog Item #1 — P0)

> **Status:** Normative A2UI v1.0 Contract Incorporated (verified against official `specification/v1_0/json/common_types.json` & `catalogs/basic/v1/catalog.json`, board #6–#8).

### 5.1 Wire Envelope & Message Lifecycle (`application/a2ui+json`)
Every protocol message carries `"version": "1.0"`. `POST /api/a2ui` returns:
```json
{
  "version": "1.0",
  "surfaceId": "article-brief-<hash>",
  "messages": [
    { "version": "1.0", "createSurface": { "surfaceId": "...", "catalogId": "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json" } },
    { "version": "1.0", "updateDataModel": { "surfaceId": "...", "path": "/", "value": { ... } } },
    { "version": "1.0", "updateComponents": { "surfaceId": "...", "components": [ { "id": "root", "component": "Column", ... } ] } }
  ],
  "modelUsed": "gemini-4-hydrogen",
  "cached": false,
  "fallback": false,
  "generatedAt": "2026-11-17T..."
}
```
- **`createSurface`:** `{ surfaceId, catalogId?, sendDataModel?, components?, dataModel?, metadata? }` — omits deprecated v0.9 `theme` field; implicitly mounts canonical `Surface` (`child: "root"`). Renderer also supports single-message inline `createSurface`.
- **`updateDataModel`:** `{ surfaceId, path?, value }` — `value` required (`null` deletes key at `path`); `path` is unprefixed RFC 6901 JSON Pointer (defaults to `"/"`).
- **`updateComponents`:** flat adjacency list; **MUST** include `id: "root"`; `"component": "Surface"` is reserved and rejected.
- **`deleteSurface`:** `{ surfaceId }`.
- **Tree References & Dynamic Expressions:**
  - Single child refs: `ComponentId` (`child`, `trigger`, `content`); multi-child refs: `ChildList` (`string[]` or data template `{ componentId: string, path: string }`, unprefixed `path`).
  - Data bindings: `{ "@path": "/pointer" }` (absolute RFC 6901 or relative within `List` template scope).
  - Function calls: `{ "@call": "formatString" | "formatNumber" | "formatDate" | "pluralize" | "openUrl" | "@index", "args": { ... } }` (including inside `Button.action.functionCall`).

### 5.2 Multi-Catalog Component Registry (Strict Allowlist)
Resolution order: per-component **`catalogId`** (unprefixed per canonical `common_types.json#/$defs/ComponentCommon`; `@` is reserved exclusively for directives `@path`, `@call`, `@index`, while `@catalogId` is safely normalized on ingress) → surface default `catalogId` → reject.

| Catalog URI | Role | Allowlisted Components |
|---|---|---|
| `https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json` | Surface Default (`createSurface.catalogId`) | `Column`, `Row`, `Card`, `List` (static + template), `Tabs`, `Divider`, `Text` (`body` \| `caption`), `Button` (`default` \| `primary` \| `borderless`, `action.functionCall` or `action.event`), `Icon`, `Modal` |
| `https://research-pulse.ai-tech.google/a2ui/v1_0/research_brief_catalog.json` | Research Brief Extension (every node declares `"catalogId"`) | `HeroBanner`, `Heading` (levels 1–4), `MetricCard` (`tabular-nums`), `Callout` (`info` \| `innovation` \| `warning` \| `success`), `StepFlow`, `DataTable`, `Collapsible`, `Badge` |

### 5.3 End-to-End Execution Flow
```
NewsCard ("Visual Brief" button)
  └─> opens ArticleVisualDrawer (full-height modal/drawer, FDE light canvas + lab-accent hero)
        └─> POST /api/a2ui { title, link, source, date, snippet/summary, tags }
              ├─> 1. In-memory LRU cache lookup (keyed by normalized link)
              ├─> 2. SSRF-safe article text extraction (Cheerio, timeout + size cap)
              ├─> 3. Upgraded Gemini 4 structured JSON generation -> A2UI 1.0 message stream
              ├─> 4. Server-side validator (`lib/a2ui/validator.ts`: root check, catalogId allowlist,
              │      pointer/prototype-pollution guard, URL check, DFS cycle + depth<=24 + nodes<=200)
              │        └─> On LLM/validation error: Deterministic A2UI 1.0 Fallback Builder
              └─> 5. Returns { version: "1.0", surfaceId, messages, modelUsed, cached, fallback, generatedAt }
        └─> Client A2UIRenderer consumes A2UI 1.0 messages:
              ├─> Applies createSurface / updateDataModel / updateComponents / deleteSurface
              ├─> Resolves { "@path": ... } & { "@call": ... } expressions safely
              ├─> Enforces DFS cycle guard (depth <= 24, nodes <= 200) & click-activated http(s) openUrl
              └─> Renders strictly allowlisted FDE corporate catalog components (`components/a2ui/catalog.tsx`)
```

### 5.4 Module Ownership & Boundaries
| File | Responsibility |
|---|---|
| `lib/a2ui/spec.ts` | Canonical A2UI 1.0 TypeScript types, catalog URIs, component allowlists, and protocol constants. |
| `lib/a2ui/validator.ts` | Server-side A2UI 1.0 message validator (envelope, `root`, `catalogId`, RFC 6901 pointer + prototype-pollution block, `http(s)` URL check, DFS cycle/depth/node limits) and deterministic fallback A2UI 1.0 brief builder. |
| `app/api/a2ui/route.ts` | `POST /api/a2ui` handler: accepts `{ title, link, source, date, snippet?, summary?, keyInnovation?, significance?, tags?, refresh?, tier? }` (coalescing `summary \|\| snippet`), runs hop-by-hop DNS/IP SSRF-hardened scraping (`6s` timeout, `512 KB` cap), invokes `gemini-4-hydrogen` (`thinkingLevel: 'LOW'`, `maxOutputTokens: 6144`), enforces `normalizeAndLockArticleDataModel()` + `validateA2UIPayload()` + uncached deterministic fallback, caches validated LLM briefs in global LRU (`128` entries, `6h` TTL), and supports `Accept: application/a2ui+json` content negotiation. |
| `components/a2ui/catalog.tsx` | FDE-styled React implementations for Basic + Research Brief Extension catalogs strictly adhering to `CONSTITUTION.md` Articles II & III (inline `<span>` rendering inside `Button` for HTML5 validity, single-line truncated `HeroBanner` significance pill, WCAG AA `#8F4E00`/`#9A5200` caution text, `#335CD6` primary CTAs, `Google Sans Mono` `400`-only badges). |
| `components/a2ui/A2UIRenderer.tsx` | Spec-compliant A2UI 1.0 surface engine: message reducer, JSON Pointer & `@call` evaluator, local interactive state (tabs/collapsibles), WAI-ARIA plumbing, security invariants. |
| `components/a2ui/ArticleVisualDrawer.tsx` | Responsive full-height drawer/modal shell (Desktop `max-w-4xl` & Mobile `390×844` 2-row header), `4px` FDE rainbow top bar, loading skeleton, error + retry state, model/cache telemetry badge, and `"Inspect A2UI 1.0 Payload"` raw JSON toggle with copy action. |
| `components/news-card.tsx` & `components/news-feed.tsx` | Non-crowding single-row `"Visual Brief"` CTA (`#335CD6`, `min-h-[34px]`, `whitespace-nowrap`) on every card alongside `"Read"` and `"Summarize"`; single shared `<ArticleVisualDrawer>` mounted in `NewsFeed`. |

### 5.5 Visual Brief Content Anatomy (Mandatory Sections)
Every rendered A2UI 1.0 Visual Brief **MUST** present a scannable, publication-grade executive layout:
1. **Hero Header (`HeroBanner`):** 4px lab-specific accent gradient bar, `CompanyLogo` + lab name + tabular publication date + canonical taxonomy `Badge` pills + unclamped `Google Sans` bold title.
2. **Executive Synthesis (`Callout` `innovation`/`info`):** High-signal `55–75ch` overview with `#4471ED` left border rule (`bg-[#F8F9FA]`).
3. **Key Metrics / Technical Highlights (`MetricCard` grid):** 2–4 scannable cards (`tabular-nums` figures or qualitative impact highlights when quantitative metrics are absent).
4. **Interactive Exploration Zone (`Tabs` & `Collapsible` Deep-Dives):**
   - *Architecture / Methodology Flow (`StepFlow`):* Numbered step-by-step technical pipeline.
   - *Comparative Breakdown (`DataTable`):* Structured comparison (`#E8F0FE` header, `#DADCE0` dividers, `overflow-x-auto`).
   - *Takeaways & Limitations/Caveats (`Callout` `success` / `warning`):* Semantic callout cards (Green `#E6F4EA` for Takeaways / Impact; Yellow `#FEF7E0` for Caveats / Limitations).
5. **Provenance & Citation Footer (`Button` with `openUrl`):** Verified source link (`https://` only, `noopener,noreferrer`), active model badge, and `"Inspect A2UI 1.0 Payload"` toggle.

---

## 6. Backend API Surface Summary

| Endpoint | Method | Auth | Caching / Guard | Primary Function |
|---|---|---|---|---|
| `/api/news` | `GET` | Public | 15-min ingest cooldown on `refresh=true` | Paginated feed, time/lab filter, Hybrid Vector + BM25 + Discovery Engine search |
| `/api/summarize` | `POST` | Public | Permanent SQLite `cached_summaries` | Full-text scrape + structured JSON executive summary |
| `/api/a2ui` | `POST` | Public | In-memory LRU cache | Full-text scrape + Gemini 4 A2UI 1.0 Visual Brief synthesis + schema validation |
| `/api/trends` | `POST` | Public | 10-min server memory cache | Cross-lab convergence analysis, ranked signals, strategic markdown synthesis |
| `/api/insights/generate` | `POST` | Public | None (on-demand WAV stream) | Multi-speaker podcast / executive overview script + Gemini TTS WAV synthesis |
| `/api/insights/transcribe` | `POST` | Public | None (on-demand JSON) | Multimodal audio transcription & speaker diarization |
| `/api/self-improve` | `GET`/`POST` | Public | Logged in `self_improvement_logs` | Live DB/AI telemetry (`GET`); batch enrichment + LLM meta-audit cycle (`POST`) |
| `/api/lucky` | `GET` | Public | None | HTTP 307 redirect to random publication from the past 3 months |
| `/api/admin/ingest` | `POST` | `Bearer ADMIN_SECRET` | In-process mutex, `maxDuration=300s` | Scheduled (6h Cloud Scheduler) or manual 9-lab ingestion & enrichment |

---

## 7. Deployment & Operational Specification

- **Container Runtime:** Multi-stage `Dockerfile` (`node:22-alpine`, Next.js `output: 'standalone'`, non-root `nextjs` user `uid 1001`, port `8080`, bundles `public/` and `data/news.db`).
- **Cloud Run Service:** `ai-research-pulse` in `sa-learning-1` (`us-central1`), attached to Cloud SQL instance `sa-learning-1:us-central1:ai-research-pulse-db`.
- **Cloud Scheduler:** `ai-research-pulse-auto-ingest` (`0 */6 * * *`) invoking `POST /api/admin/ingest`.
- **Verified Cloud Run Model & Routing `--set-env-vars`:**
  ```bash
  --set-env-vars="GOOGLE_CLOUD_PROJECT=sa-learning-1,GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=gemini-4-hydrogen,GEMINI_CARBON_MODEL=gemini-4-carbon,GEMINI_TTS_MODEL=gemini-3.8-flash-tts,GEMINI_TTS_LITE_MODEL=gemini-3.8-flash-lite-tts,GEMINI_TRANSCRIPTION_MODEL=gemini-4-hydrogen,GEMINI_EMBEDDING_MODEL=text-embedding-004,VERTEX_RERANKER_MODEL=semantic-ranker-512@latest,GCS_ARCHIVE_BUCKET=ai-research-pulse-assets"
  ```
- **Additional Production Secrets / DB Env Vars:** `ADMIN_SECRET`, `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (provisioned via Cloud Run secret/env config).
