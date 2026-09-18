'use client';

import { useState, useEffect } from 'react';
import { Search, Sparkles, ArrowRight, Cpu, TrendingUp, Shuffle, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'motion/react';

interface SearchHeroProps {
  onSearch: (query: string) => void;
  onShowFeed: (tab?: string) => void;
}

export function SearchHero({ onSearch, onShowFeed }: SearchHeroProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
  const [mounted, setMounted] = useState(false);

  const placeholders = [
    'Search across DeepMind, Google Cloud AI, OpenAI, Anthropic, Chinese Frontier (DeepSeek/Qwen/Kimi/GLM)…',
    'Ask about test-time compute, RLHF, or agentic harnesses…',
    'Find breakthroughs in mechanistic interpretability & safety…',
    'Explore multimodal video world models and scientific benchmarks…',
  ];

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setCurrentPlaceholder((prev) => (prev + 1) % placeholders.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    } else {
      onShowFeed('feed');
    }
  };

  if (!mounted) return null;

  return (
    <div
      className="relative min-h-[88vh] w-full flex flex-col justify-between overflow-hidden bg-[#202124] text-white"
      style={{
        backgroundImage: `url('/brand/bg_dark_aurora.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Oversized cropped mark motif (brand.md §8: top-right ~35% of slide, 45% opacity, max 1 per view) */}
      <img
        src="/brand/logo_motif_crop.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute -right-24 -top-12 w-[460px] md:w-[620px] opacity-45 object-contain"
      />

      {/* Top Co-branding Bar (brand.md §7.3 Layout A) */}
      <div className="relative z-10 max-w-7xl mx-auto w-full px-6 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/brand/logo_mark_color.png"
            alt="AI Tech Chevron Mark"
            className="h-10 w-auto object-contain"
          />
          <div className="flex flex-col">
            <span className="text-xs font-mono uppercase tracking-widest text-[#4471ED] font-bold">
              Google Cloud · AI Tech Group
            </span>
            <span className="text-sm text-[#BABBBC] font-medium">
              Frontier Research Intelligence Platform
            </span>
          </div>
        </div>

        <img
          src="/brand/gcloud_lockup_white.png"
          alt="Google Cloud"
          className="h-7 w-auto object-contain opacity-95"
        />
      </div>

      {/* Centre Hero Content */}
      <div className="relative z-10 max-w-4xl mx-auto w-full px-6 my-auto py-12 text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/8 border border-white/15 backdrop-blur-md text-xs font-mono text-[#8ab4f8]">
          <Cpu className="w-3.5 h-3.5 text-[#4471ED]" />
          <span>Powered by Google Gemini 3.8 Flash &amp; Hybrid Vector Search</span>
        </div>

        <div className="space-y-4">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight font-display text-white leading-[1.05]">
            AI Research <span className="text-[#4471ED]">Pulse</span>
          </h1>
          <p className="text-lg md:text-xl text-[#BABBBC] max-w-2xl mx-auto font-normal leading-relaxed">
            Real-time technical publication synthesis, cross-lab convergence matrices, and recursive
            self-improving intelligence across 9 frontier AI laboratories &amp; research ecosystems.
          </p>
        </div>

        {/* Search Input */}
        <div
          className={`relative w-full max-w-2xl mx-auto transition-all duration-300 ${
            isFocused ? 'scale-[1.02]' : ''
          }`}
        >
          <form onSubmit={handleSearch} className="relative">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
              <Search
                className={`w-5 h-5 transition-colors ${
                  isFocused ? 'text-[#4471ED]' : 'text-[#BABBBC]'
                }`}
              />
            </div>
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className="w-full h-16 pl-14 pr-32 text-base md:text-lg bg-[#303134]/95 text-white border border-[#5F6368]/60 rounded-2xl focus:border-[#4471ED] focus:ring-2 focus:ring-[#4471ED]/30 shadow-2xl placeholder:text-transparent"
            />
            {!query && (
              <div className="absolute inset-y-0 left-14 right-32 flex items-center pointer-events-none overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={placeholders[currentPlaceholder]}
                    initial={{ y: 15, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -15, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="text-sm md:text-base text-[#BABBBC] truncate"
                  >
                    {placeholders[currentPlaceholder]}
                  </motion.span>
                </AnimatePresence>
              </div>
            )}
            <div className="absolute inset-y-0 right-2.5 flex items-center">
              <Button
                type="submit"
                className="h-11 px-5 rounded-xl bg-[#4471ED] hover:bg-[#335cd6] text-white font-semibold text-sm flex items-center gap-2 shadow-md cursor-pointer"
              >
                <span>Search</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </div>

        {/* Quick Topic Pills & Navigation Actions */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          {[
            'Agentic Harnesses',
            'Test-Time Compute',
            'Mechanistic Interpretability',
            'Video World Models',
            'AI for Science',
          ].map((topic) => (
            <button
              key={topic}
              onClick={() => onSearch(topic)}
              className="px-4 py-2 rounded-full text-sm font-medium bg-white/8 hover:bg-[#4471ED]/30 hover:border-[#4471ED] text-[#E8EAED] border border-white/12 transition-all cursor-pointer"
            >
              {topic}
            </button>
          ))}
        </div>

        {/* Primary CTA Strip */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Button
            onClick={() => onShowFeed('feed')}
            className="h-12 px-7 rounded-xl bg-white text-[#202124] hover:bg-[#F8F9FA] font-bold text-base shadow-lg flex items-center gap-2.5 cursor-pointer"
          >
            <Layers className="w-4 h-4 text-[#4471ED]" />
            <span>Explore Research Feed</span>
          </Button>

          <Button
            onClick={() => onShowFeed('trends')}
            variant="outline"
            className="h-12 px-6 rounded-xl bg-white/10 hover:bg-white/15 text-white border-white/20 font-semibold text-base flex items-center gap-2 cursor-pointer"
          >
            <TrendingUp className="w-4 h-4 text-[#8ab4f8]" />
            <span>Cross-Lab Trends</span>
          </Button>

          <Button
            onClick={() => onShowFeed('self-improve')}
            variant="outline"
            className="h-12 px-6 rounded-xl bg-white/10 hover:bg-white/15 text-white border-white/20 font-semibold text-base flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-[#FBBC04]" />
            <span>Self-Improve Engine</span>
          </Button>

          <Button
            onClick={() => (window.location.href = '/api/lucky')}
            variant="ghost"
            className="h-12 px-5 rounded-xl text-[#BABBBC] hover:text-white hover:bg-white/8 font-medium text-base flex items-center gap-2 cursor-pointer"
          >
            <Shuffle className="w-4 h-4" />
            <span>I&apos;m Feeling Lucky</span>
          </Button>
        </div>
      </div>

      {/* Bottom Executive Briefing Stat Strip (techdoc.css .stats style with tabular-nums) */}
      <div className="relative z-10 border-t border-white/15 bg-[#202124]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <div className="text-2xl md:text-3xl font-bold text-[#4471ED] font-display tabular-nums">
              2,482
            </div>
            <div className="text-sm text-[#BABBBC] mt-0.5">
              Technical Papers Indexed (888 from 2026)
            </div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-white font-display tabular-nums">
              11-Nines
            </div>
            <div className="text-sm text-[#BABBBC] mt-0.5">
              Zero-Loss GCS Archive + Cloud SQL + SQLite
            </div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-[#34A853] font-mono tabular-nums">
              gemini-3.8-flash
            </div>
            <div className="text-sm text-[#BABBBC] mt-0.5">
              Primary Reasoning &amp; Synthesis Model
            </div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-[#FBBC04] font-display tabular-nums">
              100%
            </div>
            <div className="text-sm text-[#BABBBC] mt-0.5">
              768-Dim Vector Embedding &amp; Tag Coverage
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
