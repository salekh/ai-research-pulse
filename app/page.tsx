'use client';

import { useState } from 'react';

import { NewsFeed } from '@/components/news-feed';
import { Sparkles, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchHero } from '@/components/search-hero';
import { SiteHeader } from '@/components/site-header';

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
          <SiteHeader />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <NewsFeed initialQuery={initialQuery} />
          </div>
        </div>
      )}
    </main>
  );
}
