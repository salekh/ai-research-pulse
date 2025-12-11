'use client';

import { useEffect, useState } from 'react';
import { NewsCard } from './news-card';
import { TrendChart } from './trend-chart';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { RefreshCw, Search, Bookmark, Newspaper, TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Article {
  title: string;
  link: string;
  date: string;
  source: 'Google Research' | 'Google DeepMind' | 'OpenAI' | 'Anthropic' | 'Microsoft Research' | 'Meta AI';
  snippet: string;
}

export function NewsFeed() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [savedArticles, setSavedArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('feed');

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/news');
      if (!res.ok) throw new Error('Failed to fetch news');
      const data = await res.json();
      setArticles(data.articles);
    } catch (err) {
      setError('Failed to load news feeds. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    // Load saved articles from localStorage
    const saved = localStorage.getItem('savedArticles');
    if (saved) {
      try {
        setSavedArticles(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved articles', e);
      }
    }
  }, []);

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
    const matchesSearch = searchQuery 
      ? a.title.toLowerCase().includes(searchQuery.toLowerCase()) || a.snippet.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchesSource && matchesSearch;
  });

  const sources = Array.from(new Set(articles.map(a => a.source)));

  return (
    <div className="space-y-8">
      <Tabs defaultValue="feed" className="w-full" onValueChange={setActiveTab}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <TabsList className="bg-gray-100 p-1 rounded-full">
            <TabsTrigger value="feed" className="rounded-full px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Newspaper className="w-4 h-4 mr-2" /> Feed
            </TabsTrigger>
            <TabsTrigger value="saved" className="rounded-full px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Bookmark className="w-4 h-4 mr-2" /> Saved ({savedArticles.length})
            </TabsTrigger>
            <TabsTrigger value="trends" className="rounded-full px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <TrendingUp className="w-4 h-4 mr-2" /> Trends
            </TabsTrigger>
          </TabsList>

          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input 
              placeholder="Search topics..." 
              className="pl-9 rounded-full bg-white border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value="feed" className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto no-scrollbar mask-linear-fade">
              <Button 
                variant={filter === null ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(null)}
                className={`rounded-full border-none ${filter === null ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                All
              </Button>
              {sources.map(source => (
                <Button
                  key={source}
                  variant={filter === source ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(source)}
                  className={`rounded-full border-none whitespace-nowrap ${filter === source ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {source}
                </Button>
              ))}
            </div>
            
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={fetchNews} 
              disabled={loading}
              className="text-blue-600 hover:bg-blue-50 rounded-full"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl text-center border border-red-100">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-[280px] border border-gray-100 rounded-2xl p-6 space-y-4 bg-white">
                  <div className="flex justify-between">
                    <Skeleton className="h-6 w-24 rounded-md" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-24 w-full" />
                  <div className="flex justify-between pt-4">
                    <Skeleton className="h-8 w-24 rounded-full" />
                    <Skeleton className="h-8 w-24 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredArticles.map((article, index) => (
                <NewsCard 
                  key={`${article.link}-${index}`} 
                  article={article} 
                  onSave={handleSaveArticle}
                  isSaved={savedArticles.some(a => a.link === article.link)}
                />
              ))}
            </div>
          )}
          
          {!loading && filteredArticles.length === 0 && !error && (
            <div className="text-center py-20">
              <div className="bg-gray-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">No articles found</h3>
              <p className="text-gray-500">Try adjusting your search or filters.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="saved">
          {savedArticles.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
              <div className="bg-blue-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Bookmark className="w-6 h-6 text-blue-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">No saved articles yet</h3>
              <p className="text-gray-500 max-w-sm mx-auto mt-2">
                Tap the bookmark icon on any article to save it here for later reading.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedArticles.map((article, index) => (
                <div key={`saved-${index}`} className="relative group">
                  <NewsCard article={article} />
                  <button 
                    onClick={() => handleRemoveArticle(article)}
                    className="absolute top-4 right-4 bg-white/90 p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:bg-red-50"
                    title="Remove from saved"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c0 1 1 2 2 2v2"/></svg>
                  </button>
                </div>
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
      </Tabs>
    </div>
  );
}
