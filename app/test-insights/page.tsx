'use client';

import { WeeklySummaryCard } from '@/components/weekly-summary-card';

export default function TestPage() {
  const dummyArticle = {
    title: "Test Article",
    link: "https://example.com",
    date: "2025-12-17T00:00:00Z",
    source: "Google Research" as const,
    snippet: "This is a test snippet.",
    tags: []
  };

  return (
    <div className="p-8">
      <h1>Test Page</h1>
      <WeeklySummaryCard
        weekStart="2025-12-15T00:00:00Z"
        weekEnd="2025-12-21T23:59:59Z"
        articles={[dummyArticle]}
      />
    </div>
  );
}
