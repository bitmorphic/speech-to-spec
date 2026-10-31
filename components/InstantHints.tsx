'use client';

import React, { useState, useEffect, useMemo } from 'react';

export interface InstantHintsProps {
  transcript: string;
}

interface KeywordGroup {
  category: 'revision' | 'constraint' | 'identity' | 'automatic';
  label: string;
  badgeClass: string;
  keywords: string[];
}

const KEYWORD_GROUPS: KeywordGroup[] = [
  {
    category: 'revision',
    label: 'Revision',
    badgeClass: 'bg-[#F3F2EE] text-[#6B6A63] border-[#E4E2DA]',
    keywords: [
      'actually',
      'no wait',
      'scratch that',
      'on second thought',
      'forget that',
      'instead',
    ],
  },
  {
    category: 'constraint',
    label: 'Constraint',
    badgeClass: 'bg-[#F3F2EE] text-[#1B1B18] border-[#E4E2DA]',
    keywords: [
      'no login',
      'no signup',
      'offline',
      'browser only',
      'no database',
      'no server',
      'no backend',
      'free',
      'no payments',
    ],
  },
  {
    category: 'identity',
    label: 'Needs identity',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200/80',
    keywords: [
      'my own',
      'their own',
      'history',
      'private',
      'admin',
      'account',
    ],
  },
  {
    category: 'automatic',
    label: 'Automatic action',
    badgeClass: 'bg-stone-100 text-[#1B1B18] border-[#E4E2DA]',
    keywords: [
      'reminder',
      'notification',
      'email',
      'sms',
      'whatsapp',
    ],
  },
];

interface DetectedHint {
  keyword: string;
  category: KeywordGroup['category'];
  label: string;
  badgeClass: string;
}

export function InstantHints({ transcript }: InstantHintsProps) {
  const [debouncedText, setDebouncedText] = useState(transcript);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);

  // Debounce transcript typing for rule matching
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(transcript);
    }, 150);
    return () => clearTimeout(timer);
  }, [transcript]);

  // Scan text for rule-based keywords
  const detectedHints = useMemo<DetectedHint[]>(() => {
    if (!debouncedText || debouncedText.trim().length === 0) {
      return [];
    }

    const lower = debouncedText.toLowerCase();
    const hints: DetectedHint[] = [];

    for (const group of KEYWORD_GROUPS) {
      for (const kw of group.keywords) {
        const regex = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (regex.test(lower)) {
          hints.push({
            keyword: kw,
            category: group.category,
            label: group.label,
            badgeClass: group.badgeClass,
          });
        }
      }
    }

    return hints;
  }, [debouncedText]);

  const hasConstraint = detectedHints.some((h) => h.category === 'constraint');
  const hasIdentityOrAutomatic = detectedHints.some(
    (h) => h.category === 'identity' || h.category === 'automatic'
  );
  const hasPossibleConflict = hasConstraint && hasIdentityOrAutomatic;

  // Toggle highlight selection
  const handleChipClick = (keyword: string) => {
    setSelectedKeyword((prev) => (prev === keyword ? null : keyword));
  };

  // Render read-only mirror of text with matched keyword highlighted
  const renderedMirror = useMemo(() => {
    if (!selectedKeyword || !transcript) return null;

    const regex = new RegExp(`(\\b${selectedKeyword.replace(/\s+/g, '\\s+')}\\b)`, 'gi');
    const parts = transcript.split(regex);

    return (
      <div className="p-3.5 bg-white border border-[#E4E2DA] rounded-[16px] text-xs font-mono text-[#1B1B18] leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-text shadow-xs">
        {parts.map((part, i) => {
          if (part.toLowerCase() === selectedKeyword.toLowerCase()) {
            return (
              <mark
                key={i}
                className="bg-amber-100 text-amber-900 border-b-2 border-amber-400 font-medium px-0.5 rounded-xs"
              >
                {part}
              </mark>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
    );
  }, [selectedKeyword, transcript]);

  if (detectedHints.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 pt-1 font-sans text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[#6B6A63]">
          <span className="text-[11px] font-medium text-[#1B1B18]">
            Instant hints
          </span>
          <span className="text-[11px] text-[#6B6A63]">
            (rule-based, not AI analysis)
          </span>
        </div>
        {selectedKeyword && (
          <button
            type="button"
            onClick={() => setSelectedKeyword(null)}
            className="text-[11px] text-[#6B6A63] hover:text-[#1B1B18] underline transition"
          >
            Clear highlight
          </button>
        )}
      </div>

      {/* Row of smaller, quieter chips */}
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Detected instant hint keywords">
        {detectedHints.map((hint) => {
          const isSelected = selectedKeyword === hint.keyword;
          return (
            <button
              key={`${hint.category}-${hint.keyword}`}
              type="button"
              onClick={() => handleChipClick(hint.keyword)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-sans border transition-all ${
                hint.badgeClass
              } ${
                isSelected
                  ? 'ring-2 ring-[#2563EB] font-medium'
                  : 'hover:bg-white focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none'
              }`}
              title={`Click to highlight "${hint.keyword}" in transcript`}
              aria-pressed={isSelected}
            >
              <span className="font-medium text-[#1B1B18]">{hint.keyword}</span>
              <span className="text-[10px] text-[#6B6A63]">
                · {hint.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Conflict heuristic alert */}
      {hasPossibleConflict && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-[11px] font-sans mt-1">
          <span className="font-semibold">Possible conflict:</span>
          <span>Constraint detected alongside identity or automatic actions. Run Lint to confirm.</span>
        </div>
      )}

      {/* Read-only mirror showing highlights */}
      {selectedKeyword && (
        <div className="flex flex-col gap-1.5 pt-2">
          <span className="text-[11px] text-[#6B6A63] font-sans">
            Matches for <strong className="text-[#1B1B18]">&quot;{selectedKeyword}&quot;</strong>:
          </span>
          {renderedMirror}
        </div>
      )}
    </div>
  );
}
