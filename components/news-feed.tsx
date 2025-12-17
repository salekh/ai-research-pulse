'use client';

import { useEffect, useState } from 'react';
import { NewsCard } from './news-card';
import { TrendChart } from './trend-chart';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { RefreshCw, Search, Bookmark, Newspaper, TrendingUp, ChevronDown, Filter } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InsightsView } from './insights-view';
import { Sparkles } from 'lucide-react';
import { CompanyLogo } from './company-logo';

interface Article {
  title: string;
  link: string;
  date: string;
  source: 'Google Research' | 'Google DeepMind' | 'OpenAI' | 'Anthropic' | 'Microsoft Research' | 'Meta AI';
  snippet: string;
}

export function NewsFeed({ initialQuery = '' }: { initialQuery?: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [savedArticles, setSavedArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState('feed');


  const [timeRange, setTimeRange] = useState('2w');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const timeRangeLabels: Record<string, string> = {
    '2w': '2 Weeks',
    '1m': '1 Month',
    '1y': '1 Year',
    'all': 'All Time',
  };

  useEffect(() => {
    // 1. Load initial data (fast, from DB)
    fetchNews(searchQuery, false, timeRange, 1);

    // 2. Trigger background refresh (slow, scrapes new data)
    // Only do this if we are not searching (i.e. viewing the feed)
    if (!searchQuery) {
      fetchNews(searchQuery, true, timeRange, 1);
    }
  }, []); // Run once on mount

  // When timeRange changes, refetch and reset page
  useEffect(() => {
    setPage(1);
    fetchNews(searchQuery, false, timeRange, 1);
  }, [timeRange]);

  const fetchNews = async (query = '', refresh = false, range = timeRange, pageNum = 1) => {
    if (!refresh && pageNum === 1) setLoading(true); // Only show loading spinner for initial load or explicit search
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      if (refresh) params.append('refresh', 'true');
      if (range) params.append('timeRange', range);
      params.append('page', pageNum.toString());

      const url = `/api/news?${params.toString()}`;
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch news');
      const data = await res.json();
      
      if (pageNum === 1) {
        setArticles(data.articles);
      } else {
        setArticles(prev => [...prev, ...data.articles]);
      }
      setHasMore(data.hasMore);
    } catch (err) {
      console.error(err);
      if (!refresh) setError('Failed to load news feeds. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNews(searchQuery, false, timeRange, nextPage);
  };

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setPage(1);
      fetchNews(searchQuery, false, timeRange, 1);
    }
  };

  // ... existing handlers ...

  // ... inside return ...
  
  // After article grid:
  /*
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {loading && page === 1 ? (
        // ... skeletons ...
      ) : (
        filteredArticles.map(...)
      )}
    </div>
    
    {hasMore && !loading && (
      <div className="flex justify-center mt-8">
        <Button variant="outline" onClick={handleLoadMore} className="rounded-full">
          Load More
        </Button>
      </div>
    )}
  */
  
  // I need to insert the button in the JSX.
  // I'll replace the return block or part of it.
  // The current replacement is for the logic part.
  // I will do a separate replacement for the JSX to be safe.


  const handleSaveArticle = (article: Article) => {
    if (!savedArticles.some(a => a.link === article.link)) {
      const newSaved = [...savedArticles, article];
      setSavedArticles(newSaved);
      localStorage.setItem('savedArticles', JSON.stringify(newSaved));
    }
  };

  const handleRemoveArticle = (article: Article) => {
    const newSaved = savedArticles.filter(a => a.link !== article.link);
    setSavedArticles(newSaved);
    localStorage.setItem('savedArticles', JSON.stringify(newSaved));
  };

  const filteredArticles = articles.filter(a => {
    const matchesSource = filter ? a.source === filter : true;
    return matchesSource;
  });

  const sources = Array.from(new Set(articles.map(a => a.source))).filter(s => s);

  return (
    <div className="space-y-8">
      <Tabs defaultValue="feed" className="w-full" onValueChange={setActiveTab}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <TabsList className="bg-gray-100 p-1 rounded-full">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TabsTrigger 
                  value="feed" 
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-full px-6 transition-all duration-300 flex items-center gap-2"
                >
                  <Newspaper className="w-4 h-4" />
                  Latest News
                  <span className="text-xs opacity-60 ml-1">({timeRangeLabels[timeRange]})</span>
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </TabsTrigger>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setTimeRange('2w')}>
                  Last 2 Weeks
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTimeRange('1m')}>
                  Last 1 Month
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTimeRange('1y')}>
                  Last 1 Year
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTimeRange('all')}>
                  All Time
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <TabsTrigger value="saved" className="rounded-full px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Bookmark className="w-4 h-4 mr-2" /> Saved ({savedArticles.length})
            </TabsTrigger>

            <TabsTrigger 
              value="trends" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-full px-6 transition-all duration-300"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Trends
            </TabsTrigger>

            <TabsTrigger 
              value="insights" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-full px-6 transition-all duration-300"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Insights
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-full px-4 gap-2 border-gray-200">
                  {filter ? (
                    <CompanyLogo company={filter as any} className="w-4 h-4" />
                  ) : (
                    <Filter className="w-4 h-4 text-gray-500" />
                  )}
                  <span className="text-sm text-gray-700">{filter || 'All Labs'}</span>
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setFilter(null)}>
                  All Labs
                </DropdownMenuItem>
                {sources.map(source => (
                  <DropdownMenuItem key={source} onClick={() => setFilter(source)} className="gap-2">
                    <CompanyLogo company={source} className="w-4 h-4" />
                    {source}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search news..."
                className="pl-10 rounded-full border-gray-200 focus:border-primary focus:ring-primary"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearch}
              />
            </div>
          </div>
        </div>

        <TabsContent value="feed" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading && page === 1 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-4">
                  <Skeleton className="h-48 w-full rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))
            ) : (
              filteredArticles.map((article, i) => (
                <NewsCard 
                  key={`${article.link}-${i}`} 
                  article={article}
                  onSave={() => handleSaveArticle(article)}
                  isSaved={savedArticles.some(a => a.link === article.link)}
                />
              ))
            )}
          </div>

          {hasMore && !loading && (
            <div className="flex justify-center mt-8">
              <Button variant="outline" onClick={handleLoadMore} className="rounded-full">
                Load More
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="saved" className="space-y-6">
          {savedArticles.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Bookmark className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No saved articles yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedArticles.map((article, i) => (
                <NewsCard 
                  key={`${article.link}-${i}`} 
                  article={article}
                  onSave={() => handleRemoveArticle(article)}
                  isSaved={true}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="trends">
          <div className="bg-white p-6 rounded-2xl border border-gray-200">
            <div className="mb-6">
              <h2 className="text-xl font-normal text-gray-900">Research Trends</h2>
              <p className="text-gray-500">Top topics analyzed from current research feeds.</p>
            </div>
            <TrendChart articles={articles} />
          </div>
        </TabsContent>

        <TabsContent value="insights">
          <InsightsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
