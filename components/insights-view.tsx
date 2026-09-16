'use client';

import { useState, useEffect, useRef } from 'react';
import { ArticleSelector } from '@/components/article-selector';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TranscriptViewer } from '@/components/transcript-viewer';
import {
  Play,
  Pause,
  Loader2,
  Radio,
  Headphones,
  Volume2,
  Mic,
  Sparkles,
  ChevronRight,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function WaveformVisualizer({
  isPlaying,
  className,
}: {
  isPlaying: boolean;
  className?: string;
}) {
  const bars = 36;
  return (
    <div className={cn('flex items-end justify-center gap-[3px] h-12', className)}>
      {Array.from({ length: bars }).map((_, i) => {
        const baseHeight = Math.sin((i / bars) * Math.PI) * 100;
        const height = Math.max(12, baseHeight * (0.45 + ((i * 7) % 10) * 0.05));
        return (
          <div
            key={i}
            className={cn(
              'w-[3px] rounded-full transition-all duration-300',
              isPlaying ? 'bg-[#4471ED] animate-pulse' : 'bg-[#DADCE0]'
            )}
            style={{
              height: `${isPlaying ? height : height * 0.35}%`,
              animationDelay: `${i * 45}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

function AudioPlayerCard({
  title,
  subtitle,
  audioSrc,
  transcript,
  icon: Icon,
  accentColor,
}: {
  title: string;
  subtitle: string;
  audioSrc: string;
  transcript?: string;
  icon: any;
  accentColor: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<{
    transcript: string;
    modelUsed: string;
    diarizedSegments?: Array<{ speaker: string; text: string; timestamp?: string }>;
  } | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTranscribe = async () => {
    setIsTranscribing(true);
    try {
      const res = await fetch('/api/insights/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: audioSrc, mimeType: 'audio/wav' }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiveTranscript(data);
      }
    } catch (e) {
      console.error('Transcription error:', e);
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-xs hover:border-[#4471ED] transition-all duration-300">
      <div className="h-1 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-6">
        <div className="flex items-start gap-4">
          <div
            className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm"
            style={{ backgroundColor: accentColor }}
          >
            <Icon className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-[#202124] font-display">{title}</h3>
            <p className="text-xs text-[#5F6368] mt-0.5">{subtitle}</p>
          </div>

          <button
            onClick={togglePlay}
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer',
              isPlaying
                ? 'bg-[#202124] text-white shadow-md scale-105'
                : 'bg-[#F8F9FA] border border-[#DADCE0] text-[#202124] hover:border-[#4471ED]'
            )}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>
        </div>

        <div className="mt-4">
          <WaveformVisualizer isPlaying={isPlaying} />
        </div>

        <div className="mt-3">
          <div
            className="relative h-1.5 bg-[#F1F3F4] rounded-full overflow-hidden cursor-pointer"
            onClick={(e) => {
              if (!audioRef.current || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              audioRef.current.currentTime = pct * duration;
            }}
          >
            <div
              className="absolute h-full rounded-full transition-all duration-200"
              style={{ width: `${progress}%`, backgroundColor: accentColor }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#5F6368] mt-1 font-mono tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-[#DADCE0]/60 flex flex-wrap items-center justify-between gap-2">
          {transcript && <TranscriptViewer transcript={transcript} title="Read Full Script" />}
          <button
            onClick={handleTranscribe}
            disabled={isTranscribing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono text-[#4471ED] bg-[#E8F0FE] hover:bg-[#D2E3FC] transition-colors cursor-pointer disabled:opacity-50"
          >
            {isTranscribing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            <span>{isTranscribing ? 'Transcribing…' : 'Multimodal Transcribe (3.8 Flash)'}</span>
          </button>
        </div>

        {liveTranscript && (
          <div className="mt-3 p-3 rounded-lg bg-[#F8F9FA] border border-[#DADCE0] text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase text-[#137333] bg-[#E6F4EA] px-2 py-0.5 rounded font-semibold">
                Diarized via {liveTranscript.modelUsed}
              </span>
            </div>
            {liveTranscript.diarizedSegments && liveTranscript.diarizedSegments.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {liveTranscript.diarizedSegments.map((seg, idx) => (
                  <div key={idx} className="text-[#3C4043] leading-relaxed">
                    <span className="font-bold text-[#202124]">{seg.speaker}: </span>
                    <span>{seg.text}</span>
                    {seg.timestamp && (
                      <span className="ml-1.5 font-mono text-[10px] text-[#5F6368]">
                        [{seg.timestamp}]
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[#3C4043] whitespace-pre-wrap max-h-48 overflow-y-auto">
                {liveTranscript.transcript}
              </p>
            )}
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
        onEnded={() => setIsPlaying(false)}
      />
    </div>
  );
}

function GenerationProgress({
  step,
}: {
  step: 'selecting' | 'transcript' | 'audio' | 'done';
}) {
  const steps = [
    { key: 'transcript', label: 'Drafting Script (gemini-3.8-flash)', icon: Mic },
    { key: 'audio', label: 'Synthesizing Audio (Gemini TTS)', icon: Volume2 },
    { key: 'done', label: 'Complete', icon: Sparkles },
  ];

  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-6">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const isActive = s.key === step;
        const isDone = i < currentIdx;

        return (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium',
                isActive && 'bg-[#E8F0FE] text-[#4471ED] border border-[#4471ED]/30',
                isDone && 'bg-[#E6F4EA] text-[#137333]',
                !isActive && !isDone && 'bg-[#F8F9FA] text-[#5F6368]'
              )}
            >
              {isActive && <Loader2 className="w-3 h-3 animate-spin" />}
              {isDone && <span>✓</span>}
              {!isActive && !isDone && <Icon className="w-3 h-3" />}
              <span>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="w-3 h-3 text-[#DADCE0]" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function InsightsView() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStep, setGenStep] = useState<'selecting' | 'transcript' | 'audio' | 'done'>(
    'selecting'
  );
  const [error, setError] = useState<string | null>(null);
  const [defaultInsights, setDefaultInsights] = useState<{
    overview?: { audio: string; transcript: string };
    podcast?: { audio: string; transcript: string };
  }>({});

  useEffect(() => {
    const loadDefaults = async () => {
      const insights: any = {};
      // Try bundled local assets first (fast & offline-ready), then GCS
      try {
        const localOverview = await fetch('/insights/current-week/overview-transcript.json');
        if (localOverview.ok) {
          const data = await localOverview.json();
          insights.overview = {
            audio: '/insights/current-week/overview.wav',
            transcript: data.transcript,
          };
        }
      } catch {}

      try {
        const localPodcast = await fetch('/insights/current-week/podcast-transcript.json');
        if (localPodcast.ok) {
          const data = await localPodcast.json();
          insights.podcast = {
            audio: '/insights/current-week/podcast.wav',
            transcript: data.transcript,
          };
        }
      } catch {}

      setDefaultInsights(insights);
    };
    loadDefaults();
  }, []);

  const handleGenerate = async (
    selectedArticles: any[],
    type: 'overview' | 'podcast'
  ) => {
    setIsGenerating(true);
    setError(null);
    setAudioUrl(null);
    setGenStep('transcript');

    try {
      const timer = setTimeout(() => setGenStep('audio'), 6000);

      const res = await fetch('/api/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: selectedArticles, type }),
      });

      clearTimeout(timer);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate audio');
      }

      setGenStep('done');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsGenerating(false);
      setGenStep('selecting');
    }
  };

  const hasDefaults = defaultInsights.overview || defaultInsights.podcast;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* FDE Dark Canvas Hero Header */}
      <div
        className="relative overflow-hidden rounded-2xl bg-[#202124] text-white p-8 border border-[#3c4043]"
        style={{
          backgroundImage: `url('/brand/bg_dark_aurora.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-1.5 fde-gradient-divider" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#4471ED]/20 border border-[#4471ED]/40 text-[#8ab4f8] text-xs font-mono uppercase">
              <Headphones className="w-3.5 h-3.5" />
              <span>Multi-Speaker Audio Synthesis · Gemini TTS</span>
            </div>
            <h2 className="text-2xl font-bold font-display">
              Research Pulse Audio Briefings &amp; Podcasts
            </h2>
            <p className="text-sm text-[#BABBBC] max-w-2xl">
              Listen to this week&apos;s executive AI research briefing or a deep-dive technical
              podcast featuring hosts Dr. Anya &amp; Liam, scripted by Gemini 3.8 Flash.
            </p>
          </div>
        </div>
      </div>

      {/* Pre-generated Weekly Episodes */}
      {hasDefaults && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Radio className="w-4 h-4 text-[#4471ED]" />
            <h3 className="text-xs font-bold text-[#5F6368] uppercase tracking-wider font-display">
              Featured Weekly Episodes (Bundled)
            </h3>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {defaultInsights.overview && (
              <AudioPlayerCard
                title="Executive Commuter Briefing"
                subtitle="3-minute dense synthesis of frontier breakthroughs"
                audioSrc={defaultInsights.overview.audio}
                transcript={defaultInsights.overview.transcript}
                icon={Volume2}
                accentColor="#4471ED"
              />
            )}
            {defaultInsights.podcast && (
              <AudioPlayerCard
                title="Research Pulse Deep-Dive Podcast"
                subtitle="Multi-speaker technical discussion with Dr. Anya & Liam"
                audioSrc={defaultInsights.podcast.audio}
                transcript={defaultInsights.podcast.transcript}
                icon={Mic}
                accentColor="#34A853"
              />
            )}
          </div>
        </div>
      )}

      {/* Custom Insight Generator */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Cpu className="w-4 h-4 text-[#4471ED]" />
          <h3 className="text-xs font-bold text-[#5F6368] uppercase tracking-wider font-display">
            Synthesize Custom Audio Briefing
          </h3>
        </div>

        <div className="grid gap-6 md:grid-cols-5">
          <Card className="border-[#DADCE0] bg-white shadow-xs md:col-span-3">
            <CardContent className="pt-6">
              <ArticleSelector onGenerate={handleGenerate} isGenerating={isGenerating} />
            </CardContent>
          </Card>

          <div className="md:col-span-2 space-y-4">
            {error && (
              <Alert variant="destructive" className="border-[#EA4335]/40 bg-[#FCE8E6]">
                <AlertTitle className="text-xs font-bold text-[#C5221F]">
                  Synthesis Warning
                </AlertTitle>
                <AlertDescription className="text-xs text-[#C5221F]">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {isGenerating && (
              <Card className="border-[#DADCE0] bg-white shadow-xs">
                <CardContent className="py-8 text-center">
                  <Loader2 className="w-8 h-8 text-[#4471ED] animate-spin mx-auto mb-3" />
                  <p className="text-sm font-bold text-[#202124] font-display">
                    {genStep === 'transcript'
                      ? 'Drafting script with Gemini 3.8 Flash…'
                      : 'Synthesizing multi-speaker audio…'}
                  </p>
                  <GenerationProgress step={genStep} />
                </CardContent>
              </Card>
            )}

            {audioUrl && !isGenerating && (
              <Card className="border-[#DADCE0] bg-white shadow-xs overflow-hidden">
                <div className="h-1 bg-[#34A853]" />
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-[#E6F4EA] flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-[#137333]" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#202124] font-display">
                        Custom Audio Ready
                      </h4>
                      <p className="text-[10px] font-mono text-[#5F6368] uppercase">
                        Synthesized via Gemini TTS
                      </p>
                    </div>
                  </div>
                  <audio controls className="w-full" src={audioUrl} autoPlay />
                </CardContent>
              </Card>
            )}

            {!audioUrl && !isGenerating && !error && (
              <Card className="border-dashed border-[#DADCE0] bg-white/60">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Headphones className="w-8 h-8 text-[#5F6368] mb-3 opacity-60" />
                  <p className="text-xs text-[#5F6368] max-w-[220px] leading-relaxed">
                    Select publications on the left to generate a bespoke audio briefing or
                    two-host podcast.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
