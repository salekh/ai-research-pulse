'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GoogleGenAI } from '@google/genai';
import { useEffect, useState } from 'react';
import { Loader2, Sparkles, RefreshCw } from 'lucide-react';

interface Article {
  title: string;
  snippet: string;
}

interface TrendData {
  name: string;
  value: number;
}

export function TrendChart({ articles }: { articles: Article[] }) {
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const analyzeTrends = async () => {
    if (articles.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' });
      
      // Prepare a concise list of titles for analysis
      const contentSummary = articles.slice(0, 30).map(a => `- ${a.title}`).join('\n');
      const prompt = `Analyze these AI research titles and identify the top 5 trending technical topics or keywords. 
        Return ONLY a JSON array of objects with 'name' (topic) and 'value' (estimated relevance/frequency score from 1-100).
        
        Titles:
        ${contentSummary}`;

      let text = '';

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          }
        });
        text = response.text || '';
      } catch (innerError) {
        console.warn('Gemini 3 Pro failed for trends, falling back to Flash 2.5:', innerError);
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          }
        });
        text = response.text || '';
      }

      if (text) {
        const data = JSON.parse(text);
        setTrends(data);
        setAnalyzed(true);
      }
    } catch (err: any) {
      console.error('Trend analysis failed:', err);
      let msg = 'Failed to analyze trends.';
      if (err.message?.includes('API_KEY_SERVICE_BLOCKED') || err.message?.includes('403')) {
        msg = 'Gemini API is not enabled for this API Key. Please enable the "Generative Language API" in your Google Cloud Console.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Google Brand Colors for the chart
  const COLORS = ['#4285F4', '#DB4437', '#F4B400', '#0F9D58', '#AB47BC'];

  if (!isMounted) {
    return (
      <Card className="border-none shadow-sm mb-6 h-[250px] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-none shadow-none bg-red-50/50">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-red-600 mb-4 px-4">{error}</p>
          <button 
            onClick={analyzeTrends}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 rounded-full shadow-sm hover:shadow-md transition-all text-sm font-medium text-red-600"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!analyzed && !loading) {
    return (
      <Card className="border-none shadow-none bg-blue-50/50">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <p className="text-sm text-gray-600 mb-4 text-center">
            Discover what's trending across all research labs.
          </p>
          <button 
            onClick={analyzeTrends}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full shadow-sm hover:shadow-md transition-all text-sm font-medium text-blue-600"
          >
            <Sparkles className="w-4 h-4" />
            Analyze Trends with Gemini
          </button>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="border-none shadow-none bg-transparent">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
          <p className="text-sm text-gray-500">Analyzing research patterns...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-sm mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-normal flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-500" />
          Trending Topics
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trends} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
            <XAxis type="number" hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              width={100} 
              tick={{ fontSize: 12, fill: '#444746' }} 
              axisLine={false}
              tickLine={false}
            />
            <Tooltip 
              cursor={{ fill: 'transparent' }}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
              {trends.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
