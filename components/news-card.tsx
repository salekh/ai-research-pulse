'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ExternalLink, Sparkles, Loader2, Bookmark, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { CompanyLogo } from './company-logo';

interface Article {
  title: string;
  link: string;
  date: string;
  source: 'Google Research' | 'Google DeepMind' | 'OpenAI' | 'Anthropic' | 'Microsoft Research' | 'Meta AI';
  snippet: string;
  tags?: string[];
  score?: number;
}

interface NewsCardProps {
  article: Article;
  onSave?: (article: Article) => void;
  isSaved?: boolean;
}

// Accent colors per source — used for the top border gradient
const SOURCE_ACCENTS: Record<string, { from: string; to: string }> = {
  'Google Research': { from: '#4285F4', to: '#34A853' },
  'Google DeepMind': { from: '#4285F4', to: '#00ACC1' },
  'OpenAI':          { from: '#10a37f', to: '#1a7f64' },
  'Anthropic':       { from: '#d4a574', to: '#c084fc' },
  'Microsoft Research': { from: '#00a4ef', to: '#7fba00' },
  'Meta AI':         { from: '#0668E1', to: '#00C2FF' },
};

// Tag colors — cycle through a palette for visual variety
const TAG_COLORS = [
  'bg-blue-50 text-blue-600 border-blue-100',
  'bg-violet-50 text-violet-600 border-violet-100',
  'bg-emerald-50 text-emerald-600 border-emerald-100',
  'bg-amber-50 text-amber-700 border-amber-100',
  'bg-rose-50 text-rose-600 border-rose-100',
  'bg-cyan-50 text-cyan-600 border-cyan-100',
];

export function NewsCard({ article, onSave, isSaved = false }: NewsCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiOverview, setAiOverview] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [formattedDate, setFormattedDate] = useState<string>('');

  useEffect(() => {
    try {
      setFormattedDate(format(new Date(article.date), 'MMM d'));
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
    if (isExpanded) { setIsExpanded(false); return; }
    setIsExpanded(true);
    if (aiOverview) return;
    setIsGenerating(true);
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: article.title, snippet: article.snippet, link: article.link }),
      });
      if (!response.ok) throw new Error('Failed to generate summary');
      const data = await response.json();
      setAiOverview(data.summary);
    } catch (error: any) {
      console.error('Gemini API Error:', error);
      setAiOverview('Failed to generate overview. Please try again later.');
    } finally {
      setIsGenerating(false);
    }
  };

  const accent = SOURCE_ACCENTS[article.source] || { from: '#6366f1', to: '#8b5cf6' };

  return (
    <div className="group h-full flex flex-col rounded-2xl border border-gray-100 bg-white overflow-hidden
                    shadow-sm hover:shadow-lg hover:border-gray-200 transition-all duration-300 relative">

      {/* Colored accent bar at the top */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }} />

      {/* Match score banner */}
      {article.score !== undefined && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100 py-1.5 px-4 flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-indigo-500" />
          <span className="text-[11px] font-semibold text-indigo-700">{Math.round(article.score * 100)}% match</span>
        </div>
      )}

      {/* Header: source + date + save */}
      <div className={`flex justify-between items-center px-5 ${article.score !== undefined ? 'pt-3' : 'pt-5'} pb-2`}>
        <div className="flex items-center gap-2">
          <CompanyLogo company={article.source} className="w-5 h-5" />
          <span className="text-xs font-medium text-gray-500">{article.source}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 font-medium">{formattedDate}</span>
          {onSave && (
            <button onClick={handleSave} disabled={isSaved}
              className={`p-1.5 rounded-full transition-all duration-200 ${
                isSaved
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
              }`}
              title={isSaved ? "Saved" : "Save for later"}>
              {justSaved || isSaved ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="px-5 pb-3">
        <a href={article.link} target="_blank" rel="noopener noreferrer"
          className="text-[15px] leading-snug font-semibold text-gray-900 hover:text-indigo-600 transition-colors line-clamp-2">
          {article.title}
        </a>
      </div>

      {/* Snippet */}
      <div className="flex-grow px-5 pb-4">
        <p className="text-sm text-gray-500 line-clamp-3 leading-relaxed">
          {(article.snippet || '').replace(/<[^>]*>?/gm, '')}
        </p>

        {/* Tags */}
        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {article.tags.slice(0, 4).map((tag, i) => (
              <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${TAG_COLORS[i % TAG_COLORS.length]}`}>
                {tag}
              </span>
            ))}
            {article.tags.length > 4 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-400 border border-gray-100">
                +{article.tags.length - 4}
              </span>
            )}
          </div>
        )}

        {/* AI Summary expand */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-xl p-4 border border-indigo-100/50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-gray-700">AI Summary</span>
                </div>
                {isGenerating ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    <span>Analyzing with Gemini…</span>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 space-y-2 prose prose-sm max-w-none prose-p:leading-relaxed prose-li:marker:text-indigo-400">
                    <ReactMarkdown>{aiOverview || ''}</ReactMarkdown>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="px-5 pb-4 pt-0 flex justify-between items-center mt-auto border-t border-gray-50">
        <a href={article.link} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center text-xs font-medium text-gray-400 hover:text-indigo-600 transition-colors pt-3 gap-1">
          Read article <ExternalLink className="w-3 h-3" />
        </a>
        <button onClick={handleGenerateOverview}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-200 mt-3 ${
            isExpanded
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent'
          }`}>
          {isGenerating ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          {isExpanded ? (aiOverview ? 'Hide' : 'Summarizing…') : 'Summarize'}
          {!isExpanded && <ChevronDown className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}
