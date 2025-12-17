"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

export function SiteHeader() {
  const router = useRouter()

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <a 
          href="/"
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <img 
            src="/logo.jpg" 
            alt="Research Pulse" 
            className="w-8 h-8 object-contain"
          />
          <h1 className="text-xl font-medium text-gray-900 tracking-tight">
            Research Pulse
          </h1>
        </a>
        
        <div className="w-9 h-9 rounded-full overflow-hidden border border-gray-200 ring-2 ring-white shadow-sm">
          <img 
            src="/assets/profile.png" 
            alt="User Profile" 
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </header>
  )
}
