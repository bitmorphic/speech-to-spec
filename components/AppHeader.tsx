'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSettings } from './SettingsContext';

interface AppHeaderProps {
  onOpenRecent?: () => void;
  recentCount?: number;
  stepperSlot?: React.ReactNode;
}

export function AppHeader({ onOpenRecent, recentCount = 0, stepperSlot }: AppHeaderProps) {
  const pathname = usePathname();
  const { setIsSettingsOpen, userApiKey } = useSettings();

  const isWorkspace = pathname === '/' || pathname === '';
  const isProof = pathname === '/proof';
  const isAbout = pathname === '/about';

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur sticky top-0 z-30 font-sans">
      <div className="mx-auto px-4 sm:px-6 h-14 flex items-center justify-between max-w-7xl">
        {/* Brand & Nav */}
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
          >
            <span className="font-mono text-xs sm:text-sm tracking-tight text-cyan-400 font-bold border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 rounded">
              Speech to Spec
            </span>
          </Link>

          {/* Simple Navigation: Workspace, Proof, About */}
          <nav aria-label="Main Navigation" className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/"
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${
                isWorkspace
                  ? 'bg-zinc-800/80 text-cyan-300 font-semibold border border-zinc-700/60'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              Workspace
            </Link>

            <Link
              href="/proof"
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${
                isProof
                  ? 'bg-zinc-800/80 text-cyan-300 font-semibold border border-zinc-700/60'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              Proof
            </Link>

            <Link
              href="/about"
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${
                isAbout
                  ? 'bg-zinc-800/80 text-cyan-300 font-semibold border border-zinc-700/60'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              About
            </Link>
          </nav>
        </div>

        {/* Right Actions: Recent, Settings Gear */}
        <div className="flex items-center gap-2 sm:gap-3">
          {onOpenRecent && (
            <button
              type="button"
              onClick={onOpenRecent}
              className="px-2.5 py-1 text-xs font-mono text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
              title="View recent sessions stored in this browser"
              aria-label="Open recent sessions drawer"
            >
              <span>Recent</span>
              {recentCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/80 text-[10px] font-bold flex items-center justify-center">
                  {recentCount}
                </span>
              )}
            </button>
          )}

          {/* Settings Gear Button */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition relative focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            title="Open Settings"
            aria-label="Open settings"
          >
            <svg
              className="w-4 h-4 text-zinc-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {userApiKey && (
              <span
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-cyan-400 ring-2 ring-zinc-950"
                title="Custom Groq API Key active in memory"
              />
            )}
          </button>
        </div>
      </div>

      {/* Stepper sub-nav if provided */}
      {stepperSlot && (
        <div className="border-t border-zinc-800/80 bg-zinc-950/60 px-4 sm:px-6 py-2">
          <div className="mx-auto max-w-7xl flex items-center justify-between">
            {stepperSlot}
          </div>
        </div>
      )}
    </header>
  );
}

