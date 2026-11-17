# CONSTITUTION.md — AI Research Pulse Governance & Design Law

> **Status:** Normative & Enforceable  
> **Scope:** `/usr/local/google/home/sanchitalekh/Code/ai-research-pulse`  
> **Authority:** Google Cloud AI Tech Group (Field Data & AI Engineering / FDE)  
> **Enforcement:** Every engineering change, AI prompt, A2UI component, and documentation update MUST satisfy the objective compliance criteria below before release. Reviewers (`@critic-ux`) and engineers (`@a2ui-engineer`, `@models-engineer`, `@architect-docs`) treat violations of **MUST** / **NEVER** clauses as blocking defects.

---

## Article I — Product Mission & Editorial Signal Laws

### §1.1 Core Mission
AI Research Pulse is an enterprise frontier AI intelligence platform that continuously ingests, filters, embeds, synthesizes, vocalizes, and visually briefs technical publications across **9 canonical frontier AI laboratories & ecosystems**:

| # | Canonical Source ID | Primary Ingestion Mechanism | Corpus Share (Verified `data/news.db`) |
|---|---|---|---|
| 1 | `OpenAI` | RSS (`openai.com/news/rss.xml`) | 1,269 |
| 2 | `Google Cloud AI` | RSS + Boq RPC `SQC9mf` historical archive (`2025+`) | 555 |
| 3 | `Chinese Frontier` | Qwen RSS + arXiv API (`DeepSeek`, `Qwen`, `Kimi`, `GLM`) | 263 |
| 4 | `Google Research` | RSS (`research.google/blog/rss/`) | 180 |
| 5 | `Google DeepMind` | RSS (`deepmind.com/blog/feed/basic`) | 178 |
| 6 | `Anthropic` | Curated RSS (`engineering`, `research`, `red`) | 134 |
| 7 | `Meta AI` | Live portal crawler (`research.meta.ai` + `sitemap.xml`) + 3 RSS feeds | 59 |
| 8 | `x.AI` | Curated RSS (`feed_xainews.xml`) | 39 |
| 9 | `Microsoft Research` | RSS (`blogs.technet.microsoft.com/machinelearning/feed`) | 20 |
| | **Total Indexed Corpus** | **3-Tier Zero-Loss Archive** | **2,697 (1,019 from 2026)** |

### §1.2 Editorial Signal & Noise Exclusion Law
1. **Pre-Storage Technical Filtering (`lib/content-filter.ts`):** Corporate navigation links (`/team/`, `/policies/`, `/global-affairs/`, `/careers`, `/press/`), generic landing titles (`Economic Research`, `Interpretability`, `Societal Impacts`, `Alignment`, `Teacher Access Terms`), earnings reports, and non-technical PR announcements **MUST** be stripped *before* database insertion.
2. **Canonical Tag Taxonomy (`lib/ingestion.ts`):** Every article **MUST** be classified using the 35-tag canonical `TAG_TAXONOMY`:
   `LLM`, `Vision`, `Multimodal`, `Audio`, `Video`, `RL`, `Robotics`, `Agents`, `Safety`, `Alignment`, `Interpretability`, `Efficiency`, `Quantization`, `Distillation`, `Training`, `Fine-tuning`, `RLHF`, `Inference`, `Serving`, `Systems`, `Data`, `Synthetic Data`, `Evaluation`, `RAG`, `Retrieval`, `Search`, `Code`, `Math`, `Reasoning`, `Science`, `Healthcare`, `Climate`, `Diffusion`, `Generation`, `World Models` (plus sub-lab prefixes `DeepSeek`, `Qwen`, `Kimi`, `GLM` for `Chinese Frontier`).
3. **Zero-Hallucination Citation Law:** Every AI-generated Executive Briefing, Cross-Lab Trend Report, Audio Script, and A2UI 1.0 Visual Brief **MUST** remain strictly grounded in the article's title, snippet, and extracted body text. Quantitative benchmarks or metrics **MUST NOT** be fabricated; when an article lacks numerical benchmarks, the UI **MUST** surface qualitative methodology/impact highlights or explicitly indicate `"Not reported in excerpt"` rather than inventing numbers. Every brief **MUST** preserve a direct citation link to the canonical source `link`.

