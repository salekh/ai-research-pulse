'use client';

import { useEffect, useRef, useState } from 'react';
import {
  GraduationCap,
  Search,
  RefreshCw,
  X,
  ChevronDown,
  Flame,
  Clock,
  Cpu,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AcademicCard } from './academic-card';
import type { AcademicPaper } from '@/lib/db';

const ARXIV_TRACKS = [
  { id: 'cs.AI', label: 'cs.AI · Artificial Intelligence' },
  { id: 'cs.LG', label: 'cs.LG · Machine Learning' },
  { id: 'cs.CL', label: 'cs.CL · LLMs & Language' },
  { id: 'cs.CV', label: 'cs.CV · Vision & Multimodal' },
  { id: 'cs.RO', label: 'cs.RO · Robotics' },
  { id: 'stat.ML', label: 'stat.ML · Statistical ML' },
];

const TIME_RANGES: Record<string, string> = {
  '2w': 'Past 2 Weeks',
  '1m': 'Past 1 Month',
  '3m': 'Past 3 Months',
  '6m': 'Past 6 Months',
  all: 'All Indexed',
};

interface AcademicFeedProps {
  savedLinks: Set<string>;
  onSavePaper: (paper: AcademicPaper) => void;
  onAskPaper: (paper: AcademicPaper) => void;
  onOpenVisualBrief: (paper: AcademicPaper) => void;
  onCountChange?: (count: number) => void;
}

