'use client';

import { useState } from 'react';

import { NewsFeed } from '@/components/news-feed';
import { Sparkles, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchHero } from '@/components/search-hero';

export default function Home() {
  const [showFeed, setShowFeed] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');

  const handleSearch = (query: string) => {
    setInitialQuery(query);
    setShowFeed(true);
  };

  return (
    <main className="min-h-screen bg-white selection:bg-blue-100">
      {/* Landing View */}
      {!showFeed && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50/40 via-white to-white">
          <SearchHero 
            onSearch={handleSearch} 
            onShowFeed={() => setShowFeed(true)} 
          />
        </div>
      )}

      {/* Feed View */}
      {showFeed && (
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
          <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              <div 
                className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setShowFeed(false)}
              >
                <img 
                  src="/logo.jpg" 
                  alt="Research Pulse" 
                  className="w-8 h-8 rounded-full object-cover"
                />
                <h1 className="text-xl font-medium text-gray-900 tracking-tight">
                  Research <span className="font-medium text-primary">Pulse</span>
                </h1>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full overflow-hidden border border-gray-200 ring-2 ring-white shadow-sm">
                  <img 
                    src="/assets/profile.png" 
                    alt="User Profile" 
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </header>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <NewsFeed initialQuery={initialQuery} />
          </div>
        </div>
      )}
    </main>
  );
}
