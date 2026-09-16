'use client';

import Link from 'next/link';
import { Cpu } from 'lucide-react';

export function SiteHeader({ onResetView }: { onResetView?: () => void }) {
  return (
    <header className="sticky top-0 z-50 bg-[#202124] text-white border-b border-[#3c4043] shadow-sm">
      {/* Top rainbow accent rule */}
      <div className="h-1 w-full fde-gradient-divider" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: AI Tech Chevron-Diamond Mark + Title */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            onClick={() => onResetView && onResetView()}
            className="flex items-center gap-3 hover:opacity-90 transition-opacity"
          >
            <img
              src="/brand/logo_mark_color.png"
              alt="AI Tech Chevron Mark"
              className="w-8 h-8 object-contain"
            />
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight font-display leading-none text-white">
                Research <span className="text-[#4471ED]">Pulse</span>
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#BABBBC]">
                AI Tech Group · FDE Intelligence
              </span>
            </div>
          </Link>
        </div>

        {/* Right: Active Model Badge + Google Cloud Lockup + Profile */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#303134] border border-[#5F6368]/40 text-xs font-mono text-[#8ab4f8]">
            <Cpu className="w-3.5 h-3.5 text-[#4471ED]" />
            <span>gemini-3.8-flash</span>
          </div>

          <img
            src="/brand/gcloud_lockup_white.png"
            alt="Google Cloud"
            className="h-5 w-auto object-contain hidden md:block opacity-90"
          />

          <div className="w-8 h-8 rounded-full overflow-hidden border border-[#5F6368] ring-2 ring-[#4471ED]/40 shadow-xs">
            <img
              src="/assets/profile.png"
              alt="Sanchit Alekh"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