export function AcademicFeed({
  savedLinks,
  onSavePaper,
  onAskPaper,
  onOpenVisualBrief,
  onCountChange,
}: AcademicFeedProps) {
  const [papers, setPapers] = useState<AcademicPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputQuery, setInputQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('6m');
  const [sortBy, setSortBy] = useState<'latest' | 'impact'>('latest');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [meta, setMeta] = useState<{
    totalAcademicPapers?: number;
    categoryCounts?: Record<string, number>;
    summaryModel?: string;
    reasoningModel?: string;
  }>({});

  const abortRef = useRef<AbortController | null>(null);
  const reqSeqRef = useRef(0);

  // Debounced live search
  useEffect(() => {
    const trimmed = inputQuery.trim();
    if (trimmed === activeQuery) return;
    const t = setTimeout(() => setActiveQuery(trimmed), 350);
    return () => clearTimeout(t);
  }, [inputQuery, activeQuery]);

  useEffect(() => {
    setPage(1);
    fetchPapers(activeQuery, false, timeRange, 1, trackFilter, sortBy);
    return () => abortRef.current?.abort();
  }, [activeQuery, timeRange, trackFilter, sortBy]);

  const fetchPapers = async (
    query = '',
    refresh = false,
    range = timeRange,
    pageNum = 1,
    track = trackFilter,
    sort: 'latest' | 'impact' = sortBy
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++reqSeqRef.current;

    if (refresh) setRefreshing(true);
    else if (pageNum === 1) setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      if (refresh) params.append('refresh', 'true');
      if (range) params.append('timeRange', range);
      if (track) params.append('track', track);
      params.append('sort', sort);
      params.append('page', String(pageNum));
      params.append('limit', '24');

      const res = await fetch(`/api/academic?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('Failed to load academic papers');
      const data = await res.json();

      if (seq !== reqSeqRef.current) return;

      if (pageNum === 1) {
        setPapers(data.papers || []);
      } else {
        setPapers((prev) => {
          const seen = new Set(prev.map((p) => p.link));
          const uniqueNext = (data.papers || []).filter((p: AcademicPaper) => !seen.has(p.link));
          return [...prev, ...uniqueNext];
        });
      }
      setHasMore(Boolean(data.hasMore));
      if (data.meta) {
        setMeta(data.meta);
        if (typeof data.meta.totalAcademicPapers === 'number' && onCountChange) {
          onCountChange(data.meta.totalAcademicPapers);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || seq !== reqSeqRef.current) return;
      console.error(err);
      setError('Failed to load academic research papers.');
    } finally {
      if (seq === reqSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPapers(activeQuery, false, timeRange, next, trackFilter, sortBy);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputQuery.trim();
    if (trimmed !== activeQuery) setActiveQuery(trimmed);
    else fetchPapers(trimmed, false, timeRange, 1, trackFilter, sortBy);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Dark FDE Corporate Hero Banner — Strictly Isolated Academic Domain */}
      <div
        className="relative overflow-hidden rounded-2xl bg-[#202124] text-white p-6 sm:p-8 border border-[#3C4043]"
        style={{
          backgroundImage: `url('/brand/bg_dark_aurora.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-1.5 fde-gradient-divider" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#4471ED]/20 border border-[#4471ED]/40 text-[#8AB4F8] text-xs font-mono font-normal uppercase tracking-wider">
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Academic Research · arXiv 6-Month Archive</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/8 border border-white/15 text-[#E8EAED] text-xs font-mono font-normal">
                <Cpu className="w-3 h-3 text-[#8AB4F8]" />
                <span>Summaries: gemini-4-hydrogen · Q&amp;A: gemini-4-neon</span>
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display">
              AI, LLMs, Intelligence &amp; Learning Preprints
            </h2>
            <p className="text-sm text-[#BABBBC] leading-relaxed">
              Curated high-impact arXiv research from the past 6 months — isolated from frontier lab
              blogs. Indexed strictly via abstracts &amp; concise summaries with direct arXiv/PDF links
              and live Gemini 4 Neon paper Q&amp;A.
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="px-4 py-3 rounded-xl bg-[#303134]/90 border border-[#5F6368]/40 text-right">
              <div className="text-2xl font-bold text-white font-display tabular-nums">
                {(meta.totalAcademicPapers ?? papers.length).toLocaleString()}
              </div>
              <div className="text-xs text-[#BABBBC]">Papers (Last 6 Months)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pb-4 border-b border-[#DADCE0]">
        <div className="flex flex-wrap items-center gap-2">
          {/* Time Range */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="rounded-lg h-10 px-3.5 text-sm font-semibold border-[#DADCE0] bg-white text-[#202124] gap-1.5 cursor-pointer"
              >
                <span>{TIME_RANGES[timeRange]}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#5F6368]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {Object.entries(TIME_RANGES).map(([key, label]) => (
                <DropdownMenuItem key={key} onClick={() => setTimeRange(key)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* arXiv Track Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="rounded-lg h-10 px-3.5 text-sm font-semibold border-[#DADCE0] bg-white text-[#202124] gap-1.5 cursor-pointer"
              >
                <Filter className="w-3.5 h-3.5 text-[#5F6368]" />
                <span>{trackFilter || 'All arXiv Tracks'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#5F6368]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setTrackFilter(null)}>
                All arXiv Tracks
              </DropdownMenuItem>
              {ARXIV_TRACKS.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => setTrackFilter(t.id)}
                  className="justify-between gap-4"
                >
                  <span>{t.label}</span>
                  {meta.categoryCounts?.[t.id] ? (
                    <span className="text-xs font-mono font-normal text-[#5F6368] tabular-nums">
                      {meta.categoryCounts[t.id]}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort Mode Toggle (Latest vs Highest Impact) */}
          <div className="inline-flex rounded-lg border border-[#DADCE0] bg-white p-0.5 h-10">
            <button
              type="button"
              onClick={() => setSortBy('latest')}
              className={`inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                sortBy === 'latest'
                  ? 'bg-[#202124] text-white'
                  : 'text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Latest</span>
            </button>
            <button
              type="button"
              onClick={() => setSortBy('impact')}
              className={`inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                sortBy === 'impact'
                  ? 'bg-[#202124] text-white'
                  : 'text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Most Important</span>
            </button>
          </div>
        </div>

        {/* Search & Refresh */}
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center flex-1 sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5F6368] w-4 h-4 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search papers, authors, arXiv ID…"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              className="h-10 pl-10 pr-20 text-sm rounded-lg border-[#DADCE0] bg-white focus:border-[#4471ED]"
            />
            {inputQuery && (
              <button
                type="button"
                onClick={() => {
                  setInputQuery('');
                  setActiveQuery('');
                }}
                aria-label="Clear academic search"
                className="absolute right-14 top-1/2 -translate-y-1/2 p-1 text-[#5F6368] hover:text-[#202124] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-2.5 rounded-md bg-[#335CD6] hover:bg-[#274BB5] text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              Go
            </button>
          </form>

          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchPapers(activeQuery, true, timeRange, 1, trackFilter, sortBy)}
            disabled={refreshing}
            title="Sync latest arXiv papers (background)"
            className="h-10 w-10 rounded-lg border-[#DADCE0] bg-white hover:border-[#4471ED] cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-4 h-4 text-[#202124] ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Active Filter Banner */}
      {(activeQuery || trackFilter) && (
        <div className="flex items-center justify-between bg-[#E8F0FE] border border-[#4471ED]/30 rounded-lg px-4 py-2.5 text-sm">
          <div className="flex items-center gap-2 text-[#1967D2] font-medium">
            <span>
              {loading && page === 1 ? 'Searching academic papers' : 'Showing academic papers'}
              {activeQuery ? ` matching "${activeQuery}"` : ''}
              {trackFilter ? ` in ${trackFilter}` : ''}
            </span>
            {!(loading && page === 1) && (
              <span className="font-mono font-normal tabular-nums">
                ({papers.length} {papers.length === 1 ? 'paper' : 'papers'})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setInputQuery('');
              setActiveQuery('');
              setTrackFilter(null);
            }}
            className="text-xs font-semibold text-[#1967D2] hover:underline cursor-pointer"
          >
            Reset filters
          </button>
        </div>
      )}

      {error && (
        <div className="bg-[#FCE8E6] border border-[#EA4335]/30 text-[#C5221F] rounded-lg p-4 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Papers Grid */}
      {!loading && papers.length === 0 && !error ? (
        <div className="text-center py-16 bg-white border border-[#DADCE0] rounded-xl text-[#5F6368] space-y-3">
          <GraduationCap className="w-10 h-10 mx-auto opacity-30" />
          <p className="text-base font-bold text-[#202124] font-display">
            No matching academic papers found
          </p>
          <p className="text-sm max-w-md mx-auto">
            Try broadening your keywords, switching the time range, or resetting the arXiv track filter.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setInputQuery('');
              setActiveQuery('');
              setTrackFilter(null);
              setTimeRange('6m');
            }}
            className="rounded-lg px-4 py-2 text-xs font-semibold border-[#DADCE0] bg-white hover:border-[#4471ED] text-[#202124] cursor-pointer"
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {loading && page === 1
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-3 bg-white border border-[#DADCE0] rounded-xl p-5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ))
            : papers.map((paper, i) => (
                <AcademicCard
                  key={`${paper.link}-${i}`}
                  paper={paper}
                  isSaved={savedLinks.has(paper.link)}
                  onSave={onSavePaper}
                  onAskPaper={onAskPaper}
                  onOpenVisualBrief={onOpenVisualBrief}
                />
              ))}
        </div>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            className="rounded-lg px-6 py-2.5 text-xs font-bold border-[#DADCE0] bg-white hover:border-[#4471ED] text-[#202124] cursor-pointer"
          >
            Load More Academic Papers
          </Button>
        </div>
      )}
    </div>
  );
}
