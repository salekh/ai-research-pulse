"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"

interface TranscriptViewerProps {
  transcript: string
  title?: string
}

export function TranscriptViewer({ transcript, title = "Transcript" }: TranscriptViewerProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Simple parsing to handle "Speaker: Text" format if present
  const lines = transcript.split('\n').filter(line => line.trim() !== '')

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full space-y-2">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 rounded-md border border-gray-200">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <FileText className="h-4 w-4" />
          {title}
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-9 p-0">
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span className="sr-only">Toggle</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-2">
        <ScrollArea className="h-[300px] w-full rounded-md border border-gray-200 p-4 bg-white">
          <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
            {lines.map((line, index) => {
              const match = line.match(/^([^:]+):(.*)$/)
              if (match) {
                return (
                  <div key={index} className="flex flex-col gap-1">
                    <span className="font-semibold text-gray-900">{match[1]}:</span>
                    <span>{match[2].trim()}</span>
                  </div>
                )
              }
              return <p key={index}>{line}</p>
            })}
          </div>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  )
}
