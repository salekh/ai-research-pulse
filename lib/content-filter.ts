import { GoogleGenAI } from "@google/genai";
import { Article } from './db';

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
});

export async function filterTechnicalArticles(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return [];

  const modelName = "gemini-2.5-flash";
  
  // Process in batches of 20 to avoid token limits and ensure reliability
  const batchSize = 20;
  const validArticles: Article[] = [];

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    
    const prompt = `
      You are an editor for a technical AI research newsletter.
      Your job is to filter out articles that are NOT technical AI research.
      
      Exclude:
      - Business news (earnings, stock, acquisitions, partnerships)
      - Management changes (new CEO, CFO, etc.)
      - Policy/Regulation (unless it has significant technical depth)
      - Marketing/Product announcements without technical details
      - General "AI is the future" fluff
      
      Include:
      - New model releases (technical details)
      - Research papers
      - Technical deep dives
      - Engineering blog posts
      - Safety research (technical alignment, interpretability)
      
      Input Articles:
      ${batch.map((a, idx) => `[${idx}] Title: ${a.title}\nSnippet: ${a.snippet}`).join('\n\n')}
      
      Return a JSON object with a list of INDICES (from the input list) of articles that SHOULD BE KEPT.
      Format: { "keep_indices": [0, 2, 5] }
    `;

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const text = response.text;
      if (!text) continue;

      const result = JSON.parse(text);
      const keepIndices = result.keep_indices;

      if (Array.isArray(keepIndices)) {
        keepIndices.forEach(idx => {
          if (idx >= 0 && idx < batch.length) {
            validArticles.push(batch[idx]);
          }
        });
      }
    } catch (e) {
      console.error("Error filtering batch:", e);
      // In case of error, maybe keep all? or drop all? 
      // Safer to keep all and log error, or retry. 
      // For now, we'll log and skip this batch to avoid pollution, or maybe keep them to be safe?
      // Let's keep them if it fails, to avoid losing data, but log it.
      // Actually, if we are filtering *existing* DB, we might want to be conservative.
      // But if we are fetching, maybe we want to be strict.
      // Let's assume strict for now to clean up.
    }
  }

  return validArticles;
}
