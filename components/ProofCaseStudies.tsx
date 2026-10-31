'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { CaseStudyData } from '@/lib/cases';
import { TranscriptHighlighter } from './TranscriptHighlighter';

interface ProofCaseStudiesProps {
  cases: CaseStudyData[];
  voiceInsightsImage?: {
    src: string;
    caption: string;
  } | null;
  buildComparison?: {
    rawTranscript: {
      title: string;
      summary: string;
      defectCount: number;
      defects?: Array<{ id: string; title: string; description: string; severity?: string }>;
    };
    lintedSpec: {
      title: string;
      summary: string;
      defectCount: number;
      defects?: Array<{ id: string; title: string; description: string }>;
    };
  } | null;
}

export function ProofCaseStudies({
  cases,
  voiceInsightsImage,
  buildComparison,
}: ProofCaseStudiesProps) {
  const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);
  const [activeStep, setActiveStep] = useState<'said' | 'found' | 'decided'>('said');
  const [spotItMode, setSpotItMode] = useState(false);
  const [flaggedIndexes, setFlaggedIndexes] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);

  const currentCase = cases[selectedCaseIndex] || cases[0];

  // Handle case change
  const handleSelectCase = (idx: number) => {
    setSelectedCaseIndex(idx);
    setActiveStep('said');
    setSpotItMode(false);
    setFlaggedIndexes([]);
    setRevealed(false);
  };

  // Split transcript into discrete sentences for Spot-it-first mode
  const sentences = useMemo(() => {
    if (!currentCase) return [];
    const text = currentCase.transcript;
    // Split on sentence boundaries: period, question mark, or exclamation point
    const rawMatches = text.match(/[^.!?\n]+[.!?]+|[^.!?\n]+/g);
    if (!rawMatches) return [text];
    return rawMatches.map((s) => s.trim()).filter((s) => s.length > 0);
  }, [currentCase]);

  // Determine which sentences contain actual contradiction quotes (Quote A or Quote B)
  const conflictingSentenceIndices = useMemo(() => {
    if (!currentCase) return new Set<number>();
    const indices = new Set<number>();
    const quotes = (currentCase.lintResult.contradictions || []).flatMap((c) => [
      c.quoteA.toLowerCase().trim(),
      c.quoteB.toLowerCase().trim(),
    ]);

    sentences.forEach((sentence, idx) => {
      const sentLower = sentence.toLowerCase();
      const isConflict = quotes.some((q) => {
        if (q.length < 5) return false;
        return sentLower.includes(q) || q.includes(sentLower);
      });
      if (isConflict) {
        indices.add(idx);
      }
    });

    return indices;
  }, [sentences, currentCase]);

  // Toggle user sentence flagging in Spot-it-first mode
  const toggleSentenceFlag = (idx: number) => {
    if (revealed) return;
    setFlaggedIndexes((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  // Spot-it-first accuracy score
  const spotItScore = useMemo(() => {
    if (!revealed) return { correct: 0, totalConflicts: 0 };
    const totalConflicts = conflictingSentenceIndices.size;
    let correct = 0;
    for (const idx of flaggedIndexes) {
      if (conflictingSentenceIndices.has(idx)) {
        correct++;
      }
    }
    return { correct, totalConflicts };
  }, [revealed, flaggedIndexes, conflictingSentenceIndices]);

  if (!currentCase) return null;

  const { stats, decisions } = currentCase;

  return (
    <div className="flex flex-col gap-8 w-full font-sans text-[#1B1B18]">
      {/* Editorial Header */}
      <div className="flex flex-col gap-2.5 border-b border-[#E4E2DA] pb-6">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[#6B6A63] font-medium border border-[#E4E2DA] bg-white px-2.5 py-0.5 rounded-full">
            REAL SESSIONS
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-normal tracking-tight text-[#1B1B18]">
          Real runs, no mocks
        </h1>
        <p className="text-sm text-[#6B6A63] max-w-2xl font-sans leading-relaxed">
          Each case is an exported session from this tool containing real voice transcripts, linting results, answers, and generated specifications.
        </p>
      </div>

      {/* Case Studies Tab Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1 rounded-full bg-[#F3F2EE] border border-[#E4E2DA]">
          {cases.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSelectCase(idx)}
              className={`px-4 py-1.5 text-xs font-sans rounded-full transition-all ${
                selectedCaseIndex === idx
                  ? 'bg-[#1B1B18] text-white font-medium shadow-warm-xs'
                  : 'text-[#6B6A63] hover:text-[#1B1B18]'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Spot-it-first Mode Toggle */}
        <button
          type="button"
          onClick={() => {
            setSpotItMode((prev) => !prev);
            setRevealed(false);
            setFlaggedIndexes([]);
          }}
          className={`px-3.5 py-1.5 text-xs font-sans font-medium rounded-full border transition-all inline-flex items-center gap-2 ${
            spotItMode
              ? 'bg-[#1B1B18] text-white border-[#1B1B18] shadow-warm-xs'
              : 'bg-white hover:bg-[#F7F6F3] text-[#1B1B18] border-[#E4E2DA]'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>{spotItMode ? 'Exit Spot-It-First' : 'Spot-It-First Mode'}</span>
        </button>
      </div>

      {/* Stat Strip Computed from Real Session Data */}
      <section
        aria-label="Case Study Metrics Strip"
        className="rounded-[16px] border border-[#E4E2DA] bg-white p-5 sm:p-6 shadow-warm-xs grid grid-cols-2 md:grid-cols-5 gap-4"
      >
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#6B6A63]">
            Transcript Words
          </span>
          <span className="text-xl sm:text-2xl font-serif font-normal text-[#1B1B18]">
            {stats.wordsCount.toLocaleString()}
          </span>
          <span className="text-[11px] text-[#6B6A63] font-sans">Spoken dictation</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#6B6A63]">
            Self-Corrections
          </span>
          <span className="text-xl sm:text-2xl font-serif font-normal text-emerald-800">
            {stats.selfCorrectionsCount}
          </span>
          <span className="text-[11px] text-[#6B6A63] font-sans">Resolved cleanly</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#6B6A63]">
            Contradictions
          </span>
          <span className="text-xl sm:text-2xl font-serif font-normal text-amber-800">
            {stats.contradictionsCount}
          </span>
          <span className="text-[11px] text-[#6B6A63] font-sans">Surfaced &amp; isolated</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#6B6A63]">
            Decisions Answered
          </span>
          <span className="text-xl sm:text-2xl font-serif font-normal text-[#1B1B18]">
            {stats.questionsAnsweredCount} / {stats.totalQuestionsCount}
          </span>
          <span className="text-[11px] text-[#6B6A63] font-sans">Clarifications chosen</span>
        </div>

        <div className="flex flex-col gap-1 col-span-2 md:col-span-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#6B6A63]">
            Spec Readiness
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-serif font-normal text-[#1B1B18]">
              {stats.readinessBefore}%
            </span>
            <span className="text-xs text-[#6B6A63]">&rarr;</span>
            <span className="text-xl sm:text-2xl font-serif font-normal text-emerald-800 font-medium">
              {stats.readinessAfter}%
            </span>
          </div>
          <span className="text-[11px] text-[#6B6A63] font-sans">Heuristic score gain</span>
        </div>
      </section>

      {/* SPOT-IT-FIRST INTERACTIVE MODE */}
      {spotItMode ? (
        <section
          aria-labelledby="spot-it-heading"
          className="rounded-[16px] border border-[#E4E2DA] bg-white p-6 sm:p-8 flex flex-col gap-6 shadow-warm-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E4E2DA] pb-4">
            <div>
              <h2 id="spot-it-heading" className="text-xl font-serif font-normal text-[#1B1B18] tracking-tight">
                Spot-It-First Challenge
              </h2>
              <p className="text-xs text-[#6B6A63] mt-1 font-sans">
                Read the raw transcript below without hints. Tap each sentence you suspect contains a contradiction, then click Reveal to test your discernment against the linter.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {!revealed ? (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  className="px-4 py-2 text-xs font-sans font-medium bg-[#1B1B18] hover:bg-black text-white rounded-lg transition shadow-warm-xs"
                >
                  Reveal conflicts ({flaggedIndexes.length} flagged)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRevealed(false);
                    setFlaggedIndexes([]);
                  }}
                  className="px-4 py-2 text-xs font-sans font-medium bg-white hover:bg-[#F7F6F3] text-[#1B1B18] border border-[#E4E2DA] rounded-lg transition"
                >
                  Try again
                </button>
              )}
            </div>
          </div>

          {/* Reveal Result Banner */}
          {revealed && (
            <div className="p-4 rounded-[12px] bg-[#F7F6F3] border border-[#E4E2DA] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <span className="font-sans font-medium text-[#1B1B18] text-sm">
                You flagged {spotItScore.correct} of {spotItScore.totalConflicts} sentences involving conflict.
              </span>
              <div className="flex items-center gap-3 text-[11px] font-sans text-[#6B6A63]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
                  Correct hit
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-amber-500" />
                  Missed conflict
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-zinc-400" />
                  False alarm
                </span>
              </div>
            </div>
          )}

          {/* Split Sentences List */}
          <div className="flex flex-col gap-2.5">
            {sentences.map((sent, idx) => {
              const isFlagged = flaggedIndexes.includes(idx);
              const isActualConflict = conflictingSentenceIndices.has(idx);

              let sentenceStyle = 'border-[#E4E2DA] bg-white hover:border-[#1B1B18]/40 text-[#1B1B18]';
              if (revealed) {
                if (isActualConflict && isFlagged) {
                  sentenceStyle = 'border-emerald-300 bg-emerald-50 text-emerald-950 font-medium';
                } else if (isActualConflict && !isFlagged) {
                  sentenceStyle = 'border-amber-300 bg-amber-50 text-amber-950';
                } else if (!isActualConflict && isFlagged) {
                  sentenceStyle = 'border-zinc-300 bg-zinc-100 text-zinc-500 line-through';
                } else {
                  sentenceStyle = 'border-[#E4E2DA] bg-white opacity-70 text-[#1B1B18]';
                }
              } else if (isFlagged) {
                sentenceStyle = 'border-[#1B1B18] bg-[#F7F6F3] ring-1 ring-[#1B1B18] text-[#1B1B18]';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleSentenceFlag(idx)}
                  className={`p-3.5 rounded-[12px] border text-left text-xs sm:text-sm font-sans leading-relaxed transition-all cursor-pointer flex items-start gap-3 ${sentenceStyle}`}
                >
                  <span className="font-mono text-[11px] text-[#6B6A63] shrink-0 mt-0.5">
                    {idx + 1}.
                  </span>
                  <span className="flex-1 min-w-0">{sent}</span>
                  {revealed && isActualConflict && isFlagged && (
                    <span className="shrink-0 text-emerald-700 font-mono text-[11px] font-bold">
                      ✓ Conflicted
                    </span>
                  )}
                  {revealed && isActualConflict && !isFlagged && (
                    <span className="shrink-0 text-amber-800 font-mono text-[11px]">
                      Missed
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        /* THREE-STEP STEPPER: SAID | FOUND | DECIDED */
        <div className="flex flex-col gap-6">
          {/* Stepper Navigation Pills */}
          <div className="flex items-center gap-2 border-b border-[#E4E2DA] pb-3">
            <button
              type="button"
              onClick={() => setActiveStep('said')}
              className={`px-4 py-2 text-xs font-sans rounded-full transition-all ${
                activeStep === 'said'
                  ? 'bg-[#1B1B18] text-white font-medium shadow-warm-xs'
                  : 'bg-white hover:bg-[#F7F6F3] text-[#6B6A63] border border-[#E4E2DA]'
              }`}
            >
              1. Said (Transcript)
            </button>

            <button
              type="button"
              onClick={() => setActiveStep('found')}
              className={`px-4 py-2 text-xs font-sans rounded-full transition-all ${
                activeStep === 'found'
                  ? 'bg-[#1B1B18] text-white font-medium shadow-warm-xs'
                  : 'bg-white hover:bg-[#F7F6F3] text-[#6B6A63] border border-[#E4E2DA]'
              }`}
            >
              2. Found (Contradictions &amp; Decisions)
            </button>

            <button
              type="button"
              onClick={() => setActiveStep('decided')}
              className={`px-4 py-2 text-xs font-sans rounded-full transition-all ${
                activeStep === 'decided'
                  ? 'bg-[#1B1B18] text-white font-medium shadow-warm-xs'
                  : 'bg-white hover:bg-[#F7F6F3] text-[#6B6A63] border border-[#E4E2DA]'
              }`}
            >
              3. Decided (Specification Log)
            </button>
          </div>

          {/* STEP 1: SAID (Transcript with highlight styles) */}
          {activeStep === 'said' && (
            <section aria-labelledby="said-step-heading" className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 id="said-step-heading" className="text-xl font-serif font-normal text-[#1B1B18] tracking-tight">
                  Spoken transcript with identified highlights
                </h2>
                <div className="hidden sm:flex items-center gap-3 text-xs text-[#6B6A63] font-sans">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-[#FEF3C7] border border-[#FDE68A]" />
                    Quote A
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-[#FEE2E2] border border-[#FECACA]" />
                    Quote B
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-[#DCFCE7] border border-[#BBF7D0]" />
                    Self-Correction
                  </span>
                </div>
              </div>

              <div className="rounded-[16px] border border-[#E4E2DA] bg-white p-6 sm:p-8 shadow-warm-sm">
                <TranscriptHighlighter
                  transcript={currentCase.transcript}
                  lintResult={currentCase.lintResult}
                  activeFindingId={null}
                  onSelectFinding={() => {}}
                />
              </div>
            </section>
          )}

          {/* STEP 2: FOUND (Contradictions, Self-Corrections, Missing Decisions) */}
          {activeStep === 'found' && (
            <section aria-labelledby="found-step-heading" className="flex flex-col gap-8">
              {/* Contradictions: Quote A and Quote B side-by-side */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-sans font-semibold text-[#1B1B18]">
                    Contradictions ({currentCase.lintResult.contradictions?.length || 0})
                  </h3>
                  <span className="text-xs text-[#6B6A63]">Opposing statements in stream-of-consciousness</span>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {(currentCase.lintResult.contradictions || []).map((c) => (
                    <article
                      key={c.id}
                      className="rounded-[16px] border border-[#E4E2DA] bg-white p-5 shadow-warm-xs flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-[#6B6A63] bg-[#F3F2EE] px-2 py-0.5 rounded">
                          {c.id}
                        </span>
                        <span
                          className={`text-[11px] font-sans font-medium px-2.5 py-0.5 rounded-full border ${
                            c.severity === 'high'
                              ? 'border-rose-200 bg-rose-50 text-rose-800'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                          }`}
                        >
                          {c.severity} severity
                        </span>
                      </div>

                      {/* Side-by-side Quote Boxes */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
                        <div className="p-3 rounded-[12px] bg-amber-50/70 border border-amber-200/80 flex flex-col gap-1">
                          <span className="text-[10px] font-sans font-medium text-amber-800 uppercase tracking-wider">
                            Quote A
                          </span>
                          <span className="text-amber-950 font-sans leading-relaxed">
                            &quot;{c.quoteA}&quot;
                          </span>
                        </div>
                        <div className="p-3 rounded-[12px] bg-rose-50/70 border border-rose-200/80 flex flex-col gap-1">
                          <span className="text-[10px] font-sans font-medium text-rose-800 uppercase tracking-wider">
                            Quote B
                          </span>
                          <span className="text-rose-950 font-sans leading-relaxed">
                            &quot;{c.quoteB}&quot;
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-[#1B1B18]/90 font-sans leading-relaxed">
                        <span className="text-[#6B6A63] font-medium">Why it clashes:</span> {c.why}
                      </p>
                    </article>
                  ))}
                </div>
              </div>

              {/* Self-Corrections Resolved */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-sans font-semibold text-[#1B1B18]">
                    Self-Corrections ({currentCase.lintResult.selfCorrections?.length || 0})
                  </h3>
                  <span className="text-xs text-[#6B6A63]">Later statement wins rule</span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {(currentCase.lintResult.selfCorrections || []).map((sc) => (
                    <article
                      key={sc.id}
                      className="rounded-[16px] border border-[#E4E2DA] bg-white p-4 shadow-warm-xs flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-[#6B6A63] bg-[#F3F2EE] px-2 py-0.5 rounded">
                          {sc.id}
                        </span>
                        <span className="text-[11px] font-sans font-medium px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800">
                          Last statement wins
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 font-mono text-xs">
                        <span className="line-through text-[#6B6A63] bg-[#F7F6F3] px-2 py-1 rounded border border-[#E4E2DA]">
                          &quot;{sc.earlierQuote}&quot;
                        </span>
                        <span className="text-[#6B6A63] hidden sm:inline">&rarr;</span>
                        <span className="text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                          &quot;{sc.finalQuote}&quot;
                        </span>
                      </div>

                      <p className="text-xs text-[#1B1B18]/90 font-sans leading-relaxed">
                        <span className="text-[#6B6A63] font-medium">Resolution:</span> {sc.resolution}
                      </p>
                    </article>
                  ))}
                </div>
              </div>

              {/* Missing Decisions */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-sans font-semibold text-[#1B1B18]">
                    Missing Decisions ({currentCase.lintResult.missingDecisions?.length || 0})
                  </h3>
                  <span className="text-xs text-[#6B6A63]">Implicit architectural choices</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(currentCase.lintResult.missingDecisions || []).map((md) => (
                    <article
                      key={md.id}
                      className="rounded-[16px] border border-[#E4E2DA] bg-white p-4 shadow-warm-xs flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-[#6B6A63] bg-[#F3F2EE] px-2 py-0.5 rounded">
                          {md.id}
                        </span>
                        <span className="text-xs font-medium text-[#1B1B18] font-sans">
                          {md.topic}
                        </span>
                      </div>
                      <p className="text-xs text-[#6B6A63] font-sans leading-relaxed">
                        {md.whyItMatters}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* STEP 3: DECIDED (Specification Decisions Log) */}
          {activeStep === 'decided' && (
            <section aria-labelledby="decided-step-heading" className="flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 id="decided-step-heading" className="text-xl font-serif font-normal text-[#1B1B18] tracking-tight">
                    Specification decisions log
                  </h2>
                  <p className="text-xs text-[#6B6A63] font-sans">
                    Traceability mapping every requirement decision to either stated voice words, user answers, or conservative defaults.
                  </p>
                </div>

                {/* Stated / Answered / Assumed Counts */}
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 text-xs font-sans rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                    Stated: <strong>{decisions.statedCount}</strong>
                  </span>
                  <span className="px-3 py-1 text-xs font-sans rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Answered: <strong>{decisions.answeredCount}</strong>
                  </span>
                  <span className="px-3 py-1 text-xs font-sans rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    Assumed: <strong>{decisions.assumedCount}</strong>
                  </span>
                </div>
              </div>

              {/* First 5 Decisions List */}
              <div className="rounded-[16px] border border-[#E4E2DA] bg-white overflow-hidden shadow-warm-sm">
                <div className="px-5 py-3.5 bg-[#F7F6F3] border-b border-[#E4E2DA] flex items-center justify-between text-xs font-sans font-medium text-[#6B6A63]">
                  <span>First five architectural decisions</span>
                  <span className="font-mono text-[11px]">Traceable to transcript or user prompt</span>
                </div>

                <div className="divide-y divide-[#E4E2DA]">
                  {decisions.firstFive.map((d) => {
                    const srcLower = d.source.toLowerCase();
                    const badgeClass =
                      srcLower.includes('stated') || srcLower.includes('transcript')
                        ? 'bg-slate-100 text-slate-800 border-slate-200'
                        : srcLower.includes('answer')
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200';

                    return (
                      <div key={d.id} className="p-4 sm:p-5 flex flex-col gap-1.5 hover:bg-[#F8F8F7]/50 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium text-[#6B6A63] bg-[#F3F2EE] px-2 py-0.5 rounded">
                              {d.id}
                            </span>
                            <span className="text-sm font-medium text-[#1B1B18] font-sans">
                              {d.decision}
                            </span>
                          </div>
                          <span className={`px-2.5 py-0.5 text-[11px] font-sans rounded-full border ${badgeClass}`}>
                            {d.source}
                          </span>
                        </div>
                        {d.details && (
                          <p className="text-xs text-[#6B6A63] font-sans pl-8 leading-relaxed">
                            {d.details}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* BUILT BY VOICE SECTION (Only rendered if public/proofs/whisper insights.png exists) */}
      {voiceInsightsImage && (
        <section
          aria-labelledby="built-by-voice-heading"
          className="rounded-[16px] border border-[#E4E2DA] bg-white p-6 sm:p-8 flex flex-col gap-4 shadow-warm-xs"
        >
          <h2 id="built-by-voice-heading" className="text-xl font-serif font-normal text-[#1B1B18] tracking-tight">
            Built by voice
          </h2>
          <div className="relative w-full overflow-hidden rounded-[12px] border border-[#E4E2DA] bg-[#F7F6F3]">
            <img
              src={voiceInsightsImage.src}
              alt={voiceInsightsImage.caption}
              className="w-full h-auto object-cover"
            />
          </div>
          <p className="text-xs text-[#6B6A63] font-sans italic text-center">
            {voiceInsightsImage.caption}
          </p>
        </section>
      )}

      {/* BUILD COMPARISON SECTION (Only rendered if data/proof.json exists with real data) */}
      {buildComparison && (
        <section
          aria-labelledby="build-comparison-heading"
          className="rounded-[16px] border border-[#E4E2DA] bg-white p-6 sm:p-8 flex flex-col gap-6 shadow-warm-xs"
        >
          <div className="flex flex-col gap-1 border-b border-[#E4E2DA] pb-4">
            <h2 id="build-comparison-heading" className="text-xl font-serif font-normal text-[#1B1B18] tracking-tight">
              Real build outcome comparison
            </h2>
            <p className="text-xs text-[#6B6A63] font-sans">
              Recorded execution defects when an autonomous coding agent was fed raw audio dictation versus the Speech to Spec requirements.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Raw Transcript Build */}
            <article className="rounded-[12px] border border-rose-200 bg-rose-50/40 p-5 flex flex-col gap-3">
              <span className="text-xs font-sans uppercase font-medium text-rose-800">
                {buildComparison.rawTranscript.title}
              </span>
              <p className="text-xs text-[#1B1B18]/90 font-sans leading-relaxed">
                {buildComparison.rawTranscript.summary}
              </p>
              <div className="text-xs font-mono font-medium text-rose-800">
                {buildComparison.rawTranscript.defectCount} recorded defects
              </div>
            </article>

            {/* Linted Spec Build */}
            <article className="rounded-[12px] border border-emerald-200 bg-emerald-50/40 p-5 flex flex-col gap-3">
              <span className="text-xs font-sans uppercase font-medium text-emerald-800">
                {buildComparison.lintedSpec.title}
              </span>
              <p className="text-xs text-[#1B1B18]/90 font-sans leading-relaxed">
                {buildComparison.lintedSpec.summary}
              </p>
              <div className="text-xs font-mono font-medium text-emerald-800">
                {buildComparison.lintedSpec.defectCount} recorded defects
              </div>
            </article>
          </div>
        </section>
      )}

      {/* Navigation Footer */}
      <div className="pt-6 border-t border-[#E4E2DA] flex justify-between items-center text-xs font-sans">
        <Link href="/" className="text-[#1B1B18] font-medium hover:text-black flex items-center gap-1.5 transition">
          &larr; Back to workspace
        </Link>
        <Link href="/about" className="text-[#6B6A63] hover:text-[#1B1B18] flex items-center gap-1.5 transition">
          Read architecture &amp; rules &rarr;
        </Link>
      </div>
    </div>
  );
}

