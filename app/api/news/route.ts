import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { saveArticles, getArticles, Article } from '@/lib/db';

export const dynamic = 'force-dynamic';

const parser = new Parser();

async function fetchRSS(url: string, source: Article['source']): Promise<Article[]> {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.map((item) => ({
      title: item.title || 'No title',
      link: item.link || '',
      date: item.pubDate || item.isoDate || new Date().toISOString(),
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

    // Strategy: Look for article rows/cards. 
    // The image suggests a list layout: Date | Category | Title
    // We'll look for containers that have a time element and a link.
    
    // Common container selectors for lists
    const potentialRows = $('div, article, li').filter((_, el) => {
      return $(el).find('time').length > 0 && $(el).find('a[href^="/"]').length > 0;
    });

    potentialRows.each((_, element) => {
       const container = $(element);
       
       // 1. Find the Link and Title
       // The title is usually the main link or a heading inside the link
       let linkEl = container.find('a[href^="/news/"], a[href^="/research/"], a[href^="/engineering/"], a[href^="/product/"]').first();
       
       // If specific link not found, try any local link that isn't a tag/category
       if (linkEl.length === 0) {
         linkEl = container.find('a[href^="/"]').filter((_, el) => {
           const href = $(el).attr('href') || '';
           // Exclude common non-article links
           return !['/news', '/research', '/engineering', '/company', '/careers'].includes(href);
         }).first();
       }

       if (linkEl.length === 0) return;

       const link = linkEl.attr('href');
       if (!link) return;

       // Title extraction:
       // - Try heading tags first
       let title = container.find('h3, h2, h4').first().text().trim();
       // - If no heading, use the link text, but ensure it's not a "Read more" button
       if (!title) {
         const linkText = linkEl.text().trim();
         if (linkText.length > 15) { // Threshold to avoid "Read more" or "Category"
           title = linkText;
         }
       }
       
       // 2. Find the Date
       const dateText = container.find('time').text().trim();

       // 3. Find the Category / Snippet
       // The category is often a sibling text or a separate link/span
       // We'll gather all text in the container, remove the title and date, and what's left is likely the category/snippet.
       let fullText = container.text().trim();
       // Remove title and date from full text to isolate category/snippet
       if (title) fullText = fullText.replace(title, '');
       if (dateText) fullText = fullText.replace(dateText, '');
       
       // Clean up whitespace
       let snippet = fullText.replace(/\s\s+/g, ' ').trim();
       
       // If the snippet is very short (likely just the category like "Societal Impacts"), prefix it
       if (snippet.length > 0 && snippet.length < 30) {
         snippet = `Category: ${snippet}`;
       } else if (snippet.length === 0) {
         snippet = `Latest update from Anthropic ${category}`;
       }

       if (title && link && dateText) {
         articles.push({
           title,
           link: link.startsWith('http') ? link : `https://www.anthropic.com${link}`,
           date: dateText ? new Date(dateText).toISOString() : new Date().toISOString(),
           source: 'Anthropic',
           snippet: snippet,
         });
       }
    });

    // Deduplicate by link
    const uniqueArticles = Array.from(new Map(articles.map(item => [item.link, item])).values());
    return uniqueArticles.slice(0, 10);
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

export async function GET() {
  // 1. Fetch all feeds in parallel
  const [
    googleResearch,
    deepmindBlog,
    openAI,
    anthropicEng,
    anthropicRes,
    microsoft,
    meta
  ] = await Promise.all([
    fetchRSS('https://research.google/blog/rss/', 'Google Research'),
    fetchRSS('https://blog.google/technology/google-deepmind/rss/', 'Google DeepMind'),
    fetchRSS('https://openai.com/news/rss.xml', 'OpenAI'),
    scrapeAnthropic('https://www.anthropic.com/engineering', 'Engineering'),
    scrapeAnthropic('https://www.anthropic.com/research', 'Research'),
    fetchRSS('https://www.microsoft.com/en-us/research/feed/', 'Microsoft Research'),
    scrapeMeta(),
  ]);

  // 2. Combine new articles
  const newArticles = [
    ...googleResearch,
    ...deepmindBlog,
    ...openAI,
    ...anthropicEng,
    ...anthropicRes,
    ...microsoft,
    ...meta
  ];

  // 3. Save to DB (ignore duplicates)
  if (newArticles.length > 0) {
    try {
      saveArticles(newArticles);
    } catch (e) {
      console.error('Failed to save articles to DB:', e);
    }
  }

  // 4. Retrieve all articles from DB (sorted by date)
  let allArticles: Article[] = [];
  try {
    allArticles = getArticles(200); // Get top 200
  } catch (e) {
    console.error('Failed to get articles from DB:', e);
    // Fallback to just the new ones if DB fails
    allArticles = newArticles;
    allArticles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  return NextResponse.json({ articles: allArticles });
}
