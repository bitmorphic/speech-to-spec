'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LintResponseSuccess, SpecResponseSuccess, TestCase } from '@/lib/types';
import { BuildPack } from './BuildPack';
import { compressSessionForUrl } from '@/lib/session-storage';
import { TestCasesViewer } from './TestCasesViewer';
import { DiagramsViewer } from './DiagramsViewer';
import { SpecDiffViewer } from './SpecDiffViewer';

export interface AnswerConflict {
  questionIds: string[];
  description: string;
  suggestedFix: string;
}

export interface QuestionReference {
  id: string;
  question: string;
}

export interface SpecViewerProps {
  specMarkdown: string;
  transcript?: string;
  lintResult?: LintResponseSuccess | null;
  answers?: Record<string, { text: string; youDecide: boolean }>;
  specResult?: SpecResponseSuccess | null;
  answerConflicts?: AnswerConflict[];
  questions?: QuestionReference[];
  onBackToFindings?: () => void;
  onStartOver?: () => void;
  onGenerateAnyway?: () => void;
  showConflictsWarning?: boolean;
  isReadOnlyReport?: boolean;
  onImportSession?: (session: {
    transcript: string;
    lintResult: LintResponseSuccess;
    answers: Record<string, { text: string; youDecide: boolean }>;
    specResult: SpecResponseSuccess;
  }) => void;
  onExitReadOnly?: () => void;
  previousSpecMarkdown?: string | null;
  testCases?: TestCase[] | null;
  isLoadingTestCases?: boolean;
  onGenerateTestCases?: () => void;
  testCasesError?: string | null;
  diagrams?: { flowchart: string; erDiagram: string } | null;
  isLoadingDiagrams?: boolean;
  onGenerateDiagrams?: () => void;
  diagramsError?: string | null;
}

interface TocItem {
  id: string;
  text: string;
  level: 1 | 2;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Helper to render color-coded badge if text contains decision labels:
 * "stated", "answered", or "assumed" / "assume".
 */
function renderDecisionSourceCell(content: React.ReactNode): React.ReactNode {
  if (typeof content !== 'string') {
    // If it's an array or nested, try to extract string
    const stringified = React.Children.toArray(content)
      .map((child) => (typeof child === 'string' ? child : ''))
      .join(' ')
      .trim();
    if (!stringified) return content;
    return renderDecisionSourceBadge(stringified);
  }

  return renderDecisionSourceBadge(content);
}

function renderDecisionSourceBadge(text: string): React.ReactNode {
  const lower = text.toLowerCase();

  const isStated = lower.includes('stated');
  const isAnswered = lower.includes('answered') || lower.includes('answer');
  const isAssumed = lower.includes('assumed') || lower.includes('assume') || lower.includes('assumption');

  if (!isStated && !isAnswered && !isAssumed) {
    return text;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isStated && (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase tracking-wider bg-emerald-950/80 text-emerald-300 border border-emerald-700/80">
          Stated
        </span>
      )}
      {isAnswered && (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase tracking-wider bg-cyan-950/80 text-cyan-300 border border-cyan-700/80">
          Answered
        </span>
      )}
      {isAssumed && (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase tracking-wider bg-amber-950/80 text-amber-300 border border-amber-700/80">
          Assumed
        </span>
      )}
      {/* If there was extra text beyond the label, show it muted */}
      {(() => {
        const clean = text
          .replace(/stated/gi, '')
          .replace(/answered/gi, '')
          .replace(/answer\s+[a-z0-9_-]+/gi, '')
          .replace(/assumed/gi, '')
          .replace(/assumption/gi, '')
          .replace(/assume/gi, '')
          .replace(/^[-\s(),]+|[-\s(),]+$/g, '')
          .trim();
        return clean ? <span className="text-[11px] text-zinc-400 font-sans">{clean}</span> : null;
      })()}
    </div>
  );
}

function InteractiveTaskCheckbox({ defaultChecked }: { defaultChecked?: boolean }) {
  const [checked, setChecked] = useState<boolean>(defaultChecked ?? false);
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => setChecked((prev) => !prev)}
      className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0 cursor-pointer transition shrink-0 mt-0.5 accent-cyan-500"
    />
  );
}

