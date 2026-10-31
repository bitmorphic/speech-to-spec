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
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-sans font-medium bg-slate-100 text-slate-800 border border-slate-200">
          Stated
        </span>
      )}
      {isAnswered && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-sans font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
          Answered
        </span>
      )}
      {isAssumed && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-sans font-medium bg-amber-50 text-amber-800 border border-amber-200">
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
        return clean ? <span className="text-[11px] text-[#6B6A63] font-sans">{clean}</span> : null;
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
      className="h-4 w-4 rounded border-[#E4E2DA] bg-white text-[#1B1B18] focus:ring-[#2563EB] focus:ring-offset-0 cursor-pointer transition shrink-0 mt-0.5 accent-[#1B1B18]"
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
    <div className="flex flex-col gap-6 w-full text-[#1B1B18]">
      {/* TOOLBAR AT TOP */}
      <header className="rounded-[16px] border border-[#E4E2DA] bg-white p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-warm-sm">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base sm:text-lg font-serif font-normal text-[#1B1B18] tracking-tight">
            Engineering Specification
          </h2>
          <span className="px-2.5 py-0.5 text-xs font-mono rounded-full bg-[#F3F2EE] text-[#6B6A63] border border-[#E4E2DA]">
            Markdown ready
          </span>
        </div>

        <nav aria-label="Spec actions" className="flex items-center flex-wrap gap-2">
          {onBackToFindings && (
            <button
              type="button"
              onClick={onBackToFindings}
              className="px-3.5 py-2 text-xs font-sans font-medium text-[#1B1B18] hover:bg-[#F7F6F3] bg-white border border-[#E4E2DA] rounded-lg transition"
            >
              &larr; Back to findings
            </button>
          )}

          {onStartOver && (
            <button
              type="button"
              onClick={onStartOver}
              className="px-3.5 py-2 text-xs font-sans font-medium text-[#6B6A63] hover:text-[#1B1B18] hover:bg-[#F7F6F3] bg-white border border-[#E4E2DA] rounded-lg transition"
            >
              Start over
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="px-3.5 py-2 text-xs font-sans font-medium bg-white hover:bg-[#F7F6F3] text-[#1B1B18] border border-[#E4E2DA] rounded-lg transition inline-flex items-center gap-1.5"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-700">Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-[#6B6A63]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="px-4 py-2 text-xs font-sans font-medium bg-[#1B1B18] hover:bg-black text-white rounded-lg transition shadow-warm-xs"
          >
            Download .md
          </button>

          <button
            type="button"
            onClick={handleShareReport}
            className="px-3.5 py-2 text-xs font-sans font-medium bg-white hover:bg-[#F7F6F3] text-[#1B1B18] border border-[#E4E2DA] rounded-lg transition inline-flex items-center gap-1.5"
          >
            {shareCopied ? (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-700">Link copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-[#6B6A63]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        <div className="rounded-[16px] border border-[#E4E2DA] bg-[#F7F6F3] p-4 flex flex-wrap items-center justify-between gap-3 text-xs font-sans text-[#1B1B18]">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#1B1B18] text-white font-medium text-[11px]">
              Shared report, read only
            </span>
            <span>This is a shared read-only snapshot. No model calls or edits can be made.</span>
          </div>
          {onExitReadOnly && (
            <button
              type="button"
              onClick={onExitReadOnly}
              className="text-[#1B1B18] underline font-medium hover:text-black"
            >
              Open in editable workspace &rarr;
            </button>
          )}
        </div>
      )}

      {/* SHARE ERROR MESSAGE */}
      {shareError && (
        <div className="p-3.5 rounded-[16px] border border-amber-200 bg-amber-50 text-amber-900 text-xs font-sans">
          {shareError}
        </div>
      )}

      {/* CONFLICTS PANEL */}
      {showConflictsPanel && (
        <section
          role="region"
          aria-labelledby="conflicts-panel-title"
          className="rounded-[16px] border border-amber-200/90 bg-amber-50/50 p-4 sm:p-5 flex flex-col gap-4 text-[#1B1B18] shadow-warm-xs"
        >
          {/* Header with Counter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-sans font-medium text-amber-900 border border-amber-300 bg-amber-100/80 px-2.5 py-0.5 rounded-full">
                Answer conflicts
              </span>
              <span className="text-xs font-sans font-medium text-amber-900">
                {answerConflicts.length} {answerConflicts.length === 1 ? 'conflict' : 'conflicts'} detected
              </span>
            </div>
            <p id="conflicts-panel-title" className="text-xs text-[#6B6A63] font-sans">
              Some answers contradict each other or fail to resolve key constraints.
            </p>
          </div>

          {/* Cards List */}
          <div className="flex flex-col gap-3">
            {answerConflicts.map((conflict, idx) => {
              const isExpanded = Boolean(expandedConflicts[idx]);
              const shortTitle = `Conflict #${idx + 1}: ${
                conflict.description.split('.')[0] || 'Unresolved tradeoff'
              }`;

              return (
                <article
                  key={idx}
                  className="rounded-[16px] border border-[#E4E2DA] bg-white p-4 flex flex-col gap-3 shadow-warm-xs"
                >
                  <button
                    type="button"
                    onClick={() => toggleConflict(idx)}
                    className="w-full text-left flex items-start justify-between gap-3 rounded"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <h3 className="text-sm font-medium text-[#1B1B18] font-sans truncate">
                        {shortTitle}
                      </h3>
                      {!isExpanded && (
                        <p className="text-xs text-[#6B6A63] font-sans line-clamp-1">
                          {conflict.description}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-sans text-[#6B6A63] shrink-0 mt-0.5 px-2.5 py-1 rounded-full bg-[#F7F6F3] border border-[#E4E2DA]">
                      {isExpanded ? 'Collapse ▲' : 'Details ▼'}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="flex flex-col gap-3 pt-3 border-t border-[#E4E2DA] text-xs font-sans">
                      <div>
                        <span className="font-medium text-[#1B1B18] block mb-1">
                          The clash:
                        </span>
                        <p className="text-[#1B1B18]/90 leading-relaxed font-sans">
                          {conflict.description}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-[12px] border border-[#E4E2DA] bg-[#F7F6F3] text-[#1B1B18]">
                        <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#6B6A63] block mb-1">
                          Suggested resolution
                        </span>
                        <p className="font-sans text-xs text-[#1B1B18] leading-relaxed">
                          {conflict.suggestedFix}
                        </p>
                      </div>

                      {conflict.questionIds && conflict.questionIds.length > 0 && (
                        <div className="flex flex-col gap-1.5 pt-1">
                          <span className="font-mono text-[11px] text-[#6B6A63] uppercase tracking-wider">
                            Related questions:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {conflict.questionIds.map((qid) => {
                              const qText = questionMap.get(qid) || `Question ${qid}`;
                              return (
                                <span
                                  key={qid}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-sans bg-[#F3F2EE] text-[#1B1B18] border border-[#E4E2DA] max-w-full"
                                  title={qText}
                                >
                                  <span className="font-mono text-[11px] text-[#6B6A63] shrink-0">
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

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-amber-200/60">
            {onBackToFindings && (
              <button
                type="button"
                onClick={onBackToFindings}
                className="px-4 py-2 text-xs font-sans font-medium bg-white hover:bg-[#F7F6F3] text-[#1B1B18] rounded-lg border border-[#E4E2DA] transition"
              >
                &larr; Edit my answers
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setShowConflicts(false);
                if (onGenerateAnyway) onGenerateAnyway();
              }}
              className="px-4 py-2 text-xs font-sans font-medium bg-[#1B1B18] hover:bg-black text-white rounded-lg transition shadow-warm-xs"
            >
              Generate anyway &rarr;
            </button>
          </div>
        </section>
      )}

      {/* PHASE 2 SPEC VIEW SWITCHER: Specification | Test Cases | Diagrams */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E2DA] pb-3">
        <div className="flex items-center gap-1.5 p-1 rounded-full bg-[#F3F2EE] border border-[#E4E2DA] text-xs font-sans">
          <button
            type="button"
            onClick={() => setActiveMainTab('spec')}
            className={`px-3.5 py-1.5 rounded-full transition ${
              activeMainTab === 'spec'
                ? 'bg-white text-[#1B1B18] font-medium shadow-xs'
                : 'text-[#6B6A63] hover:text-[#1B1B18]'
            }`}
          >
            Specification
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab('test-cases')}
            className={`px-3.5 py-1.5 rounded-full transition flex items-center gap-1.5 ${
              activeMainTab === 'test-cases'
                ? 'bg-white text-[#1B1B18] font-medium shadow-xs'
                : 'text-[#6B6A63] hover:text-[#1B1B18]'
            }`}
          >
            <span>Test cases</span>
            {testCases && testCases.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#1B1B18] text-white text-[10px] flex items-center justify-center font-mono">
                {testCases.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab('diagrams')}
            className={`px-3.5 py-1.5 rounded-full transition flex items-center gap-1.5 ${
              activeMainTab === 'diagrams'
                ? 'bg-white text-[#1B1B18] font-medium shadow-xs'
                : 'text-[#6B6A63] hover:text-[#1B1B18]'
            }`}
          >
            <span>Diagrams</span>
            {(diagrams?.flowchart || diagrams?.erDiagram) && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#1B1B18]" />
            )}
          </button>
        </div>

        {/* Feature 9: Changes vs previous toggle */}
        {previousSpecMarkdown && previousSpecMarkdown !== specMarkdown && activeMainTab === 'spec' && (
          <div className="flex items-center rounded-full border border-[#E4E2DA] bg-[#F3F2EE] p-0.5 text-xs font-sans">
            <button
              type="button"
              onClick={() => setShowDiff(false)}
              className={`px-3 py-1 rounded-full transition ${
                !showDiff
                  ? 'bg-white text-[#1B1B18] font-medium shadow-xs'
                  : 'text-[#6B6A63] hover:text-[#1B1B18]'
              }`}
            >
              Current spec
            </button>
            <button
              type="button"
              onClick={() => setShowDiff(true)}
              className={`px-3 py-1 rounded-full transition ${
                showDiff
                  ? 'bg-white text-[#1B1B18] font-medium shadow-xs'
                  : 'text-[#6B6A63] hover:text-[#1B1B18]'
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
          <div className="w-full lg:hidden border border-[#E4E2DA] rounded-[16px] bg-white p-3.5 shadow-warm-xs">
            <button
              type="button"
              onClick={() => setIsMobileTocOpen(!isMobileTocOpen)}
              className="w-full flex items-center justify-between text-xs font-sans font-medium text-[#1B1B18]"
            >
              <span>Table of contents ({tocItems.length} sections)</span>
              <span>{isMobileTocOpen ? '▲' : '▼'}</span>
            </button>
            {isMobileTocOpen && (
              <nav aria-label="Mobile table of contents" className="flex flex-col gap-1.5 pt-3 mt-2 border-t border-[#E4E2DA]">
                {tocItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={() => setIsMobileTocOpen(false)}
                    className={`text-xs block py-1.5 px-2.5 rounded-lg transition-colors ${
                      activeHeadingId === item.id
                        ? 'bg-[#F3F2EE] text-[#1B1B18] font-medium'
                        : 'text-[#6B6A63] hover:text-[#1B1B18] hover:bg-[#F7F6F3]'
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
          <aside className="hidden lg:block w-64 shrink-0 sticky top-6 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-[16px] border border-[#E4E2DA] bg-white p-4 shadow-warm-xs">
            <h3 className="text-xs font-mono uppercase tracking-wider font-medium text-[#6B6A63] mb-3 border-b border-[#E4E2DA] pb-2">
              On this page
            </h3>
            <nav aria-label="Desktop table of contents" className="flex flex-col gap-1">
              {tocItems.map((item) => {
                const isActive = activeHeadingId === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`text-xs block py-1.5 px-2.5 rounded-lg transition-all leading-snug font-sans ${
                      isActive
                        ? 'bg-[#F7F6F3] text-[#1B1B18] border-l-2 border-[#1B1B18] font-medium pl-3'
                        : 'text-[#6B6A63] hover:text-[#1B1B18] hover:bg-[#F7F6F3]/60'
                    } ${item.level === 2 ? 'pl-5 text-[11px]' : ''}`}
                  >
                    {item.text}
                  </a>
                );
              })}
            </nav>
          </aside>
        )}

        {/* MAIN MARKDOWN CONTENT COLUMN (~75ch wide, Newsreader headlines, comfortable line length) */}
        <main className="w-full max-w-[75ch] min-w-0 bg-white border border-[#E4E2DA] rounded-[16px] p-6 sm:p-10 shadow-warm-sm">
          <article className="prose max-w-none text-[#1B1B18] font-sans">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => {
                  const text = typeof children === 'string' ? children : String(children);
                  const id = slugify(text);
                  return (
                    <h1
                      id={id}
                      className="text-2xl sm:text-3xl font-serif font-normal text-[#1B1B18] tracking-tight border-b border-[#E4E2DA] pb-3 mt-8 mb-4 scroll-mt-20 first:mt-0"
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
                      className="text-xl sm:text-2xl font-serif font-normal text-[#1B1B18] tracking-tight border-b border-[#E4E2DA]/70 pb-2 mt-8 mb-3 scroll-mt-20"
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
                      className="text-xs font-mono font-medium text-[#6B6A63] uppercase tracking-wider mt-6 mb-2 scroll-mt-20"
                    >
                      {children}
                    </h3>
                  );
                },
                p: ({ children }) => (
                  <p className="text-sm text-[#1B1B18]/90 leading-relaxed mb-4 font-sans max-w-[75ch]">
                    {children}
                  </p>
                ),
                ul: ({ children, className }) => {
                  const isTaskList = className?.includes('contains-task-list');
                  return (
                    <ul
                      className={`space-y-1.5 text-sm text-[#1B1B18]/90 mb-4 font-sans ${
                        isTaskList ? 'list-none pl-2' : 'list-disc list-outside pl-5'
                      }`}
                    >
                      {children}
                    </ul>
                  );
                },
                ol: ({ children }) => (
                  <ol className="list-decimal list-outside space-y-1.5 text-sm text-[#1B1B18]/90 mb-4 pl-5 font-sans">
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
                      <li className="list-none -ml-4 flex items-start gap-2.5 py-1 text-sm text-[#1B1B18]">
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
                    <li className="my-1 text-sm text-[#1B1B18]/90 leading-normal">
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
                  <blockquote className="border-l-2 border-[#1B1B18] pl-3.5 my-4 text-[#6B6A63] italic text-sm bg-[#F7F6F3] py-2 rounded-r">
                    {children}
                  </blockquote>
                ),
                code: ({ className, children }) => {
                  const isBlock = className?.includes('language-');
                  if (isBlock) {
                    return (
                      <code className="block p-4 bg-[#F7F6F3] font-mono text-xs text-[#1B1B18] rounded-xl border border-[#E4E2DA] overflow-x-auto my-4">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code className="bg-[#F3F2EE] text-[#1B1B18] font-mono text-xs px-1.5 py-0.5 rounded border border-[#E4E2DA]">
                      {children}
                    </code>
                  );
                },
                table: ({ children }) => (
                  <div className="overflow-x-auto my-6 border border-[#E4E2DA] rounded-[16px] max-h-[500px] overflow-y-auto shadow-warm-xs">
                    <table className="w-full text-xs font-sans border-collapse">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="sticky top-0 bg-[#F7F6F3] border-b border-[#E4E2DA] z-10">
                    {children}
                  </thead>
                ),
                tbody: ({ children }) => <tbody>{children}</tbody>,
                tr: ({ children }) => (
                  <tr className="border-b border-[#E4E2DA]/60 even:bg-[#F8F8F7]/60 odd:bg-white hover:bg-[#F7F6F3]/80 transition-colors">
                    {children}
                  </tr>
                ),
                th: ({ children }) => (
                  <th className="border-b border-[#E4E2DA] bg-[#F7F6F3] p-3 text-left font-medium text-[#1B1B18] font-sans tracking-wide">
                    {children}
                  </th>
                ),
                td: ({ children }) => {
                  return (
                    <td className="p-3 text-[#1B1B18] align-top font-sans">
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
          <div className="mt-10 pt-8 border-t border-[#E4E2DA]">
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
