"use client"

import { useState, useEffect, useRef } from "react"
import { ArticleSelector } from "@/components/article-selector"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TranscriptViewer } from "@/components/transcript-viewer"
import { Play, Pause, FileAudio, Info, Loader2, Radio, Headphones, Volume2, Mic, Sparkles, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Audio Waveform Visualizer (CSS-only, no canvas)
// ---------------------------------------------------------------------------
function WaveformVisualizer({ isPlaying, className }: { isPlaying: boolean; className?: string }) {
  const bars = 32;
  return (
    <div className={cn("flex items-end justify-center gap-[2px] h-12", className)}>
      {Array.from({ length: bars }).map((_, i) => {
        const baseHeight = Math.sin((i / bars) * Math.PI) * 100;
        const height = Math.max(8, baseHeight * (0.4 + Math.random() * 0.6));
        return (
          <div
            key={i}
            className={cn(
              "w-[3px] rounded-full transition-all duration-300",
              isPlaying
                ? "bg-gradient-to-t from-indigo-500 to-purple-400 animate-pulse"
                : "bg-gray-200"
            )}
            style={{
              height: `${isPlaying ? height : height * 0.3}%`,
              animationDelay: `${i * 50}ms`,
              animationDuration: `${800 + Math.random() * 400}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Premium Audio Player Card
// ---------------------------------------------------------------------------
function AudioPlayerCard({
  title,
  subtitle,
  audioSrc,
  transcript,
  icon: Icon,
  gradientFrom,
  gradientTo,
  accentColor,
}: {
  title: string;
  subtitle: string;
  audioSrc: string;
  transcript?: string;
  icon: any;
  gradientFrom: string;
  gradientTo: string;
  accentColor: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-lg transition-all duration-500">
      {/* Gradient accent bar */}
      <div className={`h-1 bg-gradient-to-r ${gradientFrom} ${gradientTo}`} />

      <div className="p-6">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${gradientFrom} ${gradientTo} flex items-center justify-center shadow-lg`}
            style={{ boxShadow: `0 8px 24px -4px ${accentColor}40` }}>
            <Icon className="w-6 h-6 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          </div>

          {/* Play button */}
          <button onClick={togglePlay}
            className={cn(
              "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
              isPlaying
                ? `bg-gradient-to-br ${gradientFrom} ${gradientTo} shadow-lg scale-110`
                : "bg-gray-100 hover:bg-gray-200"
            )}>
            {isPlaying
              ? <Pause className="w-4 h-4 text-white" />
              : <Play className="w-4 h-4 text-gray-600 ml-0.5" />
            }
          </button>
        </div>

        {/* Waveform */}
        <div className="mt-4">
          <WaveformVisualizer isPlaying={isPlaying} />
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="relative h-1 bg-gray-100 rounded-full overflow-hidden cursor-pointer"
            onClick={(e) => {
              if (!audioRef.current || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              audioRef.current.currentTime = pct * duration;
            }}>
            <div className={`absolute h-full rounded-full bg-gradient-to-r ${gradientFrom} ${gradientTo} transition-all duration-200`}
              style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1 font-medium">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Transcript */}
        {transcript && (
          <div className="mt-3">
            <TranscriptViewer transcript={transcript} title="Read Transcript" />
          </div>
        )}
      </div>

      <audio ref={audioRef} src={audioSrc}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
        onEnded={() => setIsPlaying(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generation Progress Indicator
// ---------------------------------------------------------------------------
function GenerationProgress({ step }: { step: 'selecting' | 'transcript' | 'audio' | 'done' }) {
  const steps = [
    { key: 'transcript', label: 'Generating script', icon: Mic },
    { key: 'audio', label: 'Synthesizing audio', icon: Volume2 },
    { key: 'done', label: 'Ready', icon: Sparkles },
  ];

  const currentIdx = steps.findIndex(s => s.key === step);

  return (
    <div className="flex items-center justify-center gap-2 py-8">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const isActive = s.key === step;
        const isDone = i < currentIdx;

        return (
          <div key={s.key} className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-500",
              isActive && "bg-indigo-50 text-indigo-700 shadow-sm",
              isDone && "bg-emerald-50 text-emerald-700",
              !isActive && !isDone && "bg-gray-50 text-gray-400"
            )}>
              {isActive && <Loader2 className="w-3 h-3 animate-spin" />}
              {isDone && <span className="w-3 h-3 text-emerald-500">✓</span>}
              {!isActive && !isDone && <Icon className="w-3 h-3" />}
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className={cn("w-3 h-3", isDone ? "text-emerald-300" : "text-gray-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main InsightsView
// ---------------------------------------------------------------------------
export function InsightsView() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [genStep, setGenStep] = useState<'selecting' | 'transcript' | 'audio' | 'done'>('selecting')
  const [error, setError] = useState<string | null>(null)
  const [defaultInsights, setDefaultInsights] = useState<{
    overview?: { audio: string, transcript: string },
    podcast?: { audio: string, transcript: string }
  }>({})

  useEffect(() => {
    const checkDefaults = async () => {
      try {
        const baseUrl = 'https://storage.googleapis.com/ai-research-pulse-assets/insights/current-week';
        const insights: any = {}

        const [overviewRes, podcastRes] = await Promise.all([
          fetch(`${baseUrl}/overview.wav`, { method: 'HEAD' }),
          fetch(`${baseUrl}/podcast.wav`, { method: 'HEAD' }),
        ]);

        if (overviewRes.ok) {
          try {
            const data = await (await fetch(`${baseUrl}/overview-transcript.json`)).json();
            insights.overview = { audio: `${baseUrl}/overview.wav`, transcript: data.transcript };
          } catch {}
        }
        if (podcastRes.ok) {
          try {
            const data = await (await fetch(`${baseUrl}/podcast-transcript.json`)).json();
            insights.podcast = { audio: `${baseUrl}/podcast.wav`, transcript: data.transcript };
          } catch {}
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
    setGenStep('transcript')

    try {
      // Simulate step progression (the API does both in one call)
      const timer = setTimeout(() => setGenStep('audio'), 8000);

      const res = await fetch('/api/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: selectedArticles, type })
      })

      clearTimeout(timer);

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to generate audio')
      }

      setGenStep('done')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
    } catch (e: any) {
      console.error(e)
      setError(e.message)
    } finally {
      setIsGenerating(false)
      setGenStep('selecting')
    }
  }

  const hasDefaults = defaultInsights.overview || defaultInsights.podcast;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 p-8 md:p-10">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-indigo-500 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-purple-500 rounded-full blur-[80px]" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <Headphones className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Research Pulse Audio</h2>
              <p className="text-sm text-indigo-200/80">AI-generated briefings & podcasts</p>
            </div>
          </div>
          <p className="text-sm text-indigo-100/60 max-w-lg mt-2">
            Listen to this week's AI research highlights narrated by Gemini, or create a custom briefing from articles you choose.
          </p>
        </div>
      </div>

      {/* Pre-generated Weekly Insights */}
      {hasDefaults && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Radio className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">This Week's Episodes</h3>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {defaultInsights.overview && (
              <AudioPlayerCard
                title="Weekly Audio Briefing"
                subtitle="3-min overview of top research"
                audioSrc={defaultInsights.overview.audio}
                transcript={defaultInsights.overview.transcript}
                icon={Volume2}
                gradientFrom="from-blue-500"
                gradientTo="to-cyan-500"
                accentColor="#3b82f6"
              />
            )}
            {defaultInsights.podcast && (
              <AudioPlayerCard
                title="Research Pulse Podcast"
                subtitle="Deep-dive with Dr. Anya & Liam"
                audioSrc={defaultInsights.podcast.audio}
                transcript={defaultInsights.podcast.transcript}
                icon={Mic}
                gradientFrom="from-purple-500"
                gradientTo="to-pink-500"
                accentColor="#a855f7"
              />
            )}
          </div>
        </div>
      )}

      {/* Custom Insight Generator */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Create Custom Insight</h3>
        </div>

        <div className="grid gap-6 md:grid-cols-5">
          {/* Article Selector — wider */}
          <Card className="border-gray-100 shadow-sm md:col-span-3">
            <CardContent className="pt-6">
              <ArticleSelector onGenerate={handleGenerate} isGenerating={isGenerating} />
            </CardContent>
          </Card>

          {/* Result / Status panel — narrower */}
          <div className="md:col-span-2 space-y-4">
            {error && (
              <Alert variant="destructive" className="border-red-200">
                <AlertTitle className="text-sm">Generation Failed</AlertTitle>
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            {isGenerating && (
              <Card className="border-gray-100 shadow-sm">
                <CardContent className="py-6">
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 animate-pulse shadow-lg shadow-indigo-200">
                      <Loader2 className="w-7 h-7 text-white animate-spin" />
                    </div>
                    <p className="text-sm font-medium text-gray-800">
                      {genStep === 'transcript' ? 'Writing the script…' : 'Synthesizing audio…'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">This usually takes 30–60 seconds</p>
                    <GenerationProgress step={genStep} />
                  </div>
                </CardContent>
              </Card>
            )}

            {audioUrl && !isGenerating && (
              <Card className="border-gray-100 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">Your Custom Insight</h4>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Just generated</p>
                    </div>
                  </div>
                  <audio controls className="w-full" src={audioUrl} autoPlay>
                    Your browser does not support the audio element.
                  </audio>
                </CardContent>
              </Card>
            )}

            {!audioUrl && !isGenerating && !error && (
              <Card className="border-dashed border-gray-200 bg-gray-50/50">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                    <Headphones className="w-7 h-7 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-400 max-w-[200px]">
                    Select articles and generate a custom audio briefing or podcast
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
