'use client';

import { useEffect, useState } from 'react';
import { NewsCard } from './news-card';
import { TrendChart } from './trend-chart';
import { InsightsView } from './insights-view';
import { SelfImproveView } from './self-improve-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  RefreshCw,
  Search,
  Bookmark,
  Newspaper,
  TrendingUp,
  ChevronDown,
  Filter,
  Sparkles,
  Cpu,
  X,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CompanyLogo } from './company-logo';

interface Article {
  title: string;
  link: string;
  date: string;
  source:
    | 'Google Research'
    | 'Google DeepMind'
    | 'Google Cloud AI'
    | 'OpenAI'
    | 'Anthropic'
    | 'Microsoft Research'
    | 'Meta AI'
    | 'x.AI'
    | 'Chinese Frontier';
  snippet: string;
  tags?: string[];
  score?: number;
  summary?: string;
  keyInnovation?: string;
  significance?: string;
}

const ALL_LABS = [
  'Google DeepMind',
  'Google Research',
  'Google Cloud AI',
  'OpenAI',
  'Anthropic',
  'Meta AI',
  'Microsoft Research',
  'x.AI',
  'Chinese Frontier',
] as const;

export function NewsFeed({
  initialQuery = '',
  initialTab = 'feed',
}: {
  initialQuery?: string;
  initialTab?: string;
}) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [savedArticles, setSavedArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labFilter, setLabFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [timeRange, setTimeRange] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [meta, setMeta] = useState<{ engine?: string; totalIndexed?: number; model?: string }>({});

  const timeRangeLabels: Record<string, string> = {
    '2w': '2 Weeks',
    '1m': '1 Month',
    '1y': '1 Year',
    all: 'All Time',
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem('savedArticles');
      if (stored) setSavedArticles(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    setPage(1);
    fetchNews(searchQuery, false, timeRange, 1, labFilter);
  }, [timeRange, labFilter]);

  const fetchNews = async (
    query = '',
    refresh = false,
    range = timeRange,
    pageNum = 1,
    source = labFilter
  ) => {
    if (refresh) setRefreshing(true);
    else if (pageNum === 1) setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      if (refresh) params.append('refresh', 'true');
      if (range) params.append('timeRange', range);
      if (source) params.append('source', source);
      params.append('page', pageNum.toString());
      params.append('limit', '30');

      const res = await fetch(`/api/news?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch news');
      const data = await res.json();

      if (pageNum === 1) {
        setArticles(data.articles || []);
      } else {
        setArticles((prev) => [...prev, ...(data.articles || [])]);
      }
      setHasMore(Boolean(data.hasMore));
      if (data.meta) setMeta(data.meta);
    } catch (err) {
      console.error(err);
      setError('Failed to load publications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNews(searchQuery, false, timeRange, nextPage, labFilter);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchNews(searchQuery, false, timeRange, 1, labFilter);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setPage(1);
    fetchNews('', false, timeRange, 1, labFilter);
  };

  const handleSaveArticle = (article: Article) => {
    if (!savedArticles.some((a) => a.link === article.link)) {
      const newSaved = [...savedArticles, article];
      setSavedArticles(newSaved);
      localStorage.setItem('savedArticles', JSON.stringify(newSaved));
    }
  };

  const handleRemoveArticle = (article: Article) => {
    const newSaved = savedArticles.filter((a) => a.link !== article.link);
    setSavedArticles(newSaved);
    localStorage.setItem('savedArticles', JSON.stringify(newSaved));
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Top Control Bar */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-[#DADCE0]">
          {/* Navigation Pills */}
          <TabsList className="bg-white border border-[#DADCE0] p-1 rounded-xl flex flex-wrap h-auto gap-1 shadow-xs">
            <TabsTrigger
              value="feed"
              className="data-[state=active]:bg-[#202124] data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer"
            >
              <Newspaper className="w-4 h-4" />
              <span>Research Feed</span>
              {meta.totalIndexed && (
                <span className="text-xs font-mono opacity-75 tabular-nums">
                  ({meta.totalIndexed})
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="trends"
              className="data-[state=active]:bg-[#202124] data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer"
            >
              <TrendingUp className="w-4 h-4" />
              <span>Cross-Lab Trends</span>
            </TabsTrigger>

            <TabsTrigger
              value="insights"
              className="data-[state=active]:bg-[#202124] data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Audio &amp; Podcasts</span>
            </TabsTrigger>

            <TabsTrigger
              value="self-improve"
              className="data-[state=active]:bg-[#4471ED] data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer"
            >
              <Cpu className="w-4 h-4" />
              <span>Self-Improve Engine</span>
            </TabsTrigger>

            <TabsTrigger
              value="saved"
              className="data-[state=active]:bg-[#202124] data-[state=active]:text-white rounded-lg px-3.5 py-2 text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Bookmark className="w-4 h-4" />
              <span>Saved ({savedArticles.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* Filter & Search Bar (shown on Feed tab) */}
          {activeTab === 'feed' && (
            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
              {/* Time Range Selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="rounded-lg h-10 px-3.5 text-sm font-semibold border-[#DADCE0] bg-white text-[#202124] gap-1.5 cursor-pointer"
                  >
                    <span>Range: {timeRangeLabels[timeRange]}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-[#5F6368]" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setTimeRange('all')}>
                    All Time (Complete Corpus)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTimeRange('1y')}>
                    Past 1 Year
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTimeRange('1m')}>
                    Past 1 Month
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTimeRange('2w')}>
                    Past 2 Weeks
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Lab Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="rounded-lg h-10 px-3.5 text-sm font-semibold border-[#DADCE0] bg-white text-[#202124] gap-1.5 cursor-pointer"
                  >
                    {labFilter ? (
                      <CompanyLogo company={labFilter as any} className="w-4 h-4" />
                    ) : (
                      <Filter className="w-4 h-4 text-[#5F6368]" />
                    )}
                    <span>{labFilter || 'All 7 Labs'}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-[#5F6368]" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setLabFilter(null)}>
                    All Frontier Labs
                  </DropdownMenuItem>
                  {ALL_LABS.map((lab) => (
                    <DropdownMenuItem
                      key={lab}
                      onClick={() => setLabFilter(lab)}
                      className="gap-2 text-sm"
                    >
                      <CompanyLogo company={lab} className="w-4 h-4" />
                      <span>{lab}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Search Input */}
              <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5F6368] w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Semantic or keyword search…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 pl-10 pr-8 text-sm rounded-lg border-[#DADCE0] bg-white focus:border-[#4471ED]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5F6368] hover:text-[#202124] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </form>

              {/* Non-blocking Refresh Button */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => fetchNews(searchQuery, true, timeRange, 1, labFilter)}
                disabled={refreshing}
                title="Refresh RSS Feeds (background)"
                className="h-10 w-10 rounded-lg border-[#DADCE0] bg-white hover:border-[#4471ED] cursor-pointer"
              >
                <RefreshCw
                  className={`w-4 h-4 text-[#202124] ${refreshing ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          )}
        </div>

        {/* Active Search / Filter Banner */}
        {activeTab === 'feed' && (searchQuery || labFilter) && (
          <div className="flex items-center justify-between bg-[#E8F0FE] border border-[#4471ED]/30 rounded-lg px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2 text-[#1967D2] font-medium">
              <span>
                Showing results
                {searchQuery ? ` matching "${searchQuery}"` : ''}
                {labFilter ? ` from ${labFilter}` : ''}
              </span>
              <span className="font-mono font-bold tabular-nums">
                ({articles.length} papers)
              </span>
            </div>
            <button
              onClick={() => {
                setSearchQuery('');
                setLabFilter(null);
                fetchNews('', false, timeRange, 1, null);
              }}
              className="text-xs font-semibold text-[#1967D2] hover:underline cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        )}

        {/* TAB 1: Research Feed */}
        <TabsContent value="feed" className="space-y-6 mt-4">
          {error && (
            <div className="bg-[#FCE8E6] border border-[#EA4335]/30 text-[#C5221F] rounded-lg p-4 text-xs font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {loading && page === 1
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-3 bg-white border border-[#DADCE0] rounded-xl p-5">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ))
              : articles.map((article, i) => (
                  <NewsCard
                    key={`${article.link}-${i}`}
                    article={article}
                    onSave={() => handleSaveArticle(article)}
                    isSaved={savedArticles.some((a) => a.link === article.link)}
                  />
                ))}
          </div>

          {hasMore && !loading && (
            <div className="flex justify-center pt-6">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                className="rounded-lg px-6 py-2.5 text-xs font-bold border-[#DADCE0] bg-white hover:border-[#4471ED] text-[#202124] cursor-pointer"
              >
                Load More Publications
              </Button>
            </div>
          )}
        </TabsContent>

        {/* TAB 2: Cross-Lab Trends */}
        <TabsContent value="trends" className="mt-4">
          <TrendChart articles={articles} />
        </TabsContent>

        {/* TAB 3: Audio & Podcasts */}
        <TabsContent value="insights" className="mt-4">
          <InsightsView />
        </TabsContent>

        {/* TAB 4: Recursive Self-Improvement Engine */}
        <TabsContent value="self-improve" className="mt-4">
          <SelfImproveView />
        </TabsContent>

        {/* TAB 5: Saved Bookmarks */}
        <TabsContent value="saved" className="space-y-6 mt-4">
          {savedArticles.length === 0 ? (
            <div className="text-center py-16 bg-white border border-[#DADCE0] rounded-xl text-[#5F6368]">
              <Bookmark className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold text-[#202124]">No saved publications yet</p>
              <p className="text-xs mt-1">
                Click the bookmark icon on any research card to save it here for offline review.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
      </Tabs>
    </div>
  );
}
