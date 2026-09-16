'use client';

import { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Loader2, Mic, Radio } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CompanyLogo } from '@/components/company-logo';

interface Article {
  link: string;
  title: string;
  date: string;
  source: string;
  snippet: string;
}

interface ArticleSelectorProps {
  onGenerate: (selectedArticles: Article[], type: 'overview' | 'podcast') => void;
  isGenerating: boolean;
}

export function ArticleSelector({ onGenerate, isGenerating }: ArticleSelectorProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        const res = await fetch('/api/news?timeRange=all&limit=40');
        const data = await res.json();
        setArticles(data.articles || []);
        // Select top 3 by default for immediate convenience
        if (data.articles && data.articles.length >= 3) {
          setSelectedLinks(new Set(data.articles.slice(0, 3).map((a: Article) => a.link)));
        }
      } catch (e) {
        console.error('Failed to fetch articles', e);
      } finally {
        setLoading(false);
      }
    };
    fetchArticles();
  }, []);

  const toggleArticle = (link: string) => {
    const newSelected = new Set(selectedLinks);
    if (newSelected.has(link)) {
      newSelected.delete(link);
    } else {
      newSelected.add(link);
    }
    setSelectedLinks(newSelected);
  };

  const selectAll = () => {
    if (selectedLinks.size === articles.length) {
      setSelectedLinks(new Set());
    } else {
      setSelectedLinks(new Set(articles.map((a) => a.link)));
    }
  };

  const handleGenerate = (type: 'overview' | 'podcast') => {
    const selected = articles.filter((a) => selectedLinks.has(a.link));
    onGenerate(selected, type);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-[#4471ED]" />
        <p className="text-xs text-[#5F6368]">Loading indexed publications…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#202124] font-display">
            Select Publications for Synthesis
          </span>
          {selectedLinks.size > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#E8F0FE] text-[#1967D2] border border-[#4471ED]/30 tabular-nums">
              {selectedLinks.size} selected
            </span>
          )}
        </div>
        <button
          onClick={selectAll}
          className="text-xs font-semibold text-[#4471ED] hover:underline cursor-pointer"
        >
          {selectedLinks.size === articles.length ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <ScrollArea className="h-[320px] rounded-xl border border-[#DADCE0] bg-[#F8F9FA]">
        <div className="p-2 space-y-1.5">
          {articles.map((article) => {
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
                <Checkbox checked={isSelected} className="mt-0.5 pointer-events-none" tabIndex={-1} />
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs leading-snug ${
                      isSelected ? 'text-[#202124] font-bold' : 'text-[#202124] font-medium'
                    }`}
                  >
                    {article.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <CompanyLogo company={article.source as any} className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold text-[#5F6368]">{article.source}</span>
                    <span className="text-[10px] text-[#DADCE0]">•</span>
                    <span className="text-[10px] text-[#5F6368] tabular-nums">
                      {(() => {
                        try {
                          return formatDistanceToNow(new Date(article.date), { addSuffix: true });
                        } catch {
                          return article.date;
                        }
                      })()}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>

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
          Generate Audio Briefing
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
          Generate Podcast Episode
        </Button>
      </div>
    </div>
  );
}
