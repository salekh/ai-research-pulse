'use client';

import { useState } from 'react';
import { NewsFeed } from '@/components/news-feed';
import { SearchHero } from '@/components/search-hero';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

export default function Home() {
  const [showFeed, setShowFeed] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  const [initialTab, setInitialTab] = useState('feed');

  const handleSearch = (query: string) => {
    setInitialQuery(query);
    setInitialTab('feed');
    setShowFeed(true);
  };

  const handleShowFeed = (tab = 'feed') => {
    setInitialTab(tab);
    setShowFeed(true);
  };

  return (
    <main className="min-h-screen flex flex-col bg-[#F8F9FA] text-[#202124]">
      {!showFeed ? (
        <>
          <SearchHero onSearch={handleSearch} onShowFeed={handleShowFeed} />
          <SiteFooter />
        </>
      ) : (
        <div className="flex flex-col flex-1 animate-in fade-in duration-300">
          <SiteHeader onResetView={() => setShowFeed(false)} />
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
            <NewsFeed initialQuery={initialQuery} initialTab={initialTab} />
          </div>
          <SiteFooter />
        </div>
      )}
    </main>
  );
}
