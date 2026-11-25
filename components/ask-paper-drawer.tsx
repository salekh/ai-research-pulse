'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  ExternalLink,
  FileText,
  Cpu,
  Sparkles,
  Loader2,
  Copy,
  Check,
  BookOpen,
  RotateCcw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export interface AskTargetArticle {
  title: string;
  link: string;
  source: string;
  date: string;
  snippet?: string;
  abstract?: string;
  summary?: string;
  keyInnovation?: string;
  tags?: string[];
  category?: 'lab' | 'academic';
  authors?: string[];
  arxivId?: string;
  pdfUrl?: string;
  venue?: string;
  primaryCategory?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelUsed?: string;
  contextSource?: 'full-html' | 'article-body' | 'abstract-only';
  latencyMs?: number;
  suggestedFollowUps?: string[];
  isError?: boolean;
}

interface AskPaperDrawerProps {
  article: AskTargetArticle | null;
  isOpen: boolean;
  onClose: () => void;
}

const CONTEXT_BADGE: Record<
  'full-html' | 'article-body' | 'abstract-only',
  { label: string; tone: string }
> = {
  'full-html': {
    label: 'Grounded in arXiv HTML',
    tone: 'bg-[#E6F4EA] text-[#137333] border-[#34A853]/30',
  },
  'article-body': {
    label: 'Grounded in Full Article',
    tone: 'bg-[#E6F4EA] text-[#137333] border-[#34A853]/30',
  },
  'abstract-only': {
    label: 'Grounded in Abstract & Summary',
    tone: 'bg-[#FEF7E0] text-[#9A5200] border-[#FBBC04]/40',
  },
};