---

## Article II — Corporate Design System Laws (Google Cloud AI Tech Group — FDE)

Every surface in the application — including the main feed, hero, trends, audio studio, self-improvement console, and **every A2UI 1.0 rendered component** — **MUST** strictly obey the vendored FDE identity tokens in `public/brand/palette.json` and `app/globals.css`.

### §2.1 Normative Color Token Table (Hex Contract)
> **Palette Provenance Note:** Base tokens originate from `public/brand/palette.json` (`canvas`, `accent`, `text_on_dark`, `text_on_light`, `gradient_stops`, `google_brand`). One intentional web-ergonomics softening applies in `app/globals.css`: `palette.json` defines `text_on_light.primary: "#000000"`, which `app/globals.css` maps to Google Grey-900 **`#202124`** (`--text-light-primary` / `--foreground`) to reduce screen halation while preserving `16.10:1` contrast.

#### A. Core Canvases, Surfaces & Borders
| Role | CSS Variable / Token | Exact Hex | Usage Rule |
|---|---|---|---|
| Dark Hero / Chrome Canvas | `--canvas-dark` | `#202124` | Top `SiteHeader`, `SearchHero`, dark section hero banners, active dark pill buttons. |
| Dark Elevated Surface | *(dark input/badge)* | `#303134` | Inputs and model badges on dark canvas (`#202124`). |
| Dark Hairline Border | *(dark divider)* | `#3C4043` | Header bottom border and dark banner outlines. |
| Light Page Canvas | `--canvas-light`, `--background` | `#F8F9FA` | Default page background and inset card callout surfaces. |
| Elevated Card Surface | `--card`, `--popover` | `#FFFFFF` | Article cards, drawer surface, modals, table containers, filter controls. |
| Muted / Track Surface | `--muted` | `#F1F3F4` | Progress tracks, neutral badges, inactive matrix cells. |
| Structural Border / Rule | `--border`, `--rule` | `#DADCE0` | Mandatory `1px` borders on cards, dividers, tables, and inputs. |

#### B. Brand Accents & Interactive Tokens (WCAG 2.1 Verified)
| Role | CSS Variable / Token | Exact Hex | Usage & Contrast Rule |
|---|---|---|---|
| AI Tech Sparkle Blue | `--accent-blue`, `--primary` | `#4471ED` | Icons, active focus rings, left-accent rules (`border-l-4`), large/bold headings (`>= 18.67px`). **Contrast note:** `#4471ED` vs `#FFFFFF` is `4.35:1` (passes WCAG AA `>= 3.0:1` for large text/UI components; **DO NOT** use `#4471ED` for small normal-weight body text on white). |
| Primary Hover / High-Contrast Solid Blue | *(interactive solid)* | `#335CD6` | Hover state for `#4471ED` buttons and preferred fill for small-label white-on-blue CTAs (`#FFFFFF` on `#335CD6` = `5.77:1` PASS AA). |
| Interactive Tint Surface | `--secondary`, `--tint` | `#E8F0FE` | Semantic match banners, table headers (`<thead>`), active selection rows, info callouts. |
| Interactive Tint Hover | *(pill hover)* | `#D2E3FC` | Hover background for `#E8F0FE` pills and buttons. |
| Accessible Blue Text (Light) | `--secondary-foreground` | `#1967D2` | Mandatory small/normal blue text & link token on `#FFFFFF` (`5.37:1` PASS AA) and `#E8F0FE` (`4.68:1` PASS AA). |
| Accessible Blue Text (Dark) | *(dark accent label)* | `#8AB4F8` | Model telemetry badges and accent labels rendered on `#202124` (`7.64:1` PASS AA) / `#303134`. |

