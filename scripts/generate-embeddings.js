const Database = require('better-sqlite3');
const path = require('path');
const { VertexAI } = require('@google-cloud/vertexai');
const { GoogleAuth } = require('google-auth-library');

const dbPath = path.join(process.cwd(), 'data', 'news.db');
const db = new Database(dbPath);

const project = process.env.GOOGLE_CLOUD_PROJECT || 'sa-learning-1';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

console.log(`Initializing with project: ${project}, location: ${location}`);

async function getEmbeddings(texts) {
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    const token = accessToken.token;

    if (!token) throw new Error('Failed to get access token');

    const results = await Promise.all(texts.map(async (text) => {
      // Truncate text if too long (Vertex AI limit is usually 2048 tokens or similar, roughly 8000 chars safe bet)
      const truncatedText = text.slice(0, 8000);
      
      const response = await fetch(
        `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/text-embedding-004:predict`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            instances: [{ content: truncatedText }]
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

async function main() {
  const articles = db.prepare('SELECT * FROM articles WHERE embedding IS NULL').all();
  console.log(`Found ${articles.length} articles missing embeddings.`);

  if (articles.length === 0) {
    console.log('No articles to process.');
    return;
  }

  const updateStmt = db.prepare('UPDATE articles SET embedding = ? WHERE link = ?');

  // Process in batches to avoid rate limits
  const BATCH_SIZE = 5;
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${i / BATCH_SIZE + 1} / ${Math.ceil(articles.length / BATCH_SIZE)}...`);

    const promises = batch.map(async (article) => {
      const text = `${article.title} ${article.snippet || ''}`;
      try {
        const embeddings = await getEmbeddings([text]);
        if (embeddings.length > 0) {
          return { link: article.link, embedding: JSON.stringify(embeddings[0]) };
        }
      } catch (e) {
        console.error(`Failed to generate embedding for ${article.title}:`, e.message);
      }
      return null;
    });

    const results = await Promise.all(promises);

    const transaction = db.transaction((updates) => {
      for (const update of updates) {
        if (update) {
          updateStmt.run(update.embedding, update.link);
        }
      }
    });

    transaction(results);
    
    // Small delay to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('Done generating embeddings.');
}

main().catch(console.error);
