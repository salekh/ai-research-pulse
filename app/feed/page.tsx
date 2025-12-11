'use client';

import { useEffect, useState } from 'react';
import { NewsFeed } from '@/components/news-feed';
import { Sparkles, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Declare the window.aistudio interface
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function FeedPage() {
  const [hasKey, setHasKey] = useState(false);
  const [checkingKey, setCheckingKey] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkKey() {
      try {
        if (typeof window !== 'undefined' && window.aistudio && window.aistudio.hasSelectedApiKey) {
          const has = await window.aistudio.hasSelectedApiKey();
          setHasKey(has);
        } else {
          setHasKey(true); 
        }
      } catch (e) {
        console.error('Error checking API key:', e);
        setHasKey(true);
      } finally {
        setCheckingKey(false);
      }
    }
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    try {
      if (window.aistudio && window.aistudio.openSelectKey) {
        await window.aistudio.openSelectKey();
        setHasKey(true);
      } else {
        alert('API Key selection is not available in this environment.');
      }
    } catch (e) {
      console.error('Error selecting key:', e);
      setError('Failed to open key selection dialog.');
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600">
        Error: {error}
      </div>
    );
  }

  if (checkingKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-blue-100 rounded-full mb-4"></div>
          <div className="h-4 w-32 bg-gray-100 rounded"></div>
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-[#1F1F1F]">
      {/* Google-style App Bar */}
      <header className="sticky top-0 z-50 bg-[#F8F9FA] border-b border-gray-200/0 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="text-gray-600 rounded-full hover:bg-gray-200">
            <Menu className="w-6 h-6" />
          </Button>
          <div className="flex items-center gap-2">
             {/* Google-style Logo Lockup */}
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-[22px] font-normal text-gray-600 tracking-tight">
              Research <span className="font-medium text-gray-900">Pulse</span>
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!hasKey ? (
            <Button 
              onClick={handleSelectKey}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6"
            >
              Connect API Key
            </Button>
          ) : (
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-medium">
              AI
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        {!hasKey ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-white p-10 rounded-[28px] shadow-sm border border-gray-100 max-w-md w-full">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-normal text-gray-900 mb-3">Unlock AI Insights</h2>
              <p className="text-gray-500 mb-8 leading-relaxed">
                Connect your Google Cloud API key to generate smart summaries and analyze research trends with Gemini 3 Pro.
              </p>
              <Button
                onClick={handleSelectKey}
                className="w-full h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-base shadow-none"
              >
                Select API Key
              </Button>
              <p className="mt-6 text-xs text-gray-400">
                Billing information may be required for some models. 
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-gray-600 ml-1">Learn more</a>
              </p>
            </div>
          </div>
        ) : (
          <NewsFeed />
        )}
      </main>
    </div>
  );
}
