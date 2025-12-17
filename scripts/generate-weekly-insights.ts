import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { subWeeks } from 'date-fns';

async function main() {
  // Dynamic import to ensure env vars are loaded first
  const { getArticlesByDateRange } = await import('../lib/db');
  const { generateTranscript, synthesizeAudio } = await import('../lib/audio-generator');

  console.log('Generating weekly insights...');
  
  const endDate = new Date();
  const startDate = subWeeks(endDate, 2);
  
  console.log(`Fetching articles from ${startDate.toISOString()} to ${endDate.toISOString()}...`);
  const articles = await getArticlesByDateRange(startDate, endDate);
  console.log(`Found ${articles.length} articles.`);
  
  if (articles.length === 0) {
    console.log('No articles found.');
    return;
  }
  
  console.log(`Found ${articles.length} articles.`);
  
  const outputDir = path.join(process.cwd(), 'public', 'insights', 'current-week');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Initialize Storage
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  const bucketName = 'ai-research-pulse-assets';
  const bucket = storage.bucket(bucketName);

  async function uploadToGCS(filePath: string, destination: string, contentType: string) {
    try {
      await bucket.upload(filePath, {
        destination,
        metadata: {
          contentType,
          cacheControl: 'public, max-age=3600',
        },
      });
      console.log(`Uploaded ${filePath} to gs://${bucketName}/${destination}`);
    } catch (e) {
      console.error(`Failed to upload ${filePath}:`, e);
    }
  }

  // Generate Overview
  console.log('Generating Audio Overview...');
  try {
    const overviewTranscript = await generateTranscript(articles, 'overview');
    const overviewTranscriptPath = path.join(outputDir, 'overview-transcript.json');
    fs.writeFileSync(overviewTranscriptPath, JSON.stringify({ transcript: overviewTranscript }, null, 2));
    await uploadToGCS(overviewTranscriptPath, 'insights/current-week/overview-transcript.json', 'application/json');
    
    const overviewAudio = await synthesizeAudio(overviewTranscript, 'overview');
    const overviewAudioPath = path.join(outputDir, 'overview.wav');
    fs.writeFileSync(overviewAudioPath, overviewAudio);
    await uploadToGCS(overviewAudioPath, 'insights/current-week/overview.wav', 'audio/wav');
    console.log('Audio Overview generated and uploaded.');
  } catch (e) {
    console.error('Failed to generate Audio Overview:', e);
  }
  
  // Generate Podcast
  console.log('Generating Podcast...');
  try {
    const podcastTranscript = await generateTranscript(articles, 'podcast');
    const podcastTranscriptPath = path.join(outputDir, 'podcast-transcript.json');
    fs.writeFileSync(podcastTranscriptPath, JSON.stringify({ transcript: podcastTranscript }, null, 2));
    await uploadToGCS(podcastTranscriptPath, 'insights/current-week/podcast-transcript.json', 'application/json');
    
    const podcastAudio = await synthesizeAudio(podcastTranscript, 'podcast');
    const podcastAudioPath = path.join(outputDir, 'podcast.wav');
    fs.writeFileSync(podcastAudioPath, podcastAudio);
    await uploadToGCS(podcastAudioPath, 'insights/current-week/podcast.wav', 'audio/wav');
    console.log('Podcast generated and uploaded.');
  } catch (e) {
    console.error('Failed to generate Podcast:', e);
  }
  
  console.log('Done.');
  process.exit(0);
}

main().catch(console.error);
