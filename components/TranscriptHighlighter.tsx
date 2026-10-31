'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import { LintResponseSuccess } from '@/lib/types';
import { normalizeText } from '@/lib/validate';

export interface TranscriptHighlighterProps {
  transcript: string;
  lintResult: LintResponseSuccess;
  activeFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
}

interface SpanMatch {
  findingId: string;
  type: 'sc-earlier' | 'sc-final' | 'c-quoteA' | 'c-quoteB';
  start: number;
  end: number;
}

/**
 * Tokenizes original transcript into words while preserving exact character start/end offsets.
 */
function tokenizeWithOffsets(text: string): Array<{ raw: string; normalized: string; start: number; end: number }> {
  const tokens: Array<{ raw: string; normalized: string; start: number; end: number }> = [];
  // Match word-like sequences
  const regex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const normalized = normalizeText(raw);
    if (normalized) {
      tokens.push({
        raw,
        normalized,
        start: match.index,
        end: match.index + raw.length,
      });
    }
  }

  return tokens;
}

/**
 * Finds exact [start, end] character offsets of quote in original transcript
 * using the same normalization as lib/validate.ts. Returns null if not located.
 */
function locateQuoteOffsets(
  quote: string,
  tokens: Array<{ raw: string; normalized: string; start: number; end: number }>
): { start: number; end: number } | null {
  if (!quote || typeof quote !== 'string') return null;

  const normalizedQuote = normalizeText(quote);
  if (!normalizedQuote) return null;

  const quoteWords = normalizedQuote.split(' ').filter(Boolean);
  if (quoteWords.length === 0 || tokens.length < quoteWords.length) return null;

  for (let i = 0; i <= tokens.length - quoteWords.length; i++) {
    let matches = true;
    for (let j = 0; j < quoteWords.length; j++) {
      if (tokens[i + j].normalized !== quoteWords[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return {
        start: tokens[i].start,
        end: tokens[i + quoteWords.length - 1].end,
      };
    }
  }

  return null;
}

export function TranscriptHighlighter({
  transcript,
  lintResult,
  activeFindingId,
  onSelectFinding,
}: TranscriptHighlighterProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Locate all quotes from self-corrections and contradictions
  const spans = useMemo<SpanMatch[]>(() => {
    if (!transcript) return [];
    const tokens = tokenizeWithOffsets(transcript);
    const result: SpanMatch[] = [];

    // Self-corrections
    if (Array.isArray(lintResult.selfCorrections)) {
      for (const sc of lintResult.selfCorrections) {
        if (sc.earlierQuote) {
          const loc = locateQuoteOffsets(sc.earlierQuote, tokens);
          if (loc) {
            result.push({
              findingId: sc.id,
              type: 'sc-earlier',
              start: loc.start,
              end: loc.end,
            });
          }
        }
        if (sc.finalQuote) {
          const loc = locateQuoteOffsets(sc.finalQuote, tokens);
          if (loc) {
            result.push({
              findingId: sc.id,
              type: 'sc-final',
              start: loc.start,
              end: loc.end,
            });
          }
        }
      }
    }

    // Contradictions
    if (Array.isArray(lintResult.contradictions)) {
      for (const c of lintResult.contradictions) {
        if (c.quoteA) {
          const loc = locateQuoteOffsets(c.quoteA, tokens);
          if (loc) {
            result.push({
              findingId: c.id,
              type: 'c-quoteA',
              start: loc.start,
              end: loc.end,
            });
          }
        }
        if (c.quoteB) {
          const loc = locateQuoteOffsets(c.quoteB, tokens);
          if (loc) {
            result.push({
              findingId: c.id,
              type: 'c-quoteB',
              start: loc.start,
              end: loc.end,
            });
          }
        }
      }
    }

    // Sort by start offset
    result.sort((a, b) => a.start - b.start);

    // Filter out direct collisions / overlapping ranges to prevent broken slicing
    const nonOverlapping: SpanMatch[] = [];
    let lastEnd = -1;
    for (const span of result) {
      if (span.start >= lastEnd) {
        nonOverlapping.push(span);
        lastEnd = span.end;
      }
    }

    return nonOverlapping;
  }, [transcript, lintResult]);

  // Scroll to and pulse active highlight when activeFindingId changes
  useEffect(() => {
    if (!activeFindingId || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-finding-id="${activeFindingId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeFindingId]);

  // Build segmented text array with highlights
  const renderedSegments = useMemo(() => {
    if (!transcript) return null;
    if (spans.length === 0) return <span>{transcript}</span>;

    const elements: React.ReactNode[] = [];
    let currentIndex = 0;

    spans.forEach((span, idx) => {
      // Preceding normal text
      if (span.start > currentIndex) {
        elements.push(
          <span key={`text-${currentIndex}`}>
            {transcript.slice(currentIndex, span.start)}
          </span>
        );
      }

      // Highlighted text
      const segmentText = transcript.slice(span.start, span.end);
      const isActive = activeFindingId === span.findingId;

      let styleClasses = '';
      if (span.type === 'sc-earlier') {
        styleClasses = 'line-through text-zinc-500 bg-zinc-900/90 border-b border-zinc-700';
      } else if (span.type === 'sc-final') {
        styleClasses = 'text-cyan-300 bg-cyan-950/70 border-b-2 border-cyan-400 font-semibold';
      } else if (span.type === 'c-quoteA') {
        styleClasses = 'text-amber-300 bg-amber-950/70 border-b-2 border-amber-400 font-semibold';
      } else if (span.type === 'c-quoteB') {
        styleClasses = 'text-rose-300 bg-rose-950/70 border-b-2 border-rose-400 font-semibold';
      }

      elements.push(
        <mark
          key={`span-${idx}-${span.findingId}`}
          data-finding-id={span.findingId}
          onClick={() => onSelectFinding(span.findingId)}
          className={`cursor-pointer px-1 py-0.5 rounded transition-all select-text ${styleClasses} ${
            isActive ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-zinc-950 animate-pulse' : 'hover:opacity-90'
          }`}
          title={`Click to view finding #${span.findingId}`}
        >
          {segmentText}
        </mark>
      );

      currentIndex = span.end;
    });

    // Trailing text
    if (currentIndex < transcript.length) {
      elements.push(
        <span key={`text-end`}>
          {transcript.slice(currentIndex)}
        </span>
      );
    }

    return elements;
  }, [transcript, spans, activeFindingId, onSelectFinding]);

  return (
    <aside
      aria-label="Transcript viewer with findings highlights"
      className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto"
      ref={containerRef}
    >
      {/* Header and Legend */}
      <div className="flex flex-col gap-2 border-b border-zinc-800 pb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300">
            Transcript Mirror
          </h3>
          <span className="text-[11px] font-mono text-zinc-500">
            {spans.length} highlighted
          </span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono pt-1">
          <span className="text-zinc-500 font-semibold">Legend:</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-400 line-through">
            Earlier statement
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800 text-cyan-300">
            Final revision
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-800 text-amber-300">
            Quote A
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/70 border border-rose-800 text-rose-300">
            Quote B
          </span>
        </div>
      </div>

      {/* Transcript body */}
      <div className="text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">
        {renderedSegments}
      </div>
    </aside>
  );
}

