'use client';

import { useState } from 'react';

/**
 * Normative FDE Footer per ai-tech-gtm-collateral/references/brand.md §6
 * Resolves footer string from confidentiality x customer matrix.
 */
export function SiteFooter() {
  const [confidentiality, setConfidentiality] = useState<'proprietary' | 'internal' | 'public'>('proprietary');
  const [customer, setCustomer] = useState<string>('');

  const resolveFooterString = () => {
    const cust = customer.trim();
    if (confidentiality === 'public') return 'Google Cloud';
    if (confidentiality === 'internal') {
      return cust ? `Google & ${cust} — Confidential` : 'Google — Internal';
    }
    // proprietary (default)
    return cust
      ? `Prepared for ${cust} · Confidential`
      : 'Google Cloud  |  Proprietary & Confidential';
  };

  return (
    <footer className="mt-auto border-t border-[#DADCE0] bg-white">
      {/* Rainbow 5-stop divider strip */}
      <div className="h-1 w-full fde-gradient-divider" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Bottom-left: Small mono mark + Author attribution */}
        <div className="flex items-center gap-3">
          <img
            src="/brand/logo_mark_mono_dark.png"
            alt="AI Tech Mark"
            className="h-6 w-auto object-contain"
          />
          <div className="text-xs text-[#5F6368]">
            <span className="font-bold text-[#202124] font-display">Sanchit Alekh</span>
            <span className="mx-1.5">·</span>
            <span>Google Cloud AI Tech Group (FDE)</span>
          </div>
        </div>

        {/* Bottom-right: Dynamic Confidentiality Matrix & Customer Swap */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#F8F9FA] border border-[#DADCE0] rounded-md px-2.5 py-1 text-[11px]">
            <span className="text-[#5F6368] font-medium">Mode:</span>
            <select
              value={confidentiality}
              onChange={(e) => setConfidentiality(e.target.value as any)}
              className="bg-transparent text-[#202124] font-semibold focus:outline-none cursor-pointer"
              aria-label="Confidentiality Level"
            >
              <option value="proprietary">Proprietary</option>
              <option value="internal">Internal</option>
              <option value="public">Public</option>
            </select>
          </div>

          {confidentiality !== 'public' && (
            <input
              type="text"
              placeholder="Customer name (optional)..."
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="bg-[#F8F9FA] border border-[#DADCE0] rounded-md px-2.5 py-1 text-[11px] text-[#202124] placeholder:text-[#5F6368] focus:outline-none focus:border-[#4471ED] w-44"
            />
          )}

          <div className="text-xs font-medium text-[#5F6368] tracking-tight pl-2 border-l border-[#DADCE0]">
            {resolveFooterString()}
          </div>
        </div>
      </div>
    </footer>
  );
}
