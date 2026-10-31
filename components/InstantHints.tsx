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
    badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
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
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
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
    label: 'Needs Identity',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
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
    label: 'Automatic Action',
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80',
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
        // Regex word boundary matching where applicable
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

  // Conflict heuristic: constraint AND (identity OR automatic)
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
      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-300 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-text">
        {parts.map((part, i) => {
          if (part.toLowerCase() === selectedKeyword.toLowerCase()) {
            return (
              <mark
                key={i}
                className="bg-cyan-500/30 text-cyan-200 border-b-2 border-cyan-400 font-semibold px-0.5 rounded-xs"
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
    <div className="flex flex-col gap-2.5 p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
            Instant hints
          </span>
          <span className="text-[10px] font-mono text-zinc-500">
            (rule-based, not AI analysis)
          </span>
        </div>
        {selectedKeyword && (
          <button
            type="button"
            onClick={() => setSelectedKeyword(null)}
            className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 underline"
          >
            Clear highlight
          </button>
        )}
      </div>

      {/* Row of chips */}
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Detected instant hint keywords">
        {detectedHints.map((hint) => {
          const isSelected = selectedKeyword === hint.keyword;
          return (
            <button
              key={`${hint.category}-${hint.keyword}`}
              type="button"
              onClick={() => handleChipClick(hint.keyword)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono border transition-all ${
                hint.badgeClass
              } ${
                isSelected
                  ? 'ring-2 ring-cyan-400 font-bold scale-105'
                  : 'hover:brightness-125 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none'
              }`}
              title={`Click to highlight "${hint.keyword}" in transcript`}
              aria-pressed={isSelected}
            >
              <span>{hint.keyword}</span>
              <span className="text-[9px] opacity-70 uppercase tracking-tighter">
                [{hint.label}]
              </span>
            </button>
          );
        })}
      </div>

      {/* Conflict heuristic alert */}
      {hasPossibleConflict && (
        <div className="flex items-center gap-2 p-2 rounded bg-amber-950/40 border border-amber-800/60 text-amber-300 font-mono text-[11px]">
          <span className="font-bold">Possible conflict:</span>
          <span>Constraint detected alongside identity/automatic actions. Run Lint to confirm.</span>
        </div>
      )}

      {/* Read-only mirror showing highlights */}
      {selectedKeyword && (
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-[11px] font-mono text-zinc-400">
            Matches for <span className="text-cyan-300 font-semibold">&quot;{selectedKeyword}&quot;</span>:
          </span>
          {renderedMirror}
        </div>
      )}
    </div>
  );
}

