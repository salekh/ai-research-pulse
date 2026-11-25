'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  ExternalLink,
  FileText,
  MessageSquare,
  Layers,
  ChevronDown,
  ChevronUp,
  Bookmark,
  Check,
  GraduationCap,
  Flame,
  Cpu,
} from 'lucide-react';
import type { AcademicPaper } from '@/lib/db';

const TRACK_ACCENTS: Record<string, { from: string; to: string; label: string }> = {
  'cs.AI': { from: '#4471ED', to: '#4285F4', label: 'Artificial Intelligence' },
  'cs.LG': { from: '#34A853', to: '#4285F4', label: 'Machine Learning' },
  'cs.CL': { from: '#0764FF', to: '#34A853', label: 'LLMs & Computation/Language' },
  'cs.CV': { from: '#FBBC04', to: '#EA4335', label: 'Vision & Multimodal' },
  'cs.RO': { from: '#EA4335', to: '#FF9302', label: 'Robotics & Embodied AI' },
  'stat.ML': { from: '#202124', to: '#4471ED', label: 'Statistical ML' },
};

interface AcademicCardProps {
  paper: AcademicPaper;
  isSaved?: boolean;
  onSave?: (paper: AcademicPaper) => void;
  onAskPaper: (paper: AcademicPaper) => void;
  onOpenVisualBrief: (paper: AcademicPaper) => void;
}

