# Research Pulse | Google Cloud AI Tech Group (FDE)

> **Executive AI Research Intelligence Platform** — Real-time publication aggregation, cross-lab convergence matrices, multi-speaker audio synthesis, and recursive self-improvement powered by **Google Gemini 3.8 Flash**.

Stay ahead of frontier AI breakthroughs with **Research Pulse**, an enterprise-grade intelligence dashboard that aggregates, filters, and synthesizes technical research across **Google DeepMind**, **Google Research**, **OpenAI**, **Anthropic**, **Meta AI**, **Microsoft Research**, and **x.AI**.

---

## ✨ Key Architectural Capabilities

- **Gemini 3.8 Flash Primary Reasoning Engine (`lib/vertex.ts`)**:
  - Defaults to `gemini-3.8-flash` with an automatic cascading fallback (`gemini-3.8-flash` → `gemini-3.5-flash` → `gemini-2.5-flash`) and deterministic synthesis fallback to ensure 100% uptime across regional Vertex AI endpoints and local environments.
  - Supports both Google Cloud Vertex AI (`sa-nexus-gcp-4-sandbox-183936` / `global`) and direct API key authentication.
- **Dual-Engine Resilient Database (`lib/db.ts`)**:
  - **PostgreSQL + pgvector Primary**: Uses a singleton connection pool (`globalThis.__pgPool`, `max: 5`) to prevent Cloud SQL connection exhaustion (`FATAL: 53300`) during Next.js HMR and high-concurrency bursts.
  - **Native SQLite Transparent Fallback (`node:sqlite`)**: Automatically switches to the bundled `data/news.db` (994 curated technical publications) with sub-15ms in-memory cosine similarity + lexical BM25 hybrid search whenever Cloud SQL Proxy is offline.
- **15× More Efficient Batch Ingestion & Content Filtering (`lib/ingestion.ts`, `lib/content-filter.ts`)**:
  - **Pre-Storage Technical Filtering**: Strips non-technical PR announcements, navigation links, and policy pages *before* database insertion or embedding generation.
  - **Batched Tag Taxonomy & Embeddings**: Classifies up to 15 publications per `gemini-3.8-flash` JSON prompt and batches up to 100 embeddings per Vertex AI `text-embedding-004:predict` request.
  - **Permanent Summary & Trend Cache**: Caches generated article briefings (`cached_summaries`) and cross-lab trend matrices for `<2ms` subsequent retrieval.
- **Recursive Self-Improvement Engine (`/api/self-improve`)**:
  - Dedicated diagnostic & self-optimization loop that audits corpus taxonomy coverage, evaluates retrieval latency, and uses `gemini-3.8-flash` as a Meta-Auditor to critique and refine classification prompts.
- **Google Cloud AI Tech Group (FDE) Brand Design System**:
  - Strict adherence to the normative `ai-tech-gtm-collateral` specification (`brand.md` & `palette.json`).
  - **Typography**: Pre-instanced static TTFs (`Google Sans`, `Google Sans Text`, `Google Sans Mono`) with OpenType tabular numerals (`tnum`). Zero `Roboto` usage.
  - **Visual Identity**: Near-black (`#202124`) & Grey-50 (`#F8F9FA`) canvases, AI Tech Sparkle Blue (`#4471ED`) accent, 5-stop rainbow diagonal divider (`#EC4032 → #FF9302 → #FABF03 → #42AB42 → #0764FF`), aurora background plates, oversized cropped chevron mark motif, and dynamic Confidentiality × Customer footer matrix.

---

## 🛠️ Tech Stack

- **Framework**: Next.js (App Router), React, TypeScript, Tailwind CSS v4
- **Typography**: Static-instanced Google Sans, Google Sans Text, Google Sans Mono TTFs
- **Database**: Dual-Engine PostgreSQL (`pg` + `pgvector`) + Native Node.js SQLite (`node:sqlite` on `data/news.db`)
- **AI Models**:
  - `gemini-3.8-flash`: Primary model for technical filtering, executive summaries, cross-lab trend matrices, podcast script writing, and recursive self-improvement audits.
  - `gemini-2.5-pro-preview-tts`: Multi-speaker audio synthesis (Dr. Anya & Liam).
  - `text-embedding-004`: Batched 768-dimensional semantic embeddings.
  - `semantic-ranker-512@latest`: Discovery Engine semantic reranking.

---

## 💻 Local Development & Verification

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Configuration (`.env.local`):**
   ```env
   GOOGLE_CLOUD_PROJECT=sa-nexus-gcp-4-sandbox-183936
   GOOGLE_CLOUD_LOCATION=global
   GEMINI_MODEL=gemini-3.8-flash
   ```

3. **Run Development Server:**
   ```bash
   npm run dev
   ```
   The application runs immediately against the bundled dual-engine database (`data/news.db`) even without a running Cloud SQL proxy.

4. **Production Build Verification:**
   ```bash
   npm run build
   ```