export function AskPaperDrawer({ article, isOpen, onClose }: AskPaperDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset conversation when switching to a different article/paper
  useEffect(() => {
    setMessages([]);
    setInput('');
    setLoading(false);
  }, [article?.link]);

  // Escape key closes drawer
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [isOpen, article?.link]);

  if (!isOpen || !article) return null;

  const isAcademic =
    article.category === 'academic' ||
    Boolean(article.arxivId) ||
    article.link.includes('arxiv.org');

  const starterQuestions = isAcademic
    ? [
        'What is the core methodological novelty compared to prior work?',
        'What are the key experimental results, benchmarks, and ablations?',
        'What assumptions, compute costs, or limitations should I watch out for?',
        'Explain the architecture or algorithm step-by-step for an ML engineer.',
      ]
    : [
        'What is the core technical breakthrough announced here?',
        'How does this compare to competing frontier models or systems?',
        'What are the practical enterprise architecture or deployment implications?',
        'What caveats, safety constraints, or open limitations are noted?',
      ];

  const askQuestion = async (rawQuestion: string) => {
    const q = rawQuestion.trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: q,
    };

    const nextHistory = messages
      .filter((m) => !m.isError)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article,
          question: q,
          history: nextHistory,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to get response');
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'No response generated.',
        modelUsed: data.modelUsed || 'gemini-4-neon',
        contextSource: data.contextSource,
        latencyMs: data.latencyMs,
        suggestedFollowUps: Array.isArray(data.suggestedFollowUps)
          ? data.suggestedFollowUps
          : [],
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: err?.message || 'Unable to process question right now. Please try again.',
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {}
  };

  const latestAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && !m.isError);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#202124]/60 backdrop-blur-[2px] animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={`Ask questions about ${article.title}`}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl h-full bg-[#F8F9FA] shadow-2xl border-l border-[#DADCE0] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top 4px FDE Rainbow Divider */}
        <div className="h-1 w-full fde-gradient-divider shrink-0" />

        {/* Dark FDE Chrome Header */}
        <header className="bg-[#202124] text-white px-4 sm:px-6 py-3.5 border-b border-[#3C4043] shrink-0 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#4471ED]/20 border border-[#4471ED]/40 text-[#8AB4F8] text-xs font-mono font-normal">
                  <Cpu className="w-3 h-3" />
                  <span>gemini-4-neon</span>
                </span>
                <span className="text-xs font-mono font-normal text-[#BABBBC]">
                  {isAcademic
                    ? article.venue || `arXiv${article.arxivId ? ` · ${article.arxivId}` : ''}`
                    : article.source}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold font-display leading-snug text-white line-clamp-2">
                {article.title}
              </h2>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  title="Reset conversation"
                  className="p-2 rounded-lg text-[#BABBBC] hover:text-white hover:bg-[#303134] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Q&A drawer"
                className="p-2 rounded-lg text-[#BABBBC] hover:text-white hover:bg-[#303134] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Source & PDF quick links */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-[#BABBBC]">
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#8AB4F8] hover:underline"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>{isAcademic ? 'arXiv Abstract' : 'Original Article'}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              {article.pdfUrl && (
                <a
                  href={article.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#8AB4F8] hover:underline"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Full PDF</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {latestAssistant?.contextSource && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-mono font-normal ${
                  CONTEXT_BADGE[latestAssistant.contextSource].tone
                }`}
              >
                {CONTEXT_BADGE[latestAssistant.contextSource].label}
              </span>
            )}
          </div>
        </header>

        {/* Scrollable Q&A Thread */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
          {/* Context Preview Card */}
          <div className="rounded-xl bg-white border border-[#DADCE0] p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1967D2] font-display">
                {isAcademic ? 'Indexed Abstract & Short Summary' : 'Article Context'}
              </span>
              {article.authors && article.authors.length > 0 && (
                <span className="text-xs text-[#5F6368] truncate max-w-[60%]">
                  {article.authors.slice(0, 3).join(', ')}
                  {article.authors.length > 3 ? ' et al.' : ''}
                </span>
              )}
            </div>
            <p className="text-sm text-[#3C4043] leading-relaxed">
              {article.summary || article.abstract || article.snippet}
            </p>
            {isAcademic && (
              <p className="text-xs text-[#5F6368]">
                On-demand reasoning via <span className="font-mono font-normal text-[#202124]">gemini-4-neon</span>{' '}
                reads the arXiv HTML live during Q&amp;A without indexing the full paper into storage.
              </p>
            )}
          </div>

          {/* Starter Question Chips (shown before first user question) */}
          {messages.length === 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#5F6368] font-display">
                <Sparkles className="w-3.5 h-3.5 text-[#4471ED]" />
                <span>Suggested Research Questions</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {starterQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={loading}
                    onClick={() => askQuestion(q)}
                    className="text-left px-4 py-3 rounded-xl bg-white border border-[#DADCE0] hover:border-[#4471ED] hover:bg-[#E8F0FE]/40 text-sm text-[#202124] transition-all cursor-pointer shadow-xs"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Conversation Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {msg.role === 'user' ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[#202124] text-white px-4 py-3 text-sm leading-relaxed shadow-xs">
                  {msg.content}
                </div>
              ) : (
                <div
                  className={`w-full rounded-xl border p-4 shadow-xs space-y-3 ${
                    msg.isError
                      ? 'bg-[#FCE8E6] border-[#EA4335]/30 text-[#C5221F]'
                      : 'bg-white border-[#DADCE0] text-[#202124]'
                  }`}
                >
                  {!msg.isError && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#DADCE0]/60">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#E8F0FE] text-[#1967D2] text-xs font-mono font-normal">
                          <Cpu className="w-3 h-3" />
                          <span>{msg.modelUsed || 'gemini-4-neon'}</span>
                        </span>
                        {msg.latencyMs && (
                          <span className="text-xs font-mono font-normal text-[#5F6368] tabular-nums">
                            {(msg.latencyMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[#5F6368] hover:text-[#202124] hover:bg-[#F8F9FA] cursor-pointer"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#137333]" />
                            <span className="text-[#137333]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  <div className="prose prose-sm max-w-[70ch] text-[#3C4043] leading-relaxed [&_strong]:text-[#202124] [&_h3]:text-base [&_h3]:font-display [&_h3]:text-[#202124] [&_code]:font-mono [&_code]:text-xs [&_code]:bg-[#F1F3F4] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 space-y-2">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>

                  {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                    <div className="pt-2 border-t border-[#DADCE0]/60 flex flex-wrap gap-1.5">
                      {msg.suggestedFollowUps.map((fq) => (
                        <button
                          key={fq}
                          type="button"
                          disabled={loading}
                          onClick={() => askQuestion(fq)}
                          className="text-left px-2.5 py-1.5 rounded-lg bg-[#F8F9FA] hover:bg-[#E8F0FE] border border-[#DADCE0] hover:border-[#4471ED]/40 text-xs text-[#1967D2] transition-colors cursor-pointer"
                        >
                          {fq}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="rounded-xl bg-white border border-[#DADCE0] p-4 shadow-xs flex items-center gap-3 text-sm text-[#5F6368]">
              <Loader2 className="w-4 h-4 animate-spin text-[#4471ED] shrink-0" />
              <span>
                Reasoning with <span className="font-mono font-normal text-[#1967D2]">gemini-4-neon</span>…
              </span>
            </div>
          )}

          <div ref={scrollEndRef} />
        </div>

        {/* Sticky Question Input Footer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            askQuestion(input);
          }}
          className="bg-white border-t border-[#DADCE0] px-4 sm:px-6 py-3.5 shrink-0"
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              placeholder={
                isAcademic
                  ? 'Ask about methodology, proofs, benchmarks, or limitations…'
                  : 'Ask a technical question about this publication…'
              }
              className="flex-1 h-11 px-4 rounded-xl border border-[#DADCE0] bg-[#F8F9FA] focus:bg-white text-sm text-[#202124] placeholder:text-[#5F6368] focus:outline-none focus:border-[#4471ED] focus:ring-2 focus:ring-[#4471ED]/20"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-11 px-4 rounded-xl bg-[#335CD6] hover:bg-[#274BB5] disabled:opacity-50 text-white text-sm font-semibold font-display inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Ask</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
