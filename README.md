<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AI Research Pulse

Stay ahead of the curve with **AI Research Pulse**, a real-time dashboard that aggregates, analyzes, and visualizes the latest AI research from top labs including Google DeepMind, OpenAI, Anthropic, Meta AI, and Microsoft Research.

Powered by **Gemini 3.0 Pro** and **Vertex AI**, this application uses advanced semantic search and topic modeling to help you find relevant research instantly.

## Features

- **Real-time Aggregation**: Fetches latest research from RSS feeds and official blogs.
- **Semantic Search**: Search for concepts like "LLM scaling" or "RLHF" using vector embeddings (powered by `text-embedding-004`).
- **AI-Powered Insights**:
  - **Auto-Tagging**: Articles are automatically tagged with technical keywords using Gemini.
  - **Smart Summaries**: Get concise 3-bullet summaries of any article on demand.
  - **Trend Analysis**: Visualize trending topics across all research labs.
- **Modern UI**: Clean, Google-style interface with dark mode support (system default).

## Screenshots

![Home Feed](public/assets/home-feed.png)
*Real-time News Feed with AI Tags and Summaries*

![Trends View](public/assets/trends-view.png)
*AI-Powered Trend Analysis using Gemini 3.0 Pro*

## Prerequisites

- **Node.js** (v18 or higher)
- **Google Cloud SDK** (`gcloud` CLI) installed and configured.
- A Google Cloud Project with **Vertex AI API** enabled.

## Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/ai-research-pulse.git
   cd ai-research-pulse
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Authenticate with Google Cloud:**
   This application uses **Application Default Credentials (ADC)**. You do not need to manage API keys manually.
   ```bash
   gcloud auth application-default login
   ```
   Follow the browser prompt to log in with your Google account.

4. **Set Environment Variables (Optional):**
   The app infers your project ID from the gcloud config. If you need to override it:
   Create a `.env.local` file:
   ```env
   GOOGLE_CLOUD_PROJECT=your-project-id
   GOOGLE_CLOUD_LOCATION=us-central1
   ```

## Running the Application

Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Architecture

- **Frontend**: Next.js 15 (App Router), Tailwind CSS, Lucide Icons, Recharts.
- **Backend**: Next.js API Routes.
- **Database**: SQLite (via `better-sqlite3`) for caching articles and embeddings.
- **AI Models**:
  - `gemini-3.0-pro-preview`: For deep trend analysis and complex reasoning.
  - `gemini-2.5-flash`: For fast article summarization and auto-tagging.
  - `text-embedding-004`: For semantic search embeddings.

## Troubleshooting

**Search is not working?**
Ensure the `text-embedding-004` model is enabled in your Vertex AI Model Garden.

**"Quota exceeded" errors?**
Check your Vertex AI quota limits in the Google Cloud Console.

## License

Apache 2.0
