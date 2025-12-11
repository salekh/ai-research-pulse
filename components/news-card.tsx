'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ExternalLink, Sparkles, Loader2, Bookmark, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

interface Article {
  title: string;
  link: string;
  date: string;
  source: 'Google Research' | 'Google DeepMind' | 'OpenAI' | 'Anthropic' | 'Microsoft Research' | 'Meta AI';
  snippet: string;
}

interface NewsCardProps {
  article: Article;
  onSave?: (article: Article) => void;
  isSaved?: boolean;
}

const sourceColors = {
  'Google Research': 'text-blue-600 bg-blue-50',
  'Google DeepMind': 'text-cyan-700 bg-cyan-50',
  'OpenAI': 'text-green-700 bg-green-50',
  'Anthropic': 'text-purple-700 bg-purple-50',
  'Microsoft Research': 'text-blue-800 bg-blue-50',
  'Meta AI': 'text-blue-600 bg-blue-50',
};

export function NewsCard({ article, onSave, isSaved = false }: NewsCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiOverview, setAiOverview] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [formattedDate, setFormattedDate] = useState<string>('');

  useEffect(() => {
    setFormattedDate(format(new Date(article.date), 'MMM d'));
  }, [article.date]);

  const handleSave = () => {
    if (onSave) {
      onSave(article);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    }
  };

  const handleGenerateOverview = async () => {
    if (aiOverview) {
      setIsExpanded(!isExpanded);
      return;
    }

    setIsGenerating(true);
    setIsExpanded(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' });
      
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Generate a concise, insightful summary (max 3 bullet points) of this AI research article. 
          Title: ${article.title}
          Link: ${article.link}
          Snippet: ${article.snippet}
          
          Focus on the key technical innovation or impact.`,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });
        setAiOverview(response.text || 'Could not generate overview.');
      } catch (innerError: any) {
        // Fallback to flash lite
        console.warn('Gemini 2.5 Flash failed, falling back to Flash Lite:', innerError);
        const response = await ai.models.generateContent({
          model: 'gemini-flash-lite-latest',
          contents: `Generate a concise, insightful summary (max 3 bullet points) of this AI research article. 
          Title: ${article.title}
          Link: ${article.link}
          Snippet: ${article.snippet}
          
          Focus on the key technical innovation or impact.`,
        });
        setAiOverview(response.text || 'Could not generate overview.');
      }

    } catch (error: any) {
      console.error('Gemini API Error:', error);
      let msg = 'Failed to generate overview.';
      if (error.message?.includes('API_KEY_SERVICE_BLOCKED') || error.message?.includes('403')) {
        msg = 'Gemini API is not enabled. Please enable "Generative Language API" in Google Cloud Console.';
      }
      setAiOverview(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="h-full flex flex-col border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden bg-white group">
      <CardHeader className="pb-3 pt-5 px-5">
        <div className="flex justify-between items-start gap-2 mb-3">
          <Badge variant="secondary" className={`font-medium rounded-md px-2 py-0.5 border-none ${sourceColors[article.source] || 'bg-gray-100 text-gray-700'}`}>
            {article.source}
          </Badge>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium min-w-[3rem] text-right">
              {formattedDate}
            </span>
            {onSave && (
              <button 
                onClick={handleSave}
                disabled={isSaved}
                className={`p-1.5 rounded-full transition-colors ${isSaved ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                title={isSaved ? "Saved" : "Save for later"}
              >
                {justSaved || isSaved ? <Check className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
        <CardTitle className="text-lg leading-snug font-normal text-[#1F1F1F]">
          <a href={article.link} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">
            {article.title}
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow px-5 pb-4">
        <p className="text-sm text-[#444746] line-clamp-3 leading-relaxed">
          {article.snippet.replace(/<[^>]*>?/gm, '')}
        </p>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              <div className="bg-[#F0F4F9] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3 text-sm font-medium text-[#1F1F1F]">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  AI Overview
                </div>
                {isGenerating ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing research...
                  </div>
                ) : (
                  <div className="text-sm text-[#444746] space-y-2 prose prose-sm max-w-none prose-p:leading-relaxed prose-li:marker:text-blue-500">
                    <ReactMarkdown>{aiOverview || ''}</ReactMarkdown>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
      <CardFooter className="pt-0 pb-5 px-5 flex justify-between items-center mt-auto">
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-0 hover:px-2 transition-all font-medium h-8"
          asChild
        >
          <a href={article.link} target="_blank" rel="noopener noreferrer">
            Read article <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerateOverview}
          className={`rounded-full border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 h-8 text-xs font-medium ${isExpanded ? 'bg-blue-50 text-blue-700 border-blue-100' : ''}`}
        >
          {isGenerating ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <Sparkles className="w-3 h-3 mr-1 text-blue-500" />
          )}
          {isExpanded ? (aiOverview ? 'Hide' : 'Generating') : 'Summarize'}
        </Button>
      </CardFooter>
    </Card>
  );
}
