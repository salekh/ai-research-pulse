'use client';

import { useState, useEffect } from 'react';
import { Search, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'motion/react';

interface SearchHeroProps {
  onSearch: (query: string) => void;
  onShowFeed: () => void;
}

export function SearchHero({ onSearch, onShowFeed }: SearchHeroProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
  const [mounted, setMounted] = useState(false);

  const placeholders = [
    "Search across Google, OpenAI, Anthropic, and more...",
    "Get AI-powered summaries of the latest research...",
    "Ask about LLM scaling laws or transformer architectures...",
    "Discover emerging trends in Generative AI...",
    "Find papers on reinforcement learning...",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPlaceholder((prev) => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full max-w-4xl mx-auto px-4 animate-in fade-in duration-700 slide-in-from-bottom-4">
      
      {/* Logo / Brand Area */}
      <div className="mb-12 text-center space-y-6">
        <div className="inline-flex items-center justify-center mb-4">
          <img 
            src="/logo.jpg" 
            alt="Research Pulse Logo" 
            className="w-24 h-24 md:w-32 md:h-32 object-contain animate-in zoom-in duration-700"
          />
        </div>
        <h1 className="text-4xl md:text-6xl font-normal text-gray-900 tracking-tight">
          Research <span className="font-medium text-primary">Pulse</span>
        </h1>
        <p className="text-lg text-gray-500 max-w-lg mx-auto font-light">
          Discover the latest breakthroughs in AI, powered by Gemini.
        </p>
      </div>

      {/* Search Bar */}
      <div className={`
        relative w-full max-w-2xl transition-all duration-300 ease-out
        ${isFocused ? 'scale-105 shadow-2xl' : 'shadow-lg hover:shadow-xl'}
      `}>
        <form onSubmit={handleSearch} className="relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className={`w-5 h-5 transition-colors duration-300 ${isFocused ? 'text-primary' : 'text-gray-400'}`} />
          </div>
          <div className="relative w-full">
            <Input
              type="text"
              className="w-full h-16 pl-12 pr-14 text-lg bg-white border-0 rounded-full ring-1 ring-gray-200 focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-transparent"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            {!query && (
              <div className="absolute inset-0 flex items-center pl-12 pointer-events-none overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={placeholders[currentPlaceholder]}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="text-lg text-gray-400 truncate"
                  >
                    {placeholders[currentPlaceholder]}
                  </motion.span>
                </AnimatePresence>
              </div>
            )}
          </div>
          <div className="absolute inset-y-0 right-3 flex items-center">
            <Button 
              type="submit"
              size="icon"
              className={`
                rounded-full w-10 h-10 transition-all duration-300
                ${query.trim() ? 'bg-primary hover:opacity-90 text-white scale-100' : 'bg-transparent text-gray-300 scale-90 pointer-events-none'}
              `}
            >
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </form>
      </div>

      {/* Powered by Gemini Badge */}
      <div className="mt-8 flex items-center gap-2 px-4 py-2 bg-secondary/30 rounded-full border border-secondary/50">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Powered by</span>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-primary">
            Gemini
          </span>
        </div>
      </div>

      {/* Footer / Navigation */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center animate-in fade-in duration-1000 delay-500">
        <Button 
          variant="ghost" 
          onClick={onShowFeed}
          className="text-gray-500 hover:text-gray-900 hover:bg-gray-100/50 rounded-full px-6 gap-2 transition-colors"
        >
          <span className="text-sm font-medium">Explore Full Feed</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
