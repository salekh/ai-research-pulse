import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { saveArticles, getArticles, Article } from '@/lib/db';
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml; q=0.1',
  }
});

// Initialize Vertex AI
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const vertex_ai = project ? new VertexAI({ project, location }) : null;

if (!vertex_ai) console.warn('Vertex AI not initialized: Missing project ID');

export async function ingestAll(refresh = false) {
  console.log('Starting ingestion...');
  
  // Define feeds
  const feeds = [
    { url: 'https://research.google/blog/rss/', source: 'Google Research' },
    { url: 'https://deepmind.com/blog/feed/basic', source: 'Google DeepMind' },
    { url: 'https://openai.com/news/rss.xml', source: 'OpenAI' },
    { url: 'https://blogs.technet.microsoft.com/machinelearning/feed', source: 'Microsoft Research' },
    { url: 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_xainews.xml', source: 'x.AI' },
    { url: 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_engineering.xml', source: 'Anthropic' },
    { url: 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_research.xml', source: 'Anthropic' },
    { url: 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_red.xml', source: 'Anthropic' },
  ] as const;

  const allArticles: Article[] = [];

  // 1. Fetch RSS Feeds
  const rssPromises = feeds.map(feed => fetchRSS(feed.url, feed.source as Article['source']));
  const rssResults = await Promise.all(rssPromises);
  rssResults.forEach(articles => allArticles.push(...articles));

  // 2. Scrape Anthropic (Direct) - Optional, if RSS is stale
  // For now, we rely on the RSS feeds as they are more stable, but we can add scraping if needed.
  // We'll skip direct scraping for now to keep it simple and fast, unless requested.

  // 3. Deduplicate and Save
  const uniqueArticles = deduplicateArticles(allArticles);
  console.log(`Ingested ${uniqueArticles.length} unique articles.`);

  await saveArticles(uniqueArticles);

  // 4. Post-process (Tags & Embeddings)
  // We process a subset or all depending on 'refresh' flag or just always process missing ones.
  await processMissingMetadata();
  
  return uniqueArticles;
}

async function fetchRSS(url: string, source: Article['source']): Promise<Article[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml; q=0.1',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const xml = await response.text();
    const feed = await parser.parseString(xml);

    return feed.items.map((item) => {
      let tags: string[] = [];
      if (item.categories) {
        tags = item.categories.slice(0, 4);
      }

      let title = item.title || 'No title';
      let link = item.link || '';
      
      // Anthropic specific fixes
      if (source === 'Anthropic') {
        if (link.includes('/team/')) return null;
        
        // Handle "Dec 4, 2025Societal ImpactsIntroducing..."
        // 1. Remove the date prefix if present
        const dateRegex = /^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/;
        const dateMatch = title.match(dateRegex);
        if (dateMatch) {
            title = title.replace(dateRegex, '').trim();
        }

        // 2. Fix mashed CamelCase (e.g. "ImpactsIntroducing" -> "Impacts Introducing")
        // We look for lowercase followed immediately by uppercase
        title = title.replace(/([a-z])([A-Z])/g, '$1 $2');

        // 3. Optional: Remove common prefixes if they look like categories and duplicate the actual title intent?
        // E.g. "Societal Impacts Introducing..." -> "Introducing..."?
        // For now, keeping "Societal Impacts Introducing..." is better than "Societal ImpactsIntroducing...".
        // The user might prefer just the title, but "Societal Impacts" is context.
        // Let's keep it readable first.
      }

      return {
        title,
        link,
        date: item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()),
        source,
        snippet: item.contentSnippet || item.content || '',
        tags,
      };
    }).filter((a) => a !== null) as Article[];
  } catch (error) {
    console.error(`Error fetching RSS from ${source} (${url}):`, error);
    return [];
  }
}

function deduplicateArticles(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter(a => {
    // Normalize link (remove query params, trailing slashes)
    const normalizedLink = a.link.split('?')[0].replace(/\/$/, '');
    if (seen.has(normalizedLink)) return false;
    seen.add(normalizedLink);
    return true;
  });
}

async function processMissingMetadata() {
  console.log('Processing missing metadata (tags/embeddings)...');
  const articles = await getArticles(1000); // Get recent articles
  
  let processedCount = 0;
  for (const article of articles) {
    let updated = false;
    
    // Generate Tags
    if (!article.tags || article.tags.length === 0) {
      const tags = await generateTags(article);
      if (tags.length > 0) {
        article.tags = tags;
        updated = true;
      }
    }

    // Generate Embedding
    if (!article.embedding) {
      const embedding = await generateEmbedding(article);
      if (embedding) {
        article.embedding = embedding;
        updated = true;
      }
    }

    if (updated) {
      await saveArticles([article]);
      processedCount++;
    }
  }
  console.log(`Processed metadata for ${processedCount} articles.`);
}

async function generateTags(article: Article): Promise<string[]> {
  if (!vertex_ai) return [];
  try {
    const model = vertex_ai.preview.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });
    
    const prompt = `Analyze this article snippet and title. Generate 3-4 relevant technical tags (e.g., "LLM", "Computer Vision", "Reinforcement Learning"). Return a JSON array of strings.
    
    Title: ${article.title}
    Snippet: ${article.snippet}`;

    const result = await model.generateContent(prompt);
    const text = result.response.candidates?.[0].content.parts[0].text;
    if (text) {
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanText);
    }
  } catch (e) {
    console.error('Error generating tags:', e);
  }
  return [];
}

async function generateEmbedding(article: Article): Promise<number[] | null> {
  if (!project) return null;
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    const token = accessToken.token;

    if (!token) throw new Error('Failed to get access token');

    const response = await fetch(
      `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/text-embedding-004:predict`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instances: [{ content: `${article.title} ${article.snippet}` }]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Vertex AI API failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.predictions[0].embeddings.values;
  } catch (e) {
    console.error('Error generating embedding:', e);
    return null;
  }
}
