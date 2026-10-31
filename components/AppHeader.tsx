'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
    <header className="border-b border-[#E4E2DA] bg-[#FFFFFF]/90 backdrop-blur-md sticky top-0 z-30 font-sans">
      <div className="mx-auto px-4 sm:px-6 h-16 flex items-center justify-between max-w-7xl">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            {/* Logo Image */}
            <div className="relative h-6 w-auto shrink-0 flex items-center">
              <img
                src="/logo/speech-to-spec-logo-light.svg"
                alt="Speech to Spec Logo"
                className="h-5 w-auto object-contain"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
              <span className="font-sans text-sm font-semibold tracking-tight text-[#1B1B18]">
                Speech to Spec
              </span>
              <span className="text-[11px] text-[#6B6A63] font-normal hidden sm:inline">
                Voice Requirements Linter
              </span>
            </div>
          </Link>

          {/* Simple Navigation: Workspace, Proof, About */}
          <nav aria-label="Main Navigation" className="flex items-center gap-1 sm:gap-1.5 ml-2">
            <Link
              href="/"
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none ${
                isWorkspace
                  ? 'bg-[#1B1B18] text-white'
                  : 'text-[#6B6A63] hover:text-[#1B1B18] hover:bg-[#F3F2EE]'
              }`}
            >
              Workspace
            </Link>

            <Link
              href="/proof"
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none ${
                isProof
                  ? 'bg-[#1B1B18] text-white'
                  : 'text-[#6B6A63] hover:text-[#1B1B18] hover:bg-[#F3F2EE]'
              }`}
            >
              Proof
            </Link>

            <Link
              href="/about"
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none ${
                isAbout
                  ? 'bg-[#1B1B18] text-white'
                  : 'text-[#6B6A63] hover:text-[#1B1B18] hover:bg-[#F3F2EE]'
              }`}
            >
              About
            </Link>
          </nav>
        </div>

        {/* Right Actions: Recent, Settings Gear */}
        <div className="flex items-center gap-2">
          {onOpenRecent && (
            <button
              type="button"
              onClick={onOpenRecent}
              className="px-3 py-1.5 text-xs text-[#1B1B18] bg-white hover:bg-[#F7F6F3] border border-[#E4E2DA] rounded-full transition-colors flex items-center gap-1.5 font-medium shadow-xs focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none"
              title="View recent sessions stored in this browser"
              aria-label="Open recent sessions drawer"
            >
              <span>Recent</span>
              {recentCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#1B1B18] text-white text-[10px] font-mono flex items-center justify-center">
                  {recentCount}
                </span>
              )}
            </button>
          )}

          {/* Settings Gear Button */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full text-[#6B6A63] hover:text-[#1B1B18] hover:bg-[#F3F2EE] border border-[#E4E2DA] transition-colors relative focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none bg-white shadow-xs"
            title="Open Settings"
            aria-label="Open settings"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {userApiKey && (
              <span
                className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#2563EB] ring-2 ring-white"
                title="Custom Groq API Key active in memory"
              />
            )}
          </button>
        </div>
      </div>

      {/* Stepper sub-nav if provided */}
      {stepperSlot && (
        <div className="border-t border-[#E4E2DA]/80 bg-[#F7F6F3]/70 px-4 sm:px-6 py-2">
          <div className="mx-auto max-w-7xl flex items-center justify-between">
            {stepperSlot}
          </div>
        </div>
      )}
    </header>
  );
}
