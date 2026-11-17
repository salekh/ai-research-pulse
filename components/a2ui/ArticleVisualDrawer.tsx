'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertCircle,
  Check,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  Layers,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { A2UIApiResponse, ArticleInput } from '@/lib/a2ui/spec';
import { sanitizeExternalUrl } from '@/lib/a2ui/validator';
import { A2UIRenderer } from './A2UIRenderer';

export interface ArticleVisualDrawerProps {
  article: ArticleInput | null;
  isOpen: boolean;
  onClose: () => void;
}

function VisualBriefSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" aria-label="Generating visual brief">
      {/* Dark Hero Skeleton */}
      <div className="rounded-2xl bg-[#202124] p-6 sm:p-7 space-y-4 border border-[#3C4043]">
        <div className="flex items-center justify-between gap-3">
          <div className="h-6 w-36 rounded-full bg-white/15" />
          <div className="h-5 w-28 rounded bg-white/10" />
        </div>
        <div className="space-y-2.5">
          <div className="h-7 w-11/12 rounded bg-white/15" />
          <div className="h-7 w-2/3 rounded bg-white/15" />
        </div>
        <div className="flex gap-2 pt-1">
          <div className="h-5 w-16 rounded bg-white/10" />
          <div className="h-5 w-20 rounded bg-white/10" />
          <div className="h-5 w-14 rounded bg-white/10" />
        </div>
      </div>

      {/* Executive Synthesis Callout Skeleton */}
      <div className="rounded-r-xl border border-[#DADCE0] border-l-4 border-l-[#4471ED] bg-[#E8F0FE]/40 p-5 space-y-2.5">
        <div className="h-4 w-44 rounded bg-[#4471ED]/20" />
        <div className="h-4 w-full rounded bg-[#DADCE0]/80" />
        <div className="h-4 w-5/6 rounded bg-[#DADCE0]/80" />
      </div>

      {/* Metrics Strip Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[#DADCE0] bg-white p-4 space-y-2.5"
          >
            <div className="h-3 w-24 rounded bg-[#E8EAED]" />
            <div className="h-6 w-28 rounded bg-[#DADCE0]" />
            <div className="h-3 w-36 rounded bg-[#F1F3F4]" />
          </div>
        ))}
      </div>

      {/* Tabs + Content Skeleton */}
      <div className="space-y-3">
        <div className="flex gap-2 p-1.5 rounded-xl bg-white border border-[#DADCE0]">
          <div className="h-8 w-36 rounded-lg bg-[#202124]/15" />
          <div className="h-8 w-36 rounded-lg bg-[#F1F3F4]" />
          <div className="h-8 w-36 rounded-lg bg-[#F1F3F4]" />
        </div>
        <div className="rounded-xl border border-[#DADCE0] bg-white p-5 space-y-3.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#E8F0FE] shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 rounded bg-[#E8EAED]" />
                <div className="h-3.5 w-full rounded bg-[#F1F3F4]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ArticleVisualDrawer({
  article,
  isOpen,
  onClose,
}: ArticleVisualDrawerProps) {
  const [data, setData] = useState<A2UIApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchVisualBrief = useCallback(
    async (target: ArticleInput, forceRefresh = false) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      if (forceRefresh) setData(null);

      try {
        const res = await fetch('/api/a2ui', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            title: target.title,
            link: target.link,
            source: target.source,
            date: target.date,
            snippet: target.snippet,
            summary: target.summary,
            keyInnovation: target.keyInnovation,
            significance: target.significance,
            tags: target.tags,
            refresh: forceRefresh,
          }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }

        const payload = (await res.json()) as A2UIApiResponse;
        setData(payload);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to render A2UI 1.0 visual brief.'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isOpen || !article) return;
    setShowInspector(false);
    setData(null);
    fetchVisualBrief(article, false);

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [isOpen, article, fetchVisualBrief]);

  // Lock background scroll & support Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const handleCopyPayload = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data.messages, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const componentCount = data
    ? data.messages.reduce((acc, m) => {
        if ('updateComponents' in m) return acc + m.updateComponents.components.length;
        if ('createSurface' in m && m.createSurface.components) {
          return acc + m.createSurface.components.length;
        }
        return acc;
      }, 0)
    : 0;

  const safeArticleUrl = article ? sanitizeExternalUrl(article.link) : null;

  return (
    <AnimatePresence>
      {isOpen && article && (
        <div
          className="fixed inset-0 z-[60] flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={`Visual Brief: ${article.title}`}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#202124]/60 backdrop-blur-[2px]"
          />

          {/* Full-height Drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative z-10 w-full max-w-4xl h-full bg-[#F8F9FA] flex flex-col shadow-2xl border-l border-[#DADCE0] overflow-hidden"
          >
            {/* Top FDE Rainbow Divider */}
            <div className="h-1 w-full fde-gradient-divider shrink-0" />

            {/* Sticky Corporate Header Bar */}
            <header className="bg-[#202124] text-white px-4 sm:px-6 py-3 sm:py-3.5 border-b border-[#3C4043] flex items-center justify-between gap-2 sm:gap-3 shrink-0">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="hidden sm:flex w-8 h-8 rounded-lg bg-[#4471ED]/20 border border-[#4471ED]/40 items-center justify-center shrink-0">
                  <Layers className="w-4 h-4 text-[#8AB4F8]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold font-display text-white tracking-tight whitespace-nowrap">
                      <span className="sm:hidden">Visual Brief</span>
                      <span className="hidden sm:inline">Visual Research Brief</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#303134] border border-[#5F6368]/50 text-[11px] font-mono font-normal text-[#8AB4F8] whitespace-nowrap shrink-0">
                      A2UI v1.0
                    </span>
                    {data && (
                      <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#303134] border border-[#5F6368]/40 text-[11px] font-mono font-normal text-[#BABBBC] whitespace-nowrap shrink-0">
                        <Cpu className="w-3 h-3 text-[#4471ED] shrink-0" />
                        {data.modelUsed}
                        {data.cached ? ' · cached' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#BABBBC] truncate w-full mt-0.5">
                    {article.source} · {article.title}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {data && (
                  <button
                    type="button"
                    onClick={() => setShowInspector((prev) => !prev)}
                    aria-pressed={showInspector}
                    className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-mono font-normal border transition-colors cursor-pointer whitespace-nowrap ${
                      showInspector
                        ? 'bg-[#335CD6] text-white border-[#335CD6]'
                        : 'bg-[#303134] text-[#E8EAED] border-[#5F6368]/50 hover:border-[#8AB4F8]'
                    }`}
                    title="Inspect raw A2UI 1.0 protocol messages"
                  >
                    <Code2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Inspect A2UI 1.0 Payload</span>
                    <span className="sm:hidden">A2UI</span>
                  </button>
                )}

                {safeArticleUrl && (
                  <a
                    href={safeArticleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 sm:p-2 rounded-lg text-[#BABBBC] hover:text-white hover:bg-[#303134] transition-colors"
                    title="Open original paper"
                    aria-label="Open original paper"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close visual brief"
                  className="p-1.5 sm:p-2 rounded-lg text-[#BABBBC] hover:text-white hover:bg-[#303134] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-6 space-y-5">
              {/* Optional A2UI 1.0 Protocol Inspector Panel */}
              <AnimatePresence>
                {showInspector && data && (
                  <motion.section
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-[#3C4043] bg-[#202124] text-white overflow-hidden shadow-md">
                      <div className="px-4 py-3 border-b border-[#3C4043] flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                          <ShieldCheck className="w-4 h-4 text-[#34A853]" />
                          <span className="font-display font-bold text-white">
                            A2UI v{data.version} Wire Stream
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#303134] text-[#8AB4F8]">
                            surfaceId: {data.surfaceId}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#303134] text-[#BABBBC] tabular-nums">
                            {data.messages.length} msgs · {componentCount} nodes
                          </span>
                          {data.fallback && (
                            <span className="px-2 py-0.5 rounded bg-[#FBBC04]/20 text-[#FBBC04]">
                              deterministic fallback
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyPayload}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#303134] hover:bg-[#3C4043] text-xs font-mono text-[#E8EAED] cursor-pointer"
                        >
                          {copied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-[#34A853]" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy JSON</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="p-4 text-[11px] font-mono text-[#E8EAED] overflow-x-auto max-h-80 leading-relaxed">
                        {JSON.stringify(data.messages, null, 2)}
                      </pre>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>

              {/* Loading State */}
              {loading && <VisualBriefSkeleton />}

              {/* Error State with Retry */}
              {!loading && error && (
                <div className="rounded-xl border border-[#EA4335]/40 bg-[#FCE8E6] p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-[#C5221F] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold font-display text-[#C5221F]">
                        Unable to synthesize Visual Brief
                      </h3>
                      <p className="text-xs sm:text-sm text-[#C5221F]/90">{error}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchVisualBrief(article, true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#202124] hover:bg-[#303134] text-white text-xs font-semibold font-display cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Generation</span>
                  </button>
                </div>
              )}

              {/* Rendered A2UI 1.0 Surface */}
              {!loading && !error && data && (
                <div className="space-y-4">
                  <A2UIRenderer messages={data.messages} />

                  {/* Subtle Provenance Strip */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#5F6368]">
                    <span>
                      Rendered via A2UI v{data.version} · Model: {data.modelUsed}
                      {data.fallback ? ' (deterministic fallback)' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => fetchVisualBrief(article, true)}
                      className="inline-flex items-center gap-1 text-[#1967D2] hover:underline cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Regenerate</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
