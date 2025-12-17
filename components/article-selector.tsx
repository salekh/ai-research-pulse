"use client"

import { useState, useEffect } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Play, FileAudio } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

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

  const handleGenerate = (type: 'overview' | 'podcast') => {
    const selected = articles.filter(a => selectedLinks.has(a.link))
    onGenerate(selected, type)
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Select Articles for Insights</h2>
        <span className="text-sm text-muted-foreground">{selectedLinks.size} selected</span>
      </div>

      <ScrollArea className="h-[400px] rounded-md border p-4">
        <div className="space-y-4">
          {articles.map((article) => (
            <div key={article.link} className="flex items-start space-x-3 p-2 hover:bg-accent rounded-lg transition-colors">
              <Checkbox 
                id={article.link} 
                checked={selectedLinks.has(article.link)}
                onCheckedChange={() => toggleArticle(article.link)}
                className="mt-1"
              />
              <div className="grid gap-1.5 leading-none w-full">
                <label
                  htmlFor={article.link}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {article.title}
                </label>
                <p className="text-xs text-muted-foreground">
                  {article.source} • {formatDistanceToNow(new Date(article.date), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="flex gap-4">
        <Button 
          onClick={() => handleGenerate('overview')} 
          disabled={selectedLinks.size === 0 || isGenerating}
          className="flex-1"
        >
          {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Generate Audio Overview
        </Button>
        <Button 
          onClick={() => handleGenerate('podcast')} 
          disabled={selectedLinks.size === 0 || isGenerating}
          variant="secondary"
          className="flex-1"
        >
          {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileAudio className="mr-2 h-4 w-4" />}
          Generate Podcast
        </Button>
      </div>
    </div>
  )
}