#### C. Text Hierarchy (Exact WCAG 2.1 Ratios)
| Role | CSS Variable / Token | Exact Hex | Contrast Ratio |
|---|---|---|---|
| Primary Text on Light | `--text-light-primary`, `--foreground` | `#202124` | `16.10:1` on `#FFFFFF` / `15.27:1` on `#F8F9FA` |
| Body Prose Accent (Light) | *(markdown body)* | `#3C4043` | `10.47:1` on `#FFFFFF` |
| Secondary Text on Light | `--text-light-secondary`, `--muted-foreground` | `#5F6368` | `6.05:1` on `#FFFFFF` / `5.74:1` on `#F8F9FA` |
| Primary Text on Dark | `--text-dark-primary` | `#FFFFFF` | `16.10:1` on `#202124` |
| Chip Text on Dark | *(dark pill label)* | `#E8EAED` | `13.36:1` on `#202124` |
| Secondary Text on Dark | `--text-dark-secondary` | `#BABBBC` | `8.37:1` on `#202124` |

#### D. Google Brand Quad & Semantic Status Surfaces (WCAG 2.1 AA Compliant)
| Semantic Role | Accent Hex | Surface Tint | High-Contrast Text (AA Verified) | Border Rule |
|---|---|---|---|---|
| Google Blue / Info / Emerging | `#4285F4` / `#4471ED` | `#E8F0FE` | `#1967D2` (`4.68:1` on `#E8F0FE`) | `#4471ED/30` |
| Google Green / Success / Growing | `#34A853` | `#E6F4EA` | `#137333` (`5.24:1` on `#E6F4EA`) | `#34A853/30` |
| Google Yellow / Caution / Caveat | `#FBBC04` | `#FEF7E0` | `#9A5200` (`5.47:1` on `#FEF7E0`; `#8F4E00` `6.01:1` also approved; supersedes legacy `#B06000` `4.34:1`) | `#FBBC04/40` |
| Google Red / Error / Alert | `#EA4335` | `#FCE8E6` | `#C5221F` (`4.92:1` on `#FCE8E6`) | `#EA4335/30` |

#### E. Signature 5-Stop FDE Rainbow Divider (`.fde-gradient-divider`)
```css
background: linear-gradient(90deg, #EC4032 0%, #FF9302 25%, #FABF03 50%, #42AB42 75%, #0764FF 100%);
```
- **Height Law:** Strictly `4px` (`h-1`) on headers, footers, report cards, and A2UI drawer headers; `6px` (`h-1.5`) on dark hero banners. **NEVER** use as a button fill or text background.

#### F. Per-Lab Card Accent Gradients (`SOURCE_ACCENTS`)
Every article card and A2UI Visual Brief hero header **MUST** encode the publishing lab's canonical `4px` top accent bar (note: `Google Cloud AI` retains classic Cloud yellow `#FBBC05` in `components/news-card.tsx`, distinct from `--google-yellow: #FBBC04` in `palette.json`):
| Lab | Start Hex (`from`) | End Hex (`to`) |
|---|---|---|
| `Google Research` | `#4285F4` | `#34A853` |
| `Google DeepMind` | `#4471ED` | `#4285F4` |
| `Google Cloud AI` | `#4285F4` | `#FBBC05` |
| `OpenAI` | `#10A37F` | `#0764FF` |
| `Anthropic` | `#EC4032` | `#FF9302` |
| `Microsoft Research` | `#0764FF` | `#42AB42` |
| `Meta AI` | `#0668E1` | `#4471ED` |
| `x.AI` | `#202124` | `#5F6368` |
| `Chinese Frontier` | `#DE2910` | `#FFDE00` |

### §2.2 Brand Assets, Watermark Motifs & Confidentiality Matrix
1. **Vendored Brand Assets (`public/brand/`):** `bg_dark_aurora.png`, `bg_light_aurora.png`, `bg_gradient_divider.png`, `logo_mark_color.png`, `logo_mark_mono_dark.png`, `logo_mark_white.png`, `logo_motif_crop.png`, `gcloud_lockup_white.png`, `gcloud_lockup_color.png`.
2. **Oversized Motif Law:** `logo_motif_crop.png` may appear at most **once** per viewport (top-right or bottom-right), at `40%–70%` opacity (default `45%`), with `pointer-events-none select-none aria-hidden="true"`.
3. **Footer Confidentiality Matrix (`components/site-footer.tsx`):** Every primary page **MUST** include `SiteFooter` supporting runtime switching between:
   - `proprietary` (default): `Google Cloud  |  Proprietary & Confidential` (with customer: `Prepared for {customer} · Confidential`)
   - `internal`: `Google — Internal` (with customer: `Google & {customer} — Confidential`)
   - `public`: `Google Cloud` (suppresses customer name)

