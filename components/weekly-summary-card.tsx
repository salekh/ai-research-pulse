'use client';

import { useState, useRef, useEffect } from 'react';
import { Article } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Loader2, Sparkles, Volume2, SkipBack, SkipForward } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface WeeklySummaryCardProps {
  weekStart: string;
  weekEnd: string;
  articles: Article[];
}

export function WeeklySummaryCard({ weekStart, weekEnd, articles }: WeeklySummaryCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlay = async () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    if (audioUrl) {
      audioRef.current?.play();
      setIsPlaying(true);
      return;
    }

    // Generate audio if not available
    setIsLoading(true);
    try {
      const now = new Date();
      const start = new Date(weekStart);
      const diffTime = Math.abs(now.getTime() - start.getTime());
      const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7)); 
      
      const res = await fetch(`/api/insights?action=generate_audio&offset=${diffWeeks}`);
      const data = await res.json();

      if (data.audioUrl) {
        setAudioUrl(data.audioUrl);
        // Need to wait for state update or use temp var
        setTimeout(() => {
            if (audioRef.current) {
                audioRef.current.src = data.audioUrl;
                audioRef.current.play();
                setIsPlaying(true);
            }
        }, 100);
      }
    } catch (error) {
      console.error('Failed to generate audio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto mb-8 overflow-hidden border-border/50 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300">
      <CardHeader className="pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">Weekly Insights</span>
              <Sparkles className="w-5 h-5 text-blue-400" />
            </CardTitle>
            <p className="text-sm text-muted-foreground font-medium">
              {(() => {
                try {
                  return `${format(new Date(weekStart), 'MMM d')} - ${format(new Date(weekEnd), 'MMM d, yyyy')}`;
                } catch (e) {
                  return 'Date unavailable';
                }
              })()}
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
            <Volume2 className="w-5 h-5 text-blue-600" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-8">
          {/* Audio Player Section */}
          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 shadow-inner">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-900">
                    {isLoading ? 'Generating AI Overview...' : 'Weekly AI Roundup'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Narrated by Gemini
                  </span>
                </div>
                {isPlaying && (
                  <div className="flex gap-1 items-end h-4">
                    <span className="w-1 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-4 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-3 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 justify-center">
                <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600" disabled>
                  <SkipBack className="w-5 h-5" />
                </Button>
                
                <Button
                  size="icon"
                  className={cn(
                    "h-14 w-14 rounded-full shadow-lg hover:scale-105 transition-all duration-300",
                    isPlaying ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-900 hover:bg-gray-800"
                  )}
                  onClick={handlePlay}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  ) : isPlaying ? (
                    <Pause className="h-6 w-6 text-white" />
                  ) : (
                    <Play className="h-6 w-6 ml-1 text-white" />
                  )}
                </Button>

                <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600" disabled>
                  <SkipForward className="w-5 h-5" />
                </Button>
              </div>

              <div className="space-y-2 mt-2">
                <Slider
                  value={[currentTime]}
                  max={duration || 100}
                  step={1}
                  onValueChange={handleSeek}
                  className="cursor-pointer"
                  disabled={!audioUrl || isLoading}
                />
                <div className="flex justify-between text-xs text-muted-foreground font-medium">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          </div>

          <audio
            ref={audioRef}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />

          {/* Articles List */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Key Developments
            </h3>
            <div className="grid gap-3">
              {articles.slice(0, 5).map((article) => (
                <a
                  key={article.link}
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all border border-transparent hover:border-gray-100"
                >
                  <div className="mt-1 min-w-[4px] h-4 rounded-full bg-gray-200 group-hover:bg-blue-400 transition-colors" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                      {article.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1.5 flex items-center gap-2">
                      <span className="font-medium text-gray-700">
                        {article.source}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-gray-300" />
                      <span>{(() => {
                        try {
                          return format(new Date(article.date), 'MMM d');
                        } catch (e) {
                          return '';
                        }
                      })()}</span>
                    </div>
                  </div>
                </a>
              ))}
              {articles.length > 5 && (
                <div className="text-center">
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary">
                    View {articles.length - 5} more stories
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
