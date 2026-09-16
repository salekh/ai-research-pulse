'use client';

import { NewsFeed } from '@/components/news-feed';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

export default function FeedPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] text-[#202124]">
      <SiteHeader />
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        <NewsFeed initialTab="feed" />
      </main>
      <SiteFooter />
    </div>
  );
}