### §2.3 Prohibited Visual Anti-Patterns
1. **NO off-brand palettes:** Purple/violet/magenta/neon/cyberpunk gradients, arbitrary Tailwind `slate-*`/`indigo-*`/`violet-*` hues, or raw Tailwind `gray-*`/`blue-*` utility classes are **FORBIDDEN** in all new or modified components (always use exact hex tokens or CSS custom properties from §2.1).
2. **NO ungrounded glassmorphism on light surfaces:** Cards on `#F8F9FA` **MUST** remain crisp opaque `#FFFFFF` with `1px solid #DADCE0` borders.
3. **Elevation discipline:** Resting cards use `shadow-xs`, interactive hover cards use `shadow-md` + `border-[#4471ED]/60`, and drawers/modals use `shadow-2xl` over a `bg-[#202124]/60 backdrop-blur-[2px]` scrim.

---

## Article III — Typesetting & Readability Laws (Objective Audit Spec)

### §3.1 Normative Font Stack & Banned Fonts
All typography **MUST** be served via static-instanced TrueType fonts bundled in `public/fonts/` and declared in `app/globals.css`:

| Role | CSS Stack | Bundled Static TTF Files | Weights |
|---|---|---|---|
| **Display / Headings** | `var(--font-display)` (`'Google Sans'`) | `GoogleSans-Regular.ttf`, `GoogleSans-Medium.ttf`, `GoogleSans-Bold.ttf` | `400`, `500`, `700` |
| **Body / UI / Tables** | `var(--font-sans)` (`'Google Sans Text'`) | `GoogleSansText-Regular.ttf`, `GoogleSansText-Medium.ttf`, `GoogleSansText-Bold.ttf`, `GoogleSansText-Italic.ttf` | `400`, `500`, `700`, `400i` |
| **Code / Telemetry / Tags** | `var(--font-mono)` (`'Google Sans Mono'`) | `GoogleSansCode-Regular.ttf` | `400` |

- **STRICTLY PROHIBITED FONTS:** `Roboto`, `Inter`, `Arial`, `Helvetica`, `Noto Sans`, `DejaVu Sans`, and variable-axis `Google Sans Flex` (variable fonts trigger Chrome Type 3 rasterization defects). Any computed `font-family` resolving to a prohibited font is a **P0 defect**.

### §3.2 Root Scale, Type Hierarchy & Line Measure
Root `html` is fixed at **`font-size: 17.5px`** (`app/globals.css`), with `body` `line-height: 1.6`, `-webkit-font-smoothing: antialiased`, and `text-rendering: optimizeLegibility`. All `rem` classes scale from `17.5px`:

| Semantic Role | Tailwind Class | Computed Size | Family | Weight | Line-Height | Tracking |
|---|---|---|---|---|---|---|
| Hero Display (`H1`) | `text-5xl md:text-7xl` | `52.5px` / `78.75px` | `Google Sans` | `700` | `1.05` | `-0.015em` |
| Drawer / Brief Title (`H1/H2`) | `text-xl md:text-2xl` | `21.88px` / `26.25px` | `Google Sans` | `700` | `1.20–1.25` | `-0.015em` |
| Card Title / Section `H3` | `text-lg` | `19.69px` | `Google Sans` | `700` | `1.30–1.375` | `-0.015em` |
| Subsection / Block Title `H4` | `text-base` | `17.5px` | `Google Sans` | `700` | `1.35` | `-0.015em` |
| Primary Prose Body | `text-sm`–`text-base` | `15.3px`–`17.5px` | `Google Sans Text` | `400` | `1.55–1.65` | `0` |
| Card Snippet / Secondary Text | `text-sm` | `15.31px` | `Google Sans Text` | `400` | `1.50–1.625` | `0` |
| Section Eyebrow / Label | `text-xs uppercase` | `13.13px` | `Google Sans` | `700` | `1.25` | `+0.06em` (`tracking-wider`) |
| Telemetry Badge / Tag Pill | `text-xs font-mono font-normal` | `13.13px` (floor `11px`) | `Google Sans Mono` | `400` *(strictly `400` — no faux-bold)* | `1.25` | `+0.02em` |

