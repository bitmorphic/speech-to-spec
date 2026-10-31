'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import { LintResponseSuccess } from '@/lib/types';
import { normalizeText } from '@/lib/validate';

export interface TranscriptHighlighterProps {
  transcript: string;
  lintResult: LintResponseSuccess;
  activeFindingId: string | null;
  onSelectFinding?: (findingId: string) => void;
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
        styleClasses = 'line-through text-[#6B6A63] bg-[#F3F2EE] px-1 py-0.5 rounded';
      } else if (span.type === 'sc-final') {
        // Sage tint for final revision
        styleClasses = 'text-[#166534] bg-[#DCFCE7]/90 border-b-2 border-[#16A34A] font-medium px-1 py-0.5 rounded';
      } else if (span.type === 'c-quoteA') {
        // Amber tint for quote A
        styleClasses = 'text-[#92400E] bg-[#FEF3C7]/90 border-b-2 border-[#F59E0B] font-medium px-1 py-0.5 rounded';
      } else if (span.type === 'c-quoteB') {
        // Rose tint for quote B
        styleClasses = 'text-[#991B1B] bg-[#FEE2E2]/90 border-b-2 border-[#EF4444] font-medium px-1 py-0.5 rounded';
      }

      elements.push(
        <mark
          key={`span-${idx}-${span.findingId}`}
          data-finding-id={span.findingId}
          onClick={() => onSelectFinding?.(span.findingId)}
          className={`cursor-pointer transition-all select-text focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none ${styleClasses} ${
            isActive
              ? 'ring-2 ring-[#2563EB] ring-offset-2 ring-offset-white'
              : 'hover:opacity-90'
          }`}
          title={`Click to view finding #${span.findingId}`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectFinding?.(span.findingId);
            }
          }}
        >
          {segmentText}
        </mark>
      );

      currentIndex = span.end;
    });

    // Trailing remaining text
    if (currentIndex < transcript.length) {
      elements.push(
        <span key={`text-${currentIndex}`}>
          {transcript.slice(currentIndex)}
        </span>
      );
    }

    return elements;
  }, [transcript, spans, activeFindingId, onSelectFinding]);

  return (
    <div className="flex flex-col gap-4 font-sans text-[#1B1B18]">
      {/* Transcript Content Box */}
      <div
        ref={containerRef}
        tabIndex={0}
        aria-label="Annotated Transcript"
        className="p-6 sm:p-7 rounded-[16px] border border-[#E4E2DA] bg-white text-sm sm:text-base leading-relaxed text-[#1B1B18] font-sans shadow-xs focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none"
      >
        <p className="whitespace-pre-wrap selection:bg-[#F3F2EE]">{renderedSegments}</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 p-3 rounded-[16px] bg-[#F7F6F3] border border-[#E4E2DA] text-xs font-sans">
        <span className="text-[#6B6A63] font-medium">Highlight legend:</span>

        <div className="flex items-center gap-1.5">
          <span className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-[#FEF3C7] text-[#92400E] border-b-2 border-[#F59E0B] font-medium">
            Quote A
          </span>
          <span className="text-[#6B6A63]">Amber conflict</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-[#FEE2E2] text-[#991B1B] border-b-2 border-[#EF4444] font-medium">
            Quote B
          </span>
          <span className="text-[#6B6A63]">Rose conflict</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-[#DCFCE7] text-[#166534] border-b-2 border-[#16A34A] font-medium">
            Final revision
          </span>
          <span className="text-[#6B6A63]">Sage won</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-[#F3F2EE] text-[#6B6A63] line-through">
            Earlier statement
          </span>
          <span className="text-[#6B6A63]">Superseded</span>
        </div>
      </div>
    </div>
  );
}