export function SpecViewer({
  specMarkdown,
  transcript = '',
  lintResult = null,
  answers = {},
  specResult = null,
  answerConflicts = [],
  questions = [],
  onBackToFindings,
  onStartOver,
  onGenerateAnyway,
  showConflictsWarning: initialShowConflicts = true,
  isReadOnlyReport = false,
  onImportSession,
  onExitReadOnly,
  previousSpecMarkdown = null,
  testCases = null,
  isLoadingTestCases = false,
  onGenerateTestCases,
  testCasesError = null,
  diagrams = null,
  isLoadingDiagrams = false,
  onGenerateDiagrams,
  diagramsError = null,
}: SpecViewerProps) {
  const [showConflicts, setShowConflicts] = useState<boolean>(initialShowConflicts);
  const [expandedConflicts, setExpandedConflicts] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<boolean>(false);
  const [shareCopied, setShareCopied] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');
  const [isMobileTocOpen, setIsMobileTocOpen] = useState<boolean>(false);
  const [activeMainTab, setActiveMainTab] = useState<'spec' | 'test-cases' | 'diagrams'>('spec');
  const [showDiff, setShowDiff] = useState<boolean>(false);

  const copyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const shareTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync conflicts warning display state if prop changes
  useEffect(() => {
    setShowConflicts(initialShowConflicts);
  }, [initialShowConflicts]);

  // Map question IDs to question text
  const questionMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of questions) {
      map.set(q.id, q.question);
    }
    return map;
  }, [questions]);

  // Extract H1 and H2 headings for Table of Contents
  const tocItems = useMemo<TocItem[]>(() => {
    const lines = specMarkdown.split('\n');
    const items: TocItem[] = [];
    let inCodeBlock = false;

    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        const title = trimmed.replace(/^#\s+/, '').trim();
        // Skip # Known Conflicts if we already render conflicts in the panel
        if (title.toLowerCase() !== 'known conflicts') {
          items.push({
            id: slugify(title),
            text: title,
            level: 1,
          });
        }
      } else if (trimmed.startsWith('## ')) {
        const title = trimmed.replace(/^##\s+/, '').trim();
        items.push({
          id: slugify(title),
          text: title,
          level: 2,
        });
      }
    }

    return items;
  }, [specMarkdown]);

  // IntersectionObserver to highlight section currently in view
  useEffect(() => {
    if (typeof window === 'undefined' || tocItems.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveHeadingId(entry.target.id);
            break;
          }
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: 0,
      }
    );

    for (const item of tocItems) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [tocItems]);

  // Toggle conflict card expansion
  const toggleConflict = (index: number) => {
    setExpandedConflicts((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Copy spec markdown with feedback
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(specMarkdown);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Fallback
    }
  };

  // Download .md file
  const handleDownload = () => {
    const blob = new Blob([specMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spec.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Share report link with lz-string compression
  const handleShareReport = () => {
    setShareError(null);
    if (!lintResult || !specResult) {
      setShareError('A complete lint result and spec are required to generate a shared report.');
      return;
    }

    const { encoded, tooLarge } = compressSessionForUrl({
      transcript: transcript || '',
      lintResult,
      answers: answers || {},
      specResult,
    });

    if (tooLarge) {
      setShareError(
        'Report is too large for URL hash sharing (>30,000 characters). Please use "Download session JSON" in the Build Pack below.'
      );
      return;
    }

    const url = `${window.location.origin}${window.location.pathname}#report=${encoded}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setShareCopied(true);
        window.location.hash = `report=${encoded}`;
        if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
        shareTimerRef.current = setTimeout(() => setShareCopied(false), 2500);
      })
      .catch(() => {
        setShareError('Could not write to clipboard. You can still copy from the address bar.');
        window.location.hash = `report=${encoded}`;
      });
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
    };
  }, []);

  const hasConflicts = answerConflicts.length > 0;
  const showConflictsPanel = showConflicts && hasConflicts;

  return (
    <div className="flex flex-col gap-6 w-full text-zinc-100">
      {/* TOOLBAR AT TOP */}
      <header className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <h2 className="text-sm sm:text-base font-semibold text-zinc-100 tracking-tight font-sans">
            Engineering Specification
          </h2>
          <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/60 font-semibold">
            Markdown Ready
          </span>
        </div>

        <nav aria-label="Spec actions" className="flex items-center flex-wrap gap-2">
          {onBackToFindings && (
            <button
              type="button"
              onClick={onBackToFindings}
              className="px-3 py-1.5 text-xs font-mono text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 rounded transition focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            >
              &larr; Back to Findings
            </button>
          )}

          {onStartOver && (
            <button
              type="button"
              onClick={onStartOver}
              className="px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded transition focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            >
              Start Over
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 text-xs font-mono font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded transition inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-cyan-300">Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="px-3.5 py-1.5 text-xs font-mono font-bold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 rounded transition shadow-sm focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            Download .md
          </button>

          <button
            type="button"
            onClick={handleShareReport}
            className="px-3 py-1.5 text-xs font-mono font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded transition inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            {shareCopied ? (
              <>
                <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-cyan-300">Link Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>Share report</span>
              </>
            )}
          </button>
        </nav>
      </header>

      {/* READ-ONLY REPORT BANNER */}
      {isReadOnlyReport && (
        <div className="rounded-lg border border-cyan-800 bg-cyan-950/70 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-cyan-200">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-cyan-500 text-zinc-950 font-bold uppercase tracking-wider text-[11px]">
              Shared report, read only
            </span>
            <span>This is a shared read-only snapshot. No model calls or edits can be made.</span>
          </div>
          {onExitReadOnly && (
            <button
              type="button"
              onClick={onExitReadOnly}
              className="text-cyan-300 hover:text-white underline font-semibold focus-visible:outline-none"
            >
              Open in editable workspace &rarr;
            </button>
          )}
        </div>
      )}

      {/* SHARE ERROR MESSAGE */}
      {shareError && (
        <div className="p-3 rounded-lg border border-amber-800 bg-amber-950/70 text-amber-200 text-xs font-mono">
          {shareError}
        </div>
      )}

      {/* CONFLICTS PANEL (Card list with collapse/expand, Chips with Question Text, Highlighted Fix Box) */}
      {showConflictsPanel && (
        <section
          role="region"
          aria-labelledby="conflicts-panel-title"
          className="rounded-lg border border-amber-700/80 bg-amber-950/40 p-4 sm:p-5 flex flex-col gap-4 text-zinc-200 shadow-sm"
        >
          {/* Header with Counter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-900/50 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono uppercase tracking-wider text-amber-300 font-bold border border-amber-600/80 bg-amber-900/60 px-2 py-0.5 rounded">
                Answer Conflicts
              </span>
              <span className="text-xs font-mono font-semibold text-amber-300">
                {answerConflicts.length} {answerConflicts.length === 1 ? 'conflict' : 'conflicts'} detected
              </span>
            </div>
            <p id="conflicts-panel-title" className="text-xs text-amber-200/90 font-sans">
              Some answers contradict each other or fail to resolve key constraints.
            </p>
          </div>

          {/* Cards List */}
          <div className="flex flex-col gap-3">
            {answerConflicts.map((conflict, idx) => {
              const isExpanded = Boolean(expandedConflicts[idx]);
              // Generate short clean title
              const shortTitle = `Conflict #${idx + 1}: ${
                conflict.description.split('.')[0] || 'Unresolved tradeoff'
              }`;

              return (
                <article
                  key={idx}
                  className="rounded-lg border border-amber-900/60 bg-zinc-950/80 p-3.5 sm:p-4 flex flex-col gap-3 transition-colors hover:border-amber-700/60"
                >
                  {/* Card Header (clickable to expand/collapse) */}
                  <button
                    type="button"
                    onClick={() => toggleConflict(idx)}
                    className="w-full text-left flex items-start justify-between gap-3 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none rounded"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <h3 className="text-sm font-semibold text-zinc-100 font-sans truncate">
                        {shortTitle}
                      </h3>
                      {!isExpanded && (
                        <p className="text-xs text-zinc-400 font-sans line-clamp-1">
                          {conflict.description}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-mono text-amber-400 shrink-0 mt-0.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                      {isExpanded ? 'Collapse ▲' : 'Details ▼'}
                    </span>
                  </button>

                  {/* Expanded Card Body */}
                  {isExpanded && (
                    <div className="flex flex-col gap-3 pt-2 border-t border-zinc-800/80 text-xs font-sans">
                      {/* Clash Description in plain sans-serif */}
                      <div>
                        <span className="font-semibold text-zinc-300 block mb-1">
                          The Clash:
                        </span>
                        <p className="text-zinc-300 leading-relaxed font-sans">
                          {conflict.description}
                        </p>
                      </div>

                      {/* Distinct Highlighted Box for Suggested Fix */}
                      <div className="p-3 rounded-lg border border-cyan-800/80 bg-cyan-950/40 text-cyan-200">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-cyan-400 block mb-1">
                          Suggested Resolution
                        </span>
                        <p className="font-sans text-xs text-cyan-100 leading-relaxed">
                          {conflict.suggestedFix}
                        </p>
                      </div>

                      {/* Chips showing related questions' text instead of IDs like Q1 */}
                      {conflict.questionIds && conflict.questionIds.length > 0 && (
                        <div className="flex flex-col gap-1.5 pt-1">
                          <span className="font-mono text-[11px] text-zinc-500 uppercase tracking-wider">
                            Related Questions:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {conflict.questionIds.map((qid) => {
                              const qText = questionMap.get(qid) || `Question ${qid}`;
                              return (
                                <span
                                  key={qid}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans bg-zinc-900 text-zinc-200 border border-zinc-700/80 shadow-xs max-w-full"
                                  title={qText}
                                >
                                  <span className="font-mono text-[11px] text-amber-400 shrink-0">
                                    #{qid}
                                  </span>
                                  <span className="truncate">{qText}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* Action Buttons: "Generate Anyway" is primary, "Edit My Answers" is secondary */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-amber-900/40">
            {onBackToFindings && (
              <button
                type="button"
                onClick={onBackToFindings}
                className="px-4 py-2 text-xs font-mono font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 rounded border border-zinc-700 transition focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
              >
                &larr; Edit My Answers
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setShowConflicts(false);
                if (onGenerateAnyway) onGenerateAnyway();
              }}
              className="px-4 py-2 text-xs font-mono font-bold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 rounded transition shadow-sm focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            >
              Generate Anyway &rarr;
            </button>
          </div>
        </section>
      )}

      {/* PHASE 2 SPEC VIEW SWITCHER: Specification | Test Cases | Diagrams */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveMainTab('spec')}
            className={`px-3 py-1.5 rounded transition ${
              activeMainTab === 'spec'
                ? 'bg-zinc-800 text-cyan-300 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Specification
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab('test-cases')}
            className={`px-3 py-1.5 rounded transition flex items-center gap-1.5 ${
              activeMainTab === 'test-cases'
                ? 'bg-zinc-800 text-cyan-300 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Test Cases</span>
            {testCases && testCases.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/80 text-[10px] flex items-center justify-center font-bold">
                {testCases.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab('diagrams')}
            className={`px-3 py-1.5 rounded transition flex items-center gap-1.5 ${
              activeMainTab === 'diagrams'
                ? 'bg-zinc-800 text-cyan-300 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Diagrams</span>
            {(diagrams?.flowchart || diagrams?.erDiagram) && (
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
            )}
          </button>
        </div>

        {/* Feature 9: Changes vs previous toggle (shown when previousSpecMarkdown exists and differs) */}
        {previousSpecMarkdown && previousSpecMarkdown !== specMarkdown && activeMainTab === 'spec' && (
          <div className="flex items-center rounded border border-zinc-800 bg-zinc-950 p-0.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => setShowDiff(false)}
              className={`px-2.5 py-1 rounded transition ${
                !showDiff
                  ? 'bg-zinc-800 text-zinc-100 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Current Spec
            </button>
            <button
              type="button"
              onClick={() => setShowDiff(true)}
              className={`px-2.5 py-1 rounded transition ${
                showDiff
                  ? 'bg-zinc-800 text-cyan-300 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Changes vs previous
            </button>
          </div>
        )}
      </div>

      {activeMainTab === 'test-cases' ? (
        <TestCasesViewer
          specMarkdown={specMarkdown}
          testCases={testCases}
          isLoading={isLoadingTestCases}
          onGenerate={onGenerateTestCases || (() => {})}
          error={testCasesError}
        />
      ) : activeMainTab === 'diagrams' ? (
        <DiagramsViewer
          specMarkdown={specMarkdown}
          flowchart={diagrams?.flowchart || null}
          erDiagram={diagrams?.erDiagram || null}
          isLoading={isLoadingDiagrams}
          onGenerate={onGenerateDiagrams || (() => {})}
          error={diagramsError}
        />
      ) : showDiff && previousSpecMarkdown ? (
        <SpecDiffViewer
          previousSpecMarkdown={previousSpecMarkdown}
          currentSpecMarkdown={specMarkdown}
        />
      ) : (
        /* SPEC LAYOUT: STICKY TOC ON DESKTOP + CONTENT COLUMN (~75ch) */
        <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
        {/* MOBILE TOC DISCLOSURE */}
        {tocItems.length > 0 && (
          <div className="w-full lg:hidden border border-zinc-800 rounded-lg bg-zinc-900/60 p-3">
            <button
              type="button"
              onClick={() => setIsMobileTocOpen(!isMobileTocOpen)}
              className="w-full flex items-center justify-between text-xs font-mono font-semibold text-zinc-300"
            >
              <span>Table of Contents ({tocItems.length} sections)</span>
              <span>{isMobileTocOpen ? '▲' : '▼'}</span>
            </button>
            {isMobileTocOpen && (
              <nav aria-label="Mobile table of contents" className="flex flex-col gap-1.5 pt-3 mt-2 border-t border-zinc-800">
                {tocItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={() => setIsMobileTocOpen(false)}
                    className={`text-xs block py-1 px-2 rounded transition-colors ${
                      activeHeadingId === item.id
                        ? 'bg-cyan-950/70 text-cyan-300 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                    } ${item.level === 2 ? 'pl-4 text-[11px]' : ''}`}
                  >
                    {item.text}
                  </a>
                ))}
              </nav>
            )}
          </div>
        )}

        {/* DESKTOP STICKY TABLE OF CONTENTS */}
        {tocItems.length > 0 && (
          <aside className="hidden lg:block w-64 shrink-0 sticky top-6 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm">
            <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-zinc-400 mb-3 border-b border-zinc-800/80 pb-2">
              On This Page
            </h3>
            <nav aria-label="Desktop table of contents" className="flex flex-col gap-1">
              {tocItems.map((item) => {
                const isActive = activeHeadingId === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`text-xs block py-1.5 px-2 rounded transition-all leading-snug font-sans ${
                      isActive
                        ? 'bg-cyan-950/70 text-cyan-300 border-l-2 border-cyan-400 font-semibold pl-2.5'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    } ${item.level === 2 ? 'pl-5 text-[11px]' : ''}`}
                  >
                    {item.text}
                  </a>
                );
              })}
            </nav>
          </aside>
        )}

        {/* MAIN MARKDOWN CONTENT COLUMN (~75ch wide, sans-serif prose, monospace only for code/IDs) */}
        <main className="w-full max-w-[75ch] min-w-0 bg-zinc-900/30 border border-zinc-800/70 rounded-xl p-5 sm:p-8 sm:py-10 shadow-md">
          <article className="prose prose-invert max-w-none text-zinc-200 font-sans">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => {
                  const text = typeof children === 'string' ? children : String(children);
                  const id = slugify(text);
                  return (
                    <h1
                      id={id}
                      className="text-2xl font-bold text-zinc-100 tracking-tight font-sans border-b border-zinc-800 pb-2.5 mt-8 mb-4 scroll-mt-20 first:mt-0"
                    >
                      {children}
                    </h1>
                  );
                },
                h2: ({ children }) => {
                  const text = typeof children === 'string' ? children : String(children);
                  const id = slugify(text);
                  return (
                    <h2
                      id={id}
                      className="text-lg font-semibold text-cyan-300 tracking-tight font-sans border-b border-zinc-800/60 pb-1.5 mt-7 mb-3 scroll-mt-20"
                    >
                      {children}
                    </h2>
                  );
                },
                h3: ({ children }) => {
                  const text = typeof children === 'string' ? children : String(children);
                  const id = slugify(text);
                  return (
                    <h3
                      id={id}
                      className="text-sm font-semibold text-zinc-200 uppercase tracking-wider font-sans mt-5 mb-2 scroll-mt-20"
                    >
                      {children}
                    </h3>
                  );
                },
                p: ({ children }) => (
                  <p className="text-sm text-zinc-300 leading-relaxed mb-4 font-sans">
                    {children}
                  </p>
                ),
                ul: ({ children, className }) => {
                  const isTaskList = className?.includes('contains-task-list');
                  return (
                    <ul
                      className={`space-y-1.5 text-sm text-zinc-300 mb-4 font-sans ${
                        isTaskList ? 'list-none pl-2' : 'list-disc list-outside pl-5'
                      }`}
                    >
                      {children}
                    </ul>
                  );
                },
                ol: ({ children }) => (
                  <ol className="list-decimal list-outside space-y-1.5 text-sm text-zinc-300 mb-4 pl-5 font-sans">
                    {children}
                  </ol>
                ),
                li: ({ children, className }) => {
                  const isTask = className?.includes('task-list-item');
                  if (isTask) {
                    const childArray = React.Children.toArray(children);
                    const flatItems: React.ReactNode[] = [];
                    childArray.forEach((child) => {
                      if (React.isValidElement(child) && child.type === 'p') {
                        flatItems.push(...React.Children.toArray((child.props as any).children));
                      } else {
                        flatItems.push(child);
                      }
                    });

                    let checkboxNode: React.ReactNode = null;
                    const contentNodes: React.ReactNode[] = [];
                    for (const item of flatItems) {
                      if (
                        !checkboxNode &&
                        React.isValidElement(item) &&
                        ((item.props as any)?.type === 'checkbox' ||
                          item.type === InteractiveTaskCheckbox ||
                          (item.type as any)?.name === 'InteractiveTaskCheckbox')
                      ) {
                        checkboxNode = item;
                      } else {
                        contentNodes.push(item);
                      }
                    }

                    return (
                      <li className="list-none -ml-4 flex items-start gap-2.5 py-1 text-sm text-zinc-300">
                        <span className="shrink-0 pt-0.5">
                          {checkboxNode || <InteractiveTaskCheckbox defaultChecked={false} />}
                        </span>
                        <div className="flex-1 min-w-0 leading-relaxed font-sans">
                          {contentNodes}
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li className="my-1 text-sm text-zinc-300 leading-normal">
                      {children}
                    </li>
                  );
                },
                input: ({ type, checked }) => {
                  if (type === 'checkbox') {
                    return <InteractiveTaskCheckbox defaultChecked={Boolean(checked)} />;
                  }
                  return null;
                },
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-cyan-500/70 pl-3.5 my-4 text-zinc-400 italic text-sm bg-zinc-900/30 py-1.5 rounded-r">
                    {children}
                  </blockquote>
                ),
                code: ({ className, children }) => {
                  const isBlock = className?.includes('language-');
                  if (isBlock) {
                    return (
                      <code className="block p-3.5 bg-zinc-950 font-mono text-xs text-cyan-300 rounded-lg border border-zinc-800 overflow-x-auto my-3">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code className="bg-zinc-950 text-cyan-300 font-mono text-xs px-1.5 py-0.5 rounded border border-zinc-800">
                      {children}
                    </code>
                  );
                },
                // TABLES: borders, alternating row shading, sticky header, horizontal scroll on small screens
                table: ({ children }) => (
                  <div className="overflow-x-auto my-6 border border-zinc-800 rounded-lg max-h-[500px] overflow-y-auto shadow-xs">
                    <table className="w-full text-xs font-sans border-collapse">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 z-10 shadow-xs">
                    {children}
                  </thead>
                ),
                tbody: ({ children }) => <tbody>{children}</tbody>,
                tr: ({ children }) => (
                  <tr className="border-b border-zinc-800/60 even:bg-zinc-900/40 odd:bg-transparent hover:bg-zinc-800/30 transition-colors">
                    {children}
                  </tr>
                ),
                th: ({ children }) => (
                  <th className="border-b border-zinc-800 bg-zinc-900 p-2.5 sm:p-3 text-left font-semibold text-zinc-200 font-sans tracking-wide">
                    {children}
                  </th>
                ),
                td: ({ children }) => {
                  // Turn "stated", "answered", and "assumed" labels into color-coded badges
                  return (
                    <td className="p-2.5 sm:p-3 text-zinc-300 align-top font-sans">
                      {renderDecisionSourceCell(children)}
                    </td>
                  );
                },
              }}
            >
              {specMarkdown}
            </ReactMarkdown>
          </article>

          {/* AI Build Pack Section */}
          <div className="mt-10 pt-8 border-t border-zinc-800">
            <BuildPack
              specMarkdown={specMarkdown}
              transcript={transcript}
              lintResult={lintResult}
              answers={answers}
              specResult={specResult}
              onImportSession={onImportSession}
            />
          </div>
        </main>
      </div>
      )}
    </div>
  );
}