> **Faux-Bold Prohibition Law:** Because `Google Sans Mono` bundles only `GoogleSansCode-Regular.ttf` (`font-weight: 400`), all `.font-mono` badges, tags, and telemetry pills **MUST** use `font-normal` (`400`). Whenever `500`/`700` bold emphasis is needed on labels or headers, use `Google Sans` (`font-display`) or `Google Sans Text` (`font-sans`).

### §3.3 Quantitative Typesetting Compliance Laws
1. **Optimal Reading Measure:** All long-form prose blocks (executive synthesis, callout descriptions, drawer body copy, deep-dive paragraphs) **MUST** be constrained to **`55–75ch`** (`max-w-[68ch]` or `max-w-prose`). Unconstrained lines exceeding `85ch` on desktop are a **P1 typesetting defect**.
2. **Minimum Legibility Floor:** Interactive controls and body prose **MUST** be `>= 13px` (`text-xs` at `17.5px` root = `13.125px`). Micro-badges and table headers **MUST** be `>= 11px`; sub-`10px` text is **PROHIBITED**.
3. **Tabular Numerals Law:** Every numeric KPI, metric card figure, benchmark score, percentage, date, timestamp, latency counter, and table numeric cell **MUST** apply `.tabular-nums` (`font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1;`).
4. **Zero Overflow & Clipping Law:**
   - Zero horizontal document overflow (`scrollWidth <= clientWidth`) at both Desktop (`1440×900`) and Mobile (`390×844`).
   - Tables and JSON inspectors **MUST** wrap inside `overflow-x-auto` containers so wide benchmarks never break drawer or page width.
   - Multi-line titles use deliberate clamping (`line-clamp-2` on cards, unclamped in Visual Brief drawer headers) with `break-words` / `min-w-0` inside flex containers.
5. **Card Footer Density & Touch Target Law (`components/news-card.tsx`):**
   - At Desktop `1440px` (3-column `max-w-7xl` grid, ~`380px` per card) and Mobile `390px` (1-column, ~`358px` per card), card footer actions **MUST** fit cleanly without text wrapping, clipping, or vertical stacking collisions.
   - Action labels **MUST** remain concise (`Read`, `Brief`, `Visual Brief` or `Read Paper`, `Summarize`, `Visual Brief`) with `whitespace-nowrap`, `shrink-0`, and minimum `32px` desktop / `36px` mobile hit target height.
6. **WCAG 2.1 AA Contrast Law:** Minimum `4.5:1` contrast for all body/label text and `3.0:1` for large headings (`>= 18.67px` bold / `>= 24px` regular) and interactive borders. On `#FFFFFF` / `#E8F0FE`, normal-size blue text **MUST** use `#1967D2` (`5.37:1` / `4.68:1`), never `#4471ED` (`4.35:1`). On `#FEF7E0` caution surfaces, text **MUST** use `#9A5200` (`5.47:1`) or `#8F4E00` (`6.01:1`). On solid blue buttons with small white labels, prefer `#335CD6` (`5.77:1`) or bold large text.
7. **Motion & Reduced-Motion Law:** Transitions stay within `150ms–300ms` ease curves. Drawers/tabs use `motion/react` or CSS transitions and **MUST** remain completely functional when `prefers-reduced-motion: reduce` is active.

---

## Article IV — Architecture & 3-Tier Zero-Loss Persistence Laws

