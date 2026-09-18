'use client';

import { useState, useEffect, useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Mic,
  Radio,
  Search,
  X,
  CheckCheck,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CompanyLogo } from '@/components/company-logo';

interface Article {
  link: string;
  title: string;
  date: string;
  source: string;
  snippet: string;
  tags?: string[];
}

interface ArticleSelectorProps {
  onGenerate: (selectedArticles: Article[], type: 'overview' | 'podcast') => void;
  isGenerating: boolean;
}

const ALL_LABS = [
  'Google DeepMind',
  'Google Research',
  'Google Cloud AI',
  'OpenAI',
  'Anthropic',
  'Meta AI',
  'Microsoft Research',
  'x.AI',
] as const;

export function ArticleSelector({ onGenerate, isGenerating }: ArticleSelectorProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Filtering state
  const [titleQuery, setTitleQuery] = useState('');
  const [selectedLab, setSelectedLab] = useState<string>('ALL');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(80);

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const res = await fetch('/api/news?timeRange=all&limit=5000');
        const data = await res.json();
        const catalog: Article[] = data.articles || [];
        setArticles(catalog);
        // Select top 3 by default for immediate convenience
        if (catalog.length >= 3) {
          setSelectedLinks(new Set(catalog.slice(0, 3).map((a) => a.link)));
        }
      } catch (e) {
        console.error('Failed to fetch full article catalog', e);
      } finally {
        setLoading(false);
      }
    };
    fetchCatalog();
  }, []);

  // Reset pagination window whenever filters change
  useEffect(() => {
    setVisibleCount(80);
  }, [titleQuery, selectedLab, showSelectedOnly]);

  // Compute per-lab counts across the full catalog
  const labCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of articles) {
      counts[a.source] = (counts[a.source] || 0) + 1;
    }
    return counts;
  }, [articles]);

  // Filtered articles across all 2,229 items in memory
  const filteredArticles = useMemo(() => {
    const q = titleQuery.trim().toLowerCase();
    return articles.filter((a) => {
      if (showSelectedOnly && !selectedLinks.has(a.link)) return false;
      if (selectedLab !== 'ALL' && a.source !== selectedLab) return false;
      if (q) {
        const inTitle = a.title.toLowerCase().includes(q);
        const inSnippet = a.snippet?.toLowerCase().includes(q);
        const inTags = a.tags?.some((t) => t.toLowerCase().includes(q));
        if (!inTitle && !inSnippet && !inTags) return false;
      }
      return true;
    });
  }, [articles, titleQuery, selectedLab, showSelectedOnly, selectedLinks]);

  const displayedArticles = useMemo(
    () => filteredArticles.slice(0, visibleCount),
    [filteredArticles, visibleCount]
  );

  // Selected article objects preserved across any filter state
  const selectedArticlesList = useMemo(
    () => articles.filter((a) => selectedLinks.has(a.link)),
    [articles, selectedLinks]
  );

  const toggleArticle = (link: string) => {
    const next = new Set(selectedLinks);
    if (next.has(link)) {
      next.delete(link);
    } else {
      next.add(link);
    }
    setSelectedLinks(next);
  };

  const selectVisible = () => {
    const next = new Set(selectedLinks);
    for (const a of displayedArticles) {
      next.add(a.link);
    }
    setSelectedLinks(next);
  };

  const clearSelection = () => {
    setSelectedLinks(new Set());
  };

  const handleGenerate = (type: 'overview' | 'podcast') => {
    onGenerate(selectedArticlesList, type);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-[#4471ED]" />
        <p className="text-xs text-[#5F6368]">
          Loading full publication catalog ({articles.length || '2,229'} papers)…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Selection Counter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#202124] font-display">
            Select Publications for Synthesis
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-[#E8F0FE] text-[#1967D2] border border-[#4471ED]/30 tabular-nums">
            {selectedLinks.size} selected
          </span>
          <span className="text-xs text-[#5F6368] font-mono tabular-nums">
            / {articles.length.toLocaleString()} catalog total
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={selectVisible}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#4471ED] hover:underline cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Select visible ({displayedArticles.length})</span>
          </button>
          {selectedLinks.size > 0 && (
            <button
              onClick={clearSelection}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#C5221F] hover:underline cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear ({selectedLinks.size})</span>
            </button>
          )}
        </div>
      </div>

      {/* Title & Keyword Filter Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#5F6368] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          type="text"
          value={titleQuery}
          onChange={(e) => setTitleQuery(e.target.value)}
          placeholder="Filter catalog by title, topic, or keyword (e.g. Gemini, RLHF, Agents, TPU)…"
          className="pl-10 pr-9 h-10 text-sm bg-[#F8F9FA] border-[#DADCE0] focus:bg-white focus:border-[#4471ED]"
        />
        {titleQuery && (
          <button
            onClick={() => setTitleQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5F6368] hover:text-[#202124] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Lab / Source Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => {
            setSelectedLab('ALL');
            setShowSelectedOnly(false);
          }}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border ${
            selectedLab === 'ALL' && !showSelectedOnly
              ? 'bg-[#202124] text-white border-[#202124]'
              : 'bg-[#F8F9FA] text-[#3C4043] border-[#DADCE0] hover:border-[#4471ED]'
          }`}
        >
          All Labs ({articles.length.toLocaleString()})
        </button>

        <button
          onClick={() => setShowSelectedOnly(!showSelectedOnly)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border ${
            showSelectedOnly
              ? 'bg-[#1967D2] text-white border-[#1967D2]'
              : 'bg-[#E8F0FE]/60 text-[#1967D2] border-[#4471ED]/30 hover:bg-[#E8F0FE]'
          }`}
        >
          ★ Selected Only ({selectedLinks.size})
        </button>

        {ALL_LABS.map((lab) => {
          const count = labCounts[lab] || 0;
          const active = selectedLab === lab && !showSelectedOnly;
          return (
            <button
              key={lab}
              onClick={() => {
                setSelectedLab(active ? 'ALL' : lab);
                setShowSelectedOnly(false);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border ${
                active
                  ? 'bg-[#4471ED] text-white border-[#4471ED] shadow-xs'
                  : 'bg-white text-[#3C4043] border-[#DADCE0] hover:border-[#4471ED]'
              }`}
            >
              <CompanyLogo company={lab} className="w-3.5 h-3.5" />
              <span>{lab}</span>
              <span
                className={`text-[10px] font-mono tabular-nums ${
                  active ? 'text-white/90' : 'text-[#5F6368]'
                }`}
              >
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Filter Status Bar */}
      <div className="flex items-center justify-between text-xs text-[#5F6368] px-1">
        <span>
          Showing <strong className="text-[#202124]">{displayedArticles.length}</strong> of{' '}
          <strong className="text-[#202124]">{filteredArticles.length.toLocaleString()}</strong>{' '}
          matching articles
        </span>
        {(titleQuery || selectedLab !== 'ALL' || showSelectedOnly) && (
          <button
            onClick={() => {
              setTitleQuery('');
              setSelectedLab('ALL');
              setShowSelectedOnly(false);
            }}
            className="text-xs text-[#4471ED] hover:underline font-medium cursor-pointer"
          >
            Reset all filters
          </button>
        )}
      </div>

      {/* Scrollable Article List */}
      <ScrollArea className="h-[360px] rounded-xl border border-[#DADCE0] bg-[#F8F9FA]">
        <div className="p-2 space-y-1.5">
          {displayedArticles.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#5F6368]">
              No publications match the current title or lab filter.
            </div>
          ) : (
            displayedArticles.map((article) => {
              const isSelected = selectedLinks.has(article.link);
              return (
                <button
                  key={article.link}
                  onClick={() => toggleArticle(article.link)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#E8F0FE] border border-[#4471ED]/40 shadow-xs'
                      : 'bg-white hover:border-[#DADCE0] border border-transparent'
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    className="mt-0.5 pointer-events-none"
                    tabIndex={-1}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-snug ${
                        isSelected ? 'text-[#202124] font-bold' : 'text-[#202124] font-medium'
                      }`}
                    >
                      {article.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <CompanyLogo company={article.source as any} className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold text-[#5F6368]">{article.source}</span>
                      <span className="text-xs text-[#DADCE0]">•</span>
                      <span className="text-xs text-[#5F6368] tabular-nums">
                        {(() => {
                          try {
                            return formatDistanceToNow(new Date(article.date), {
                              addSuffix: true,
                            });
                          } catch {
                            return article.date;
                          }
                        })()}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}

          {/* Load More inside ScrollArea when > visibleCount */}
          {filteredArticles.length > visibleCount && (
            <div className="pt-2 pb-1 text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((prev) => prev + 100)}
                className="w-full text-xs font-semibold text-[#4471ED] border-[#DADCE0] bg-white hover:bg-[#E8F0FE]/40 cursor-pointer"
              >
                <ChevronDown className="w-3.5 h-3.5 mr-1.5" />
                Show 100 more ({(filteredArticles.length - visibleCount).toLocaleString()} remaining)
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Synthesis Action Buttons */}
      <div className="flex gap-3">
        <Button
          onClick={() => handleGenerate('overview')}
          disabled={selectedLinks.size === 0 || isGenerating}
          className="flex-1 rounded-xl bg-[#4471ED] hover:bg-[#335cd6] text-white font-semibold text-xs py-5 shadow-xs cursor-pointer"
        >
          {isGenerating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Radio className="mr-2 h-4 w-4" />
          )}
          Generate Audio Briefing ({selectedLinks.size})
        </Button>
        <Button
          onClick={() => handleGenerate('podcast')}
          disabled={selectedLinks.size === 0 || isGenerating}
          className="flex-1 rounded-xl bg-[#202124] hover:bg-[#303134] text-white font-semibold text-xs py-5 shadow-xs cursor-pointer"
        >
          {isGenerating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mic className="mr-2 h-4 w-4" />
          )}
          Generate Podcast Episode ({selectedLinks.size})
        </Button>
      </div>
    </div>
  );
}