export function AcademicCard({
  paper,
  isSaved = false,
  onSave,
  onAskPaper,
  onOpenVisualBrief,
}: AcademicCardProps) {
  const [showAbstract, setShowAbstract] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [formattedDate, setFormattedDate] = useState('');

  useEffect(() => {
    try {
      setFormattedDate(format(new Date(paper.date), 'MMM d, yyyy'));
    } catch {
      setFormattedDate('');
    }
  }, [paper.date]);

  const accent = TRACK_ACCENTS[paper.primaryCategory] || TRACK_ACCENTS['cs.AI'];

  const authorPreview =
    paper.authors && paper.authors.length > 0
      ? paper.authors.length > 3
        ? `${paper.authors.slice(0, 3).join(', ')} +${paper.authors.length - 3} authors`
        : paper.authors.join(', ')
      : 'arXiv Preprint Authors';

  const handleSave = () => {
    if (onSave) {
      onSave(paper);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
    }
  };

  return (
    <article className="group h-full flex flex-col rounded-xl border border-[#DADCE0] bg-white overflow-hidden shadow-xs hover:shadow-md hover:border-[#4471ED]/60 transition-all duration-200">
      {/* Top 4px Track Accent Rule */}
      <div
        className="h-1 w-full"
        style={{ background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }}
      />

      {/* Semantic Search Match Banner */}
      {paper.score !== undefined && (
        <div className="bg-[#E8F0FE] border-b border-[#DADCE0] py-1.5 px-5 flex items-center justify-between">
          <span className="text-xs font-mono font-normal text-[#1967D2] tabular-nums">
            {Math.round(paper.score * 100)}% Hybrid Match
          </span>
          <span className="text-xs font-mono font-normal text-[#5F6368] uppercase">
            Abstract Index
          </span>
        </div>
      )}

      {/* Header: Venue / Track + arXiv ID + Date + Impact + Save */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#202124] text-white text-xs font-mono font-normal">
            <GraduationCap className="w-3 h-3 text-[#8AB4F8]" />
            <span>{paper.primaryCategory || 'cs.AI'}</span>
          </span>
          {paper.arxivId && (
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#F8F9FA] border border-[#DADCE0] text-xs font-mono font-normal text-[#5F6368] tabular-nums">
              arXiv:{paper.arxivId}
            </span>
          )}
          {paper.citationCount > 0 && (
            <span
              title="Community upvotes / citations signal"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#E6F4EA] text-[#137333] text-xs font-mono font-normal tabular-nums"
            >
              <Flame className="w-3 h-3" />
              <span>{paper.citationCount}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-[#5F6368] font-medium tabular-nums">
            {formattedDate}
          </span>
          {onSave && (
            <button
              type="button"
              onClick={handleSave}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                isSaved
                  ? 'text-[#4471ED] bg-[#E8F0FE]'
                  : 'text-[#5F6368] hover:text-[#202124] hover:bg-[#F8F9FA]'
              }`}
              title={isSaved ? 'Saved' : 'Bookmark paper'}
            >
              {justSaved || isSaved ? (
                <Check className="w-4 h-4" />
              ) : (
                <Bookmark className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Title & Authors */}
      <div className="px-5 pb-3 space-y-1">
        <a
          href={paper.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-base sm:text-lg leading-snug font-bold font-display text-[#202124] hover:text-[#1967D2] transition-colors line-clamp-2"
        >
          {paper.title}
        </a>
        <p className="text-xs text-[#5F6368] truncate" title={paper.authors?.join(', ')}>
          {authorPreview}
        </p>
      </div>

      {/* Short Summary (Hydrogen) + Expandable Abstract */}
      <div className="flex-grow px-5 pb-4 flex flex-col justify-between gap-3">
        <div className="space-y-2.5">
          {/* Short Summary Box */}
          <div className="rounded-lg bg-[#F8F9FA] border border-[#DADCE0] border-l-4 border-l-[#4471ED] p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#1967D2] font-display">
                <Cpu className="w-3 h-3 text-[#4471ED]" />
                <span>Short Summary</span>
              </span>
              <span className="text-[11px] font-mono font-normal text-[#5F6368]">
                gemini-4-hydrogen
              </span>
            </div>
            <p className="text-sm text-[#3C4043] leading-relaxed">
              {paper.summary || paper.snippet}
            </p>
          </div>

          {/* Abstract Toggle (Abstract-Only Indexed) */}
          {paper.abstract && (
            <div>
              <button
                type="button"
                onClick={() => setShowAbstract((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1967D2] hover:underline cursor-pointer"
              >
                <span>{showAbstract ? 'Hide Abstract' : 'Read Paper Abstract'}</span>
                {showAbstract ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              {showAbstract && (
                <p className="mt-2 text-xs text-[#5F6368] leading-relaxed bg-white border border-[#DADCE0] rounded-lg p-3 max-h-56 overflow-y-auto">
                  {paper.abstract}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Taxonomy Tags */}
        {paper.tags && paper.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {paper.tags.slice(0, 4).map((tag, i) => (
              <span
                key={`${paper.arxivId}-tag-${i}`}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-normal bg-[#F8F9FA] text-[#202124] border border-[#DADCE0]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer: Direct Paper Links (arXiv + PDF) & Action Buttons (Ask Paper + Visual Brief) */}
      <div className="px-4 py-3 flex justify-between items-center gap-2 mt-auto border-t border-[#DADCE0]/70 bg-[#F8F9FA]/60">
        <div className="flex items-center gap-2.5 shrink-0">
          <a
            href={paper.link}
            target="_blank"
            rel="noopener noreferrer"
            title="Open arXiv abstract page"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#5F6368] hover:text-[#202124] transition-colors whitespace-nowrap min-h-[34px]"
          >
            <span>arXiv</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
          <a
            href={paper.pdfUrl || paper.link.replace('/abs/', '/pdf/') + '.pdf'}
            target="_blank"
            rel="noopener noreferrer"
            title="Open paper PDF"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#1967D2] hover:underline transition-colors whitespace-nowrap min-h-[34px]"
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>PDF</span>
          </a>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onAskPaper(paper)}
            title="Ask questions about this paper with Gemini 4 Neon"
            className="inline-flex items-center gap-1 text-xs font-semibold font-display px-2.5 py-1.5 rounded-md bg-[#202124] hover:bg-[#303134] text-white transition-colors cursor-pointer whitespace-nowrap min-h-[34px]"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#8AB4F8] shrink-0" />
            <span>Ask Paper</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenVisualBrief(paper)}
            title="Open A2UI 1.0 Visual Brief"
            className="inline-flex items-center gap-1 text-xs font-semibold font-display px-2.5 py-1.5 rounded-md bg-[#335CD6] hover:bg-[#274BB5] text-white transition-colors cursor-pointer whitespace-nowrap min-h-[34px]"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>Visual</span>
          </button>
        </div>
      </div>
    </article>
  );
}