### §4.1 3-Tier Storage Invariant (`lib/db.ts`, `lib/gcs-archive.ts`)
1. **Tier 1 — Cloud SQL PostgreSQL (`pgvector`):** Authoritative cloud store (`sa-learning-1:us-central1:ai-research-pulse-db`) with `vector(768)` embeddings, singleton connection pool (`globalThis.__pgPool`, `max: 5`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 2000`) preventing `53300` exhaustion, and idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migrations preventing `42703` schema drift.
2. **Tier 2 — Native SQLite (`node:sqlite`, `data/news.db`):** Bundled local read/cache engine providing `<2ms` reads and zero-downtime failover whenever PostgreSQL is unreachable.
3. **Tier 3 — GCS Master Archive (`gs://ai-research-pulse-assets`):** 11-nines durable backup of `archive/articles-master.json` and `archive/news.db`. Every `saveArticles()` write triggers non-blocking archival backup.
4. **Cold-Start Self-Healing (`ensureDatabaseHydrated()`):** On container cold start, if local SQLite has `< 1,500` rows, it hydrates automatically from GCS; if Cloud SQL is online and has fewer rows than SQLite, it batch-upserts (150 rows/chunk) to restore parity.

### §4.2 768-Dim Embedding Compatibility Law
The production corpus (`2,589 / 2,697` rows embedded in `data/news.db` and `vector(768)` column in Cloud SQL) relies on **768-dimensional** dense vectors (`text-embedding-004`). Any future migration to a newer embedding model **MUST NOT** silently change vector dimensionality or overwrite existing vectors without an explicit dual-column/backfill migration plan tracked in `BACKLOG.md`.

### §4.3 Ingestion Efficiency & Concurrency Law
1. `ingestAll()` **MUST** enforce an in-process mutex (`isIngesting`) and `15`-minute server-side cooldown (`INGESTION_COOLDOWN_MS`) for non-forced runs.
2. LLM tagging **MUST** run in batches (`15` articles/prompt) and vector embeddings **MUST** run in batches (`100` articles/HTTP predict call), with deterministic regex fallback (`extractTagsDeterministic()`) on failure.

---

## Article V — AI Model Hygiene & Routing Governance

### §5.1 Single Source of Truth (`MODEL_REGISTRY`)
1. All LLM, speech TTS, transcription, embedding, and reranker model identifiers **MUST** be centralized in `MODEL_REGISTRY` (`lib/vertex.ts`) with clean environment-variable overrides.
2. Route handlers and UI components **MUST NOT** hardcode stale or deprecated model IDs; UI badges should reflect active telemetry/config returned by the backend or central registry.

### §5.2 Tiered Capability Routing & Gemini 4 Safeguard Laws
Tasks **MUST** be routed by latency vs. reasoning profile using live-verified models on `sa-learning-1` (full details in `SPEC.md` §4):
- **Fast / High-Throughput Tier (`gemini-4-hydrogen`):** Technical content filtering, 15-article batch tagging, single-article executive summarization (`/api/summarize`), A2UI 1.0 visual brief generation (`/api/a2ui`, `thinkingLevel: 'LOW'`), and multimodal audio transcription & diarization (`/api/insights/transcribe`).
- **Deep Reasoning / Multi-Article Synthesis Tier (`gemini-4-carbon`):** Cross-lab strategic trend synthesis (`/api/trends`, `thinkingLevel: 'MEDIUM'`), multi-article podcast scripting, and recursive meta-audit self-improvement (`/api/self-improve`).
- **Speech Synthesis Tier:** `gemini-3.8-flash-tts` (multi-speaker podcasts via Vertex AI `v1beta1` REST per-turn `speech_metadata: { speaker, style }`) and `gemini-3.8-flash-lite-tts` (single-speaker commuter briefings & fallback). Unary 3.8 TTS returns complete `RIFF...WAVE` payloads — **NEVER** double-wrap WAV headers.
- **Mandatory Gemini 4 API Invariants:**
  1. **Endpoint Law:** `GOOGLE_CLOUD_LOCATION` **MUST** be `"global"` (`aiplatform.googleapis.com`); `us-central1` returns `404` for Gemini 4 and 3.8 TTS.
  2. **Thinking & Token Budget Law:** Gemini 4 counts thinking tokens inside `maxOutputTokens` (Hydrogen defaults to `HIGH`, Carbon to `MEDIUM`). Callers **MUST** set explicit `thinkingLevel` (`'LOW'` for fast JSON, `'MEDIUM'` for deep synthesis) with `maxOutputTokens >= 4096` (Hydrogen) / `>= 8192` (Carbon) or omitted. **NEVER** pass `thinkingBudget` or `thinkingLevel: 'MINIMAL'` (HTTP `400` on Gemini 4). Do not rely on `temperature`/`topP`/`topK` for behavioral control (ignored by Gemini 4).
- **Mandatory Fallback Cascade:** Every Vertex AI call **MUST** cascade cleanly across configured fallbacks (`gemini-4-hydrogen` → `gemini-3.8-flash` → `gemini-3.5-flash`; `gemini-4-carbon` → `gemini-4-hydrogen` → `gemini-3.8-flash`) and degrade gracefully to deterministic local synthesis/fallback when cloud auth or quota fails. Never leak raw stack traces or unhandled HTTP 500s to the UI.

---

## Article VI — A2UI 1.0 Governance & Security Laws

The A2UI 1.0 Visual Article Renderer (Backlog Item #1) turns any indexed research article into an interactive, corporate-styled visual brief rendered strictly from declarative **A2UI 1.0** messages.

### §6.1 Wire-Format & Structural Compliance
1. **Declarative Protocol (`application/a2ui+json`, `version: "1.0"`):** Backend `POST /api/a2ui` **MUST** emit valid A2UI 1.0 messages (`createSurface` → `updateDataModel` → `updateComponents`, plus optional `deleteSurface`):
   - `createSurface`: `{ surfaceId, catalogId?, sendDataModel?, components?, dataModel?, metadata? }` — **MUST NOT** include a `theme` field (removed in v1.0 to decouple layout from host branding).
   - `updateDataModel`: `{ surfaceId, path?, value }` — `value` is required (`null` deletes key at `path`); `path` is an unprefixed RFC 6901 JSON Pointer (default `"/"`).
   - `updateComponents`: flat adjacency list with unique `id`s; **MUST** contain `id: "root"`; `"component": "Surface"` is reserved and **MUST** be rejected.
   - Dynamic bindings **MUST** use v1.0 `{ "@path": "/pointer" }` and function calls **MUST** use `{ "@call": "...", "args": {...} }` (including inside `Button.action.functionCall`, never v0.9 bare `call`).
2. **Strict Multi-Catalog Whitelist:** The client renderer (`components/a2ui/A2UIRenderer.tsx`) **MUST** resolve components via per-component `catalogId` (unprefixed per canonical A2UI v1.0 `common_types.json#/$defs/ComponentCommon`; `@` is reserved exclusively for directives `@path`, `@call`, `@index`, though `@catalogId` may be safely normalized on ingress) → surface default `catalogId` → reject. Only two catalogs are allowlisted:
   - Basic Catalog v1.0 (`https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json`): `Column`, `Row`, `Card`, `List`, `Tabs`, `Divider`, `Text`, `Button`, `Icon`, `Modal`.
   - Research Brief Extension Catalog v1.0 (`https://research-pulse.ai-tech.google/a2ui/v1_0/research_brief_catalog.json`): `HeroBanner`, `Heading`, `MetricCard`, `Callout`, `StepFlow`, `DataTable`, `Collapsible`, `Badge` (each **MUST** carry `"catalogId": "https://research-pulse.ai-tech.google/a2ui/v1_0/research_brief_catalog.json"`).
   Unknown catalog IDs or component types **MUST** be rejected/ignored safely without throwing.
3. **Corporate Token Enforcement:** Every catalog component **MUST** strictly conform to Articles II and III (FDE palette, Google Sans static fonts, `tabular-nums`, `55–75ch` prose measure, responsive mobile + desktop layout).
4. **Transparency & Auditability:** The Visual Brief drawer **MUST** provide a non-intrusive `"Inspect A2UI 1.0 Payload"` toggle displaying the exact validated A2UI 1.0 message JSON in `Google Sans Mono` inside a scrollable code block so users and auditors can verify protocol compliance live.

### §6.2 A2UI Security & Resilience Laws
1. **Zero Arbitrary Execution:** **NEVER** use `eval`, `new Function`, `dangerouslySetInnerHTML`, or unvalidated HTML injection inside A2UI components. All text nodes render as escaped React text.
2. **Strict URL & Prototype Sanitization:**
   - Every `openUrl` target resolved from A2UI payloads or JSON Pointers **MUST** validate as `https:` or `http:` via `new URL()`, open with `noopener,noreferrer`, and execute only on explicit user click activation. Reject `javascript:`, `data:`, `vbscript:`, and `file:` schemes.
   - JSON Pointer traversal **MUST** reject prototype-pollution path segments (`__proto__`, `constructor`, `prototype`).
3. **Cycle & Resource Exhaustion Protection:** The A2UI validator and tree renderer **MUST** maintain a DFS ancestor `visited: Set<string>` guard to break cycles, enforce a maximum render depth (`<= 24`), and cap total components (`<= 200`) per surface.
4. **Server-Side Schema Validation + Deterministic Fallback:** `POST /api/a2ui` **MUST** validate LLM-generated payloads via `lib/a2ui/validator.ts` (root reachability, catalog allowlist, pointer/URL/cycle checks) before returning. If LLM generation or validation fails, the server **MUST** deterministically synthesize a valid, rich A2UI 1.0 brief from the article metadata and extracted text (`fallback: true`), guaranteeing 100% render reliability.
5. **Caching:** Validated A2UI 1.0 payloads **MUST** be cached (in-memory LRU cache keyed by normalized `link`, with optional DB persistence) to avoid redundant scraping and LLM calls.

---

## Article VII — Security, SSRF & Deployment Hygiene Laws

1. **SSRF Guard on URL Scraping:** Any backend route that fetches an external article `link` (`/api/summarize`, `/api/a2ui`) **MUST** validate that the URL uses `http:` or `https:`, reject loopback/private/link-local/metadata hostnames and IP ranges (`localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `metadata.google.internal`), enforce a hard fetch timeout (`<= 8000ms`), and cap response size before parsing with Cheerio.
2. **Secret Hygiene:** `.env.local`, API keys, service account JSONs, and database credentials **MUST NEVER** be committed to Git or logged in API responses. `/api/admin/ingest` **MUST** enforce `Authorization: Bearer <ADMIN_SECRET>` in production.
3. **Container Asset Permissions:** All static assets under `public/` (`fonts/`, `brand/`, `assets/`) **MUST** have readable permissions (`0644` files / `0755` directories) so the non-root `nextjs` user (`uid 1001`) in `Dockerfile` can serve fonts and brand marks in Cloud Run without `403`/`500` errors.

---

## Article VIII — Recursive Self-Improvement & Verification Gate

No major feature or model migration is considered **Done** until it passes the full recursive verification loop:
1. **Static Verification:** `npx tsc --noEmit` exits `0` and `npm run build` completes cleanly with zero type/bundler errors.
2. **Live API Verification:** Smoke tests confirm upgraded Gemini 4 & speech models succeed against GCP project `sa-learning-1`, and `/api/news` + `/api/a2ui` return valid, schema-compliant responses on real indexed articles.
3. **Headless Browser Typesetting & UX Audit:** Rendered screenshots at Desktop (`1440×900`) and Mobile (`390×844`) are visually inspected for:
   - Font fidelity (`Google Sans` / `Google Sans Text` / `Google Sans Mono`, zero `Roboto`),
   - Palette & brand token fidelity (Article II),
   - Typesetting measure, heading hierarchy, `tabular-nums`, contrast, and zero horizontal overflow (Article III),
   - Card footer cleanliness and interactive state correctness (tabs, collapsible deep-dives, A2UI 1.0 payload inspector).
4. **Closed-Loop Iteration:** Any P0/P1 defect found during review is returned to the owning engineer, fixed, and re-verified with fresh screenshots until the adversarial reviewer (`@critic-ux`) issues a formal **GREEN LIGHT**.
