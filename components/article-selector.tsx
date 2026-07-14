"use client"

import { useState, useEffect } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Loader2, Play, Mic, Radio } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { CompanyLogo } from "@/components/company-logo"

interface Article {
  link: string
  title: string
  date: string
  source: string
  snippet: string
}

interface ArticleSelectorProps {
  onGenerate: (selectedArticles: Article[], type: 'overview' | 'podcast') => void
  isGenerating: boolean
}

export function ArticleSelector({ onGenerate, isGenerating }: ArticleSelectorProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        const res = await fetch('/api/news?timeRange=2w&limit=50')
        const data = await res.json()
        setArticles(data.articles)
      } catch (e) {
        console.error("Failed to fetch articles", e)
      } finally {
        setLoading(false)
      }
    }
    fetchArticles()
  }, [])

  const toggleArticle = (link: string) => {
    const newSelected = new Set(selectedLinks)
    if (newSelected.has(link)) {
      newSelected.delete(link)
    } else {
      newSelected.add(link)
    }
    setSelectedLinks(newSelected)
  }

  const selectAll = () => {
    if (selectedLinks.size === articles.length) {
      setSelectedLinks(new Set())
    } else {
      setSelectedLinks(new Set(articles.map(a => a.link)))
    }
  }

  const handleGenerate = (type: 'overview' | 'podcast') => {
    const selected = articles.filter(a => selectedLinks.has(a.link))
    onGenerate(selected, type)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
        <p className="text-xs text-gray-400">Loading articles…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with count + select all */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">Recent Articles</span>
          {selectedLinks.size > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
              {selectedLinks.size} selected
            </span>
          )}
        </div>
        <button onClick={selectAll} className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
          {selectedLinks.size === articles.length ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {/* Article list */}
      <ScrollArea className="h-[340px] rounded-xl border border-gray-100 bg-gray-50/30">
        <div className="p-2 space-y-1">
          {articles.map((article) => {
            const isSelected = selectedLinks.has(article.link)
            return (
              <button
                key={article.link}
                onClick={() => toggleArticle(article.link)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all duration-200 ${
                  isSelected
                    ? 'bg-indigo-50/80 border border-indigo-100 shadow-sm'
                    : 'hover:bg-white hover:shadow-sm border border-transparent'
                }`}
              >
                <Checkbox
                  checked={isSelected}
                  className="mt-0.5 pointer-events-none"
                  tabIndex={-1}
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${isSelected ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                    {article.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <CompanyLogo company={article.source} className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium text-gray-500">{article.source}</span>
                    <span className="text-[10px] text-gray-300">•</span>
                    <span className="text-[10px] text-gray-400">
                      {formatDistanceToNow(new Date(article.date), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>

      {/* Generate buttons */}
      <div className="flex gap-3">
        <Button
          onClick={() => handleGenerate('overview')}
          disabled={selectedLinks.size === 0 || isGenerating}
          className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-sm hover:shadow-md transition-all"
        >
          {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radio className="mr-2 h-4 w-4" />}
          Audio Briefing
        </Button>
        <Button
          onClick={() => handleGenerate('podcast')}
          disabled={selectedLinks.size === 0 || isGenerating}
          className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-sm hover:shadow-md transition-all"
        >
          {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
          Podcast
        </Button>
      </div>
    </div>
  )
}
