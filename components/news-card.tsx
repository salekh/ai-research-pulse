'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  ExternalLink,
  Sparkles,
  Loader2,
  Bookmark,
  Check,
  ChevronDown,
  Zap,
  Cpu,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { CompanyLogo } from './company-logo';

interface Article {
  title: string;
  link: string;
  date: string;
  source:
    | 'Google Research'
    | 'Google DeepMind'
    | 'OpenAI'
    | 'Anthropic'
    | 'Microsoft Research'
    | 'Meta AI'
    | 'x.AI';
  snippet: string;
  tags?: string[];
  score?: number;
  summary?: string;
  keyInnovation?: string;
  significance?: string;
}

interface NewsCardProps {
  article: Article;
  onSave?: (article: Article) => void;
  isSaved?: boolean;
}

const SOURCE_ACCENTS: Record<string, { from: string; to: string }> = {
  'Google Research': { from: '#4285F4', to: '#34A853' },
  'Google DeepMind': { from: '#4471ED', to: '#4285F4' },
  OpenAI: { from: '#10a37f', to: '#0764FF' },
  Anthropic: { from: '#EC4032', to: '#FF9302' },
  'Microsoft Research': { from: '#0764FF', to: '#42AB42' },
  'Meta AI': { from: '#0668E1', to: '#4471ED' },
  'x.AI': { from: '#202124', to: '#5F6368' },
};

