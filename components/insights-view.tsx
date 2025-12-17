"use client"

import { useState, useEffect } from "react"
import { ArticleSelector } from "@/components/article-selector"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TranscriptViewer } from "@/components/transcript-viewer"
import { Play, FileAudio, Info, Loader2 } from "lucide-react"

export function InsightsView() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [defaultInsights, setDefaultInsights] = useState<{
    overview?: { audio: string, transcript: string },
    podcast?: { audio: string, transcript: string }
  }>({})

  useEffect(() => {
    // Check for default insights
    const checkDefaults = async () => {
      try {
        const baseUrl = 'https://storage.googleapis.com/ai-research-pulse-assets/insights/current-week';
        const overviewUrl = `${baseUrl}/overview.wav`;
        const podcastUrl = `${baseUrl}/podcast.wav`;
        const overviewTranscriptUrl = `${baseUrl}/overview-transcript.json`;
        const podcastTranscriptUrl = `${baseUrl}/podcast-transcript.json`;

        // Use simple fetch instead of HEAD if CORS is tricky, but HEAD is better.
        // We enabled CORS, so HEAD should work.
        const overviewRes = await fetch(overviewUrl, { method: 'HEAD' })
        const podcastRes = await fetch(podcastUrl, { method: 'HEAD' })
        
        const insights: any = {}
        if (overviewRes.ok) {
          const transcriptRes = await fetch(overviewTranscriptUrl)
          if (transcriptRes.ok) {
             const data = await transcriptRes.json()
             insights.overview = { audio: overviewUrl, transcript: data.transcript }
          }
        }
        if (podcastRes.ok) {
          const transcriptRes = await fetch(podcastTranscriptUrl)
          if (transcriptRes.ok) {
             const data = await transcriptRes.json()
             insights.podcast = { audio: podcastUrl, transcript: data.transcript }
          }
        }
        setDefaultInsights(insights)
      } catch (e) {
        console.log('No default insights found', e)
      }
    }
    checkDefaults()
  }, [])

  const handleGenerate = async (selectedArticles: any[], type: 'overview' | 'podcast') => {
    setIsGenerating(true)
    setError(null)
    setAudioUrl(null)

    try {
      const res = await fetch('/api/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          articleIds: selectedArticles.map(a => a.link), 
          articles: selectedArticles, 
          type 
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to generate audio')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
    } catch (e: any) {
      console.error(e)
      setError(e.message)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="space-y-2">
        <h2 className="text-2xl font-medium text-gray-900 tracking-tight">AI Research Insights</h2>
        <p className="text-gray-600">
          Listen to this week's AI updates or create a custom insight.
        </p>
      </div>

      {/* Default Insights Section */}
      {(defaultInsights.overview || defaultInsights.podcast) && (
        <div className="grid gap-6 md:grid-cols-2">
          {defaultInsights.overview && (
            <Card className="border-gray-200 shadow-sm bg-blue-50/30">
              <CardHeader>
                <CardTitle className="text-xl font-medium text-gray-900 flex items-center gap-2">
                  <Play className="h-5 w-5 text-blue-600" />
                  Weekly Audio Overview
                </CardTitle>
                <CardDescription>A concise summary of this week's top stories.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <audio controls className="w-full" src={defaultInsights.overview.audio} />
                <TranscriptViewer transcript={defaultInsights.overview.transcript} title="Read Transcript" />
              </CardContent>
            </Card>
          )}
          
          {defaultInsights.podcast && (
            <Card className="border-gray-200 shadow-sm bg-purple-50/30">
              <CardHeader>
                <CardTitle className="text-xl font-medium text-gray-900 flex items-center gap-2">
                  <FileAudio className="h-5 w-5 text-purple-600" />
                  Weekly Podcast
                </CardTitle>
                <CardDescription>Deep dive discussion with Dr. Anya & Liam.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <audio controls className="w-full" src={defaultInsights.podcast.audio} />
                <TranscriptViewer transcript={defaultInsights.podcast.transcript} title="Read Transcript" />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-medium text-gray-900">Create Custom Insight</CardTitle>
            <CardDescription>Choose specific articles from the last 2 weeks.</CardDescription>
          </CardHeader>
          <CardContent>
            <ArticleSelector onGenerate={handleGenerate} isGenerating={isGenerating} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {audioUrl && (
            <Card className="bg-blue-50/50 border-blue-100 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl font-medium text-gray-900">Your Custom Insight</CardTitle>
                <CardDescription>Generated by Gemini 2.5 TTS</CardDescription>
              </CardHeader>
              <CardContent>
                <audio controls className="w-full" src={audioUrl} autoPlay>
                  Your browser does not support the audio element.
                </audio>
              </CardContent>
            </Card>
          )}

          {!audioUrl && !isGenerating && (
            <Card className="bg-gray-50 border-dashed border-gray-200">
              <CardContent className="flex flex-col items-center justify-center h-[300px] text-gray-500 text-center p-6">
                <Info className="h-12 w-12 mb-4 opacity-50" />
                <p>Select articles and click generate to listen to your personalized insight.</p>
              </CardContent>
            </Card>
          )}
          
          {isGenerating && (
             <Card className="bg-gray-50 border-dashed border-gray-200 animate-pulse">
              <CardContent className="flex flex-col items-center justify-center h-[300px] text-gray-500">
                <p>Generating your audio insight...</p>
                <p className="text-xs mt-2">This may take a minute.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
