import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { saveArticles, getArticles, getAllArticlesForSearch, Article } from '@/lib/db';
import { VertexAI } from '@google-cloud/vertexai';
import { cosineSimilarity } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const parser = new Parser();

// Initialize Vertex AI
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
console.log('Initializing Vertex AI with project:', project, 'location:', location);
const vertex_ai = project ? new VertexAI({ project, location }) : null;
if (!vertex_ai) console.warn('Vertex AI not initialized: Missing project ID');

import { GoogleAuth } from 'google-auth-library';

// ... existing code ...

async function getEmbeddings(texts: string[]) {
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    const token = accessToken.token;

    if (!token) throw new Error('Failed to get access token');

    const results = await Promise.all(texts.map(async (text) => {
      const response = await fetch(
        `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/text-embedding-004:predict`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            instances: [{ content: text }]
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Vertex AI REST Error:', errorText);
        throw new Error(`Vertex AI API failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.predictions[0].embeddings.values;
    }));

    return results;
  } catch (e) {
    console.error('Error generating embeddings:', e);
    return [];
  }
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
      // Clean up markdown code blocks if present
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanText);
    }
  } catch (e) {
    console.error('Error generating tags:', e);
  }
  return [];
}

async function fetchRSS(url: string, source: Article['source']): Promise<Article[]> {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.map((item) => ({
      title: item.title || 'No title',
      link: item.link || '',
      date: item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()),
      source,
      snippet: item.contentSnippet || item.content || '',
    }));
  } catch (error) {
    console.error(`Error fetching RSS from ${source}:`, error);
    return [];
  }
}

async function scrapeAnthropic(url: string, category: string): Promise<Article[]> {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    const articles: Article[] = [];

    // Anthropic's new design seems to wrap the whole card in an anchor tag.
    // We look for any anchor that points to a detailed page.
    const potentialLinks = $('a');

    console.log(`[Anthropic] Found ${potentialLinks.length} total links on ${url}`);

    potentialLinks.each((_, element) => {
       const linkEl = $(element);
       const href = linkEl.attr('href');
       
       if (!href) return;

       // Check for relevant paths, allowing absolute URLs too
       const isRelevant = href.includes('/news/') || href.includes('/research/') || href.includes('/engineering/') || href.includes('/product/');
       if (!isRelevant) return;

       // Filter out index pages or non-article links
       if (href === '/research' || href === '/news' || href === '/engineering' || href.includes('/archive')) return;
       if (href.endsWith('/research') || href.endsWith('/news') || href.endsWith('/engineering')) return;

       // Check if we already have this link (deduplication within the same page scrape)
       const fullLink = href.startsWith('http') ? href : `https://www.anthropic.com${href}`;
       if (articles.some(a => a.link === fullLink)) return;

       const container = linkEl;
       
       // Helper to get text with spaces
       // Iterate over child nodes to handle mashed text
       let fullText = '';
       container.contents().each((_, node) => {
         if (node.type === 'text') {
           fullText += $(node).text().trim() + ' ';
         } else if (node.type === 'tag') {
           fullText += $(node).text().trim() + ' ';
         }
       });
       fullText = fullText.replace(/\s+/g, ' ').trim();
       
       const dateRegex = /([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/;
       const dateMatch = fullText.match(dateRegex);
       let date = dateMatch ? new Date(dateMatch[0]).toISOString() : new Date().toISOString();
       
       let title = container.find('h3, h2, h4').first().text().trim();
       
       if (!title) {
         let remainingText = fullText;
         if (dateMatch) {
           remainingText = remainingText.replace(dateMatch[0], '').trim();
         }
         
         const pText = container.find('p').text().trim();
         if (pText) {
            remainingText = remainingText.replace(pText, '').trim();
            title = remainingText;
         } else {
            title = remainingText;
         }
       }
       
       const categories = ['Interpretability', 'Alignment', 'Societal Impacts', 'Product', 'Policy', 'Economic Research', 'Security', 'Engineering'];
       for (const cat of categories) {
         if (title.startsWith(cat) && title.length > cat.length) {
           title = title.substring(cat.length).trim();
         }
       }

       let snippet = container.find('p').text().trim();
       if (!snippet) {
         snippet = `Latest update from Anthropic ${category}`;
       }

       if (title && href) {
         articles.push({
           title,
           link: fullLink,
           date,
           source: 'Anthropic',
           snippet,
         });
       }
    });

    console.log(`[Anthropic] Scraped ${articles.length} valid articles from ${url}`);
    if (articles.length > 0) {
      console.log(`[Anthropic] Example: ${articles[0].title} (${articles[0].link}) Date: ${articles[0].date}`);
    }

    return articles.slice(0, 10);
  } catch (error) {
    console.error(`Error scraping Anthropic ${category}:`, error);
    return [];
  }
}

async function scrapeMeta(): Promise<Article[]> {
  try {
    const feedUrls = [
      'https://ai.meta.com/blog/rss.xml',
      'https://ai.meta.com/blog/rss/',
      'https://research.facebook.com/feed/'
    ];

    for (const url of feedUrls) {
      try {
        const feed = await parser.parseURL(url);
        if (feed.items && feed.items.length > 0) {
          return feed.items.map(item => ({
            title: item.title || 'No title',
            link: item.link || '',
            date: item.pubDate || item.isoDate || new Date().toISOString(),
            source: 'Meta AI',
            snippet: item.contentSnippet || item.content || 'Latest from Meta AI.',
          }));
        }
      } catch (e) {
        // Continue
      }
    }
    return [];
  } catch (error) {
    console.error('Error fetching Meta AI:', error);
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const refresh = searchParams.get('refresh') === 'true';

  try {
    // If refresh is requested, scrape new articles
    if (refresh) {
      console.log('Refreshing articles...');
      const allArticles = await Promise.all([
        fetchRSS('https://research.google/blog/rss/', 'Google Research'),
        fetchRSS('https://blog.google/technology/google-deepmind/rss/', 'Google DeepMind'),
        fetchRSS('https://openai.com/news/rss.xml', 'OpenAI'),
        scrapeAnthropic('https://www.anthropic.com/engineering', 'Engineering'),
        scrapeAnthropic('https://www.anthropic.com/research', 'Research'),
        fetchRSS('https://www.microsoft.com/en-us/research/feed/', 'Microsoft Research'),
        scrapeMeta(),
      ]);

      const flatArticles = allArticles.flat();
      
      // Process articles (tags, embeddings) in background if possible, 
      // but for now we'll just save them to ensure they are in DB.
      // In a real serverless env, we might need a queue. 
      // Here we await to ensure data is ready for the next fetch or immediate return if we wanted.
      // But to keep it fast, we might want to just save and return.
      // However, the user wants "load DB articles already", so the *first* call shouldn't refresh.
      
      await saveArticles(flatArticles);
      
      // Process missing tags/embeddings after saving
      // This might take time, so maybe we don't await it fully if we want to be fast?
      // But 'refresh' implies we want new data.
      // Let's do it:
      const saved = getArticles();
      for (const article of saved) {
        if (!article.tags || article.tags.length === 0 || !article.embedding) {
           // We can process in background or just process a few.
           // For now, let's just process to ensure quality.
           // Or better: The refresh call is the "background" call from frontend.
           if (!article.tags || article.tags.length === 0) {
             const tags = await generateTags(article);
             if (tags.length > 0) {
               saveArticles([{ ...article, tags: tags }]);
             }
           }
           if (!article.embedding) {
             const embedding = await getEmbeddings([`${article.title} ${article.snippet}`]);
             if (embedding.length > 0) {
               saveArticles([{ ...article, embedding: embedding[0] }]);
             }
           }
        }
      }
    }

    // Always return articles from DB
    let articles: Article[] = [];
    if (query) {
      // ... existing search logic ...
      // We need to implement search here or reuse existing logic
      // The original code had search logic inside GET.
      // Let's reuse it.
      const embedding = await getEmbeddings([query]);
      if (embedding.length > 0) {
        const all = getAllArticlesForSearch();
        const withScores = all.map(article => {
          let score = 0;
          if (article.embedding) {
            const articleEmbedding = article.embedding;
            score = cosineSimilarity(embedding[0], articleEmbedding);
          }
          // Boost for keyword matches
          const lowerQuery = query.toLowerCase();
          if (article.title.toLowerCase().includes(lowerQuery)) score += 0.3;
          if (article.snippet.toLowerCase().includes(lowerQuery)) score += 0.1;
          return { ...article, score };
        });
        
        articles = withScores
          .filter(a => a.score > 0.4) // Threshold
          .sort((a, b) => b.score - a.score)
          .slice(0, 20);
      }
    } else {
      articles = getArticles();
    }

    // Explicitly sort by date (latest first)
    articles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ articles });
  } catch (e) {
    console.error('Error in GET /api/news:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