export function NewsCard({ article, onSave, isSaved = false }: NewsCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    summary: string;
    keyInnovation?: string;
    significance?: string;
    modelUsed?: string;
    cached?: boolean;
  } | null>(
    article.summary
      ? {
          summary: article.summary,
          keyInnovation: article.keyInnovation,
          significance: article.significance,
          cached: true,
        }
      : null
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [formattedDate, setFormattedDate] = useState<string>('');

  useEffect(() => {
    try {
      setFormattedDate(format(new Date(article.date), 'MMM d, yyyy'));
    } catch {
      setFormattedDate('');
    }
  }, [article.date]);

  const handleSave = () => {
    if (onSave) {
      onSave(article);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    }
  };

  const handleGenerateOverview = async () => {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }
    setIsExpanded(true);
    if (summaryData) return;

    setIsGenerating(true);
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: article.title,
          snippet: article.snippet,
          link: article.link,
        }),
      });
      if (!response.ok) throw new Error('Failed to generate summary');
      const data = await response.json();
      setSummaryData({
        summary: data.summary,
        keyInnovation: data.keyInnovation,
        significance: data.significance,
        modelUsed: data.modelUsed || 'gemini-3.8-flash',
        cached: data.cached,
      });
    } catch (error) {
      console.error('Summarize error:', error);
      setSummaryData({
        summary: 'Failed to generate overview. Please try again.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const accent = SOURCE_ACCENTS[article.source] || { from: '#4471ED', to: '#4285F4' };

  return (
    <div className="group h-full flex flex-col rounded-xl border border-[#DADCE0] bg-white overflow-hidden shadow-xs hover:shadow-md hover:border-[#4471ED]/60 transition-all duration-200 relative">
      {/* Top brand accent bar */}
      <div
        className="h-1 w-full"
        style={{ background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }}
      />

      {/* Match score banner (if returned by hybrid vector/BM25 search) */}
      {article.score !== undefined && (
        <div className="bg-[#E8F0FE] border-b border-[#DADCE0] py-1.5 px-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#4471ED]" />
            <span className="text-[11px] font-bold text-[#1967D2] font-mono tabular-nums">
              {Math.round(article.score * 100)}% Semantic Match
            </span>
          </div>
          <span className="text-[10px] font-mono text-[#5F6368] uppercase">Hybrid Rank</span>
        </div>
      )}

      {/* Card Header: Lab logo + Source + Date + Save button */}
      <div
        className={`flex justify-between items-center px-5 ${
          article.score !== undefined ? 'pt-3.5' : 'pt-5'
        } pb-2`}
      >
        <div className="flex items-center gap-2">
          <CompanyLogo company={article.source} className="w-4 h-4" />
          <span className="text-xs font-bold text-[#202124] tracking-tight">
            {article.source}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#5F6368] font-medium tabular-nums">
            {formattedDate}
          </span>
          {onSave && (
            <button
              onClick={handleSave}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                isSaved
                  ? 'text-[#4471ED] bg-[#E8F0FE]'
                  : 'text-[#5F6368] hover:text-[#202124] hover:bg-[#F8F9FA]'
              }`}
              title={isSaved ? 'Saved' : 'Save publication'}
            >
              {justSaved || isSaved ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Bookmark className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="px-5 pb-2.5">
        <a
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[15px] leading-snug font-bold font-display text-[#202124] hover:text-[#4471ED] transition-colors line-clamp-2"
        >
          {article.title}
        </a>
      </div>

      {/* Snippet + Technical Taxonomy Tags */}
      <div className="flex-grow px-5 pb-4 flex flex-col justify-between">
        <p className="text-xs text-[#5F6368] line-clamp-3 leading-relaxed">
          {(article.snippet || '').replace(/<[^>]*>?/gm, '')}
        </p>

        <div>
          {article.tags && article.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3.5">
              {article.tags.slice(0, 4).map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#F8F9FA] text-[#202124] border border-[#DADCE0]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Expandable AI Executive Briefing */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 bg-[#F8F9FA] rounded-lg p-3.5 border-l-4 border-[#4471ED] border-t border-r border-b border-t-[#DADCE0] border-r-[#DADCE0] border-b-[#DADCE0] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-[#4471ED]" />
                      <span className="text-[11px] font-bold text-[#202124] uppercase tracking-wider font-display">
                        Executive Briefing
                      </span>
                    </div>
                    {summaryData && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#E8F0FE] text-[#1967D2]">
                        {summaryData.cached ? 'Cached · <2ms' : summaryData.modelUsed || 'gemini-3.8-flash'}
                      </span>
                    )}
                  </div>

                  {isGenerating ? (
                    <div className="flex items-center gap-2 text-xs text-[#5F6368] py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4471ED]" />
                      <span>Synthesizing technical contribution via Gemini 3.8 Flash…</span>
                    </div>
                  ) : summaryData ? (
                    <div className="space-y-2 text-xs">
                      {summaryData.keyInnovation && (
                        <div className="bg-white p-2.5 rounded border border-[#DADCE0]">
                          <span className="font-bold text-[#4471ED] uppercase text-[10px] block mb-0.5 font-mono">
                            Core Technical Innovation
                          </span>
                          <p className="text-[#202124] font-medium leading-snug">
                            {summaryData.keyInnovation}
                          </p>
                        </div>
                      )}
                      <div className="text-[#5F6368] leading-relaxed">
                        <ReactMarkdown>{summaryData.summary}</ReactMarkdown>
                      </div>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Card Footer */}
      <div className="px-5 py-3 flex justify-between items-center mt-auto border-t border-[#DADCE0]/70 bg-[#F8F9FA]/50">
        <a
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-xs font-semibold text-[#5F6368] hover:text-[#202124] transition-colors gap-1"
        >
          <span>Read Paper</span>
          <ExternalLink className="w-3 h-3" />
        </a>

        <button
          onClick={handleGenerateOverview}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-md transition-all cursor-pointer ${
            isExpanded
              ? 'bg-[#202124] text-white'
              : summaryData
              ? 'bg-[#E8F0FE] text-[#1967D2] hover:bg-[#d2e3fc]'
              : 'bg-white text-[#202124] border border-[#DADCE0] hover:border-[#4471ED] hover:text-[#4471ED]'
          }`}
        >
          {isGenerating ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : summaryData ? (
            <Zap className="w-3 h-3 text-[#4471ED]" />
          ) : (
            <Sparkles className="w-3 h-3 text-[#4471ED]" />
          )}
          <span>
            {isExpanded ? 'Hide Briefing' : summaryData ? 'Instant Briefing' : 'Summarize'}
          </span>
          {!isExpanded && <ChevronDown className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}
