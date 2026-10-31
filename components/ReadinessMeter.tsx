'use client';

import React, { useMemo } from 'react';
import { Contradiction, MissingDecision, Question } from '@/lib/types';

export interface ReadinessMeterProps {
  contradictions?: Contradiction[];
  missingDecisions?: MissingDecision[];
  questions?: Question[];
  answers?: Record<string, { text: string; youDecide: boolean }>;
}

export function ReadinessMeter({
  contradictions = [],
  missingDecisions = [],
  questions = [],
  answers = {},
}: ReadinessMeterProps) {
  // Baseline initial score before any answers are given
  const baselineScore = useMemo(() => {
    let penalty = 0;
    for (const c of contradictions) {
      if (c.severity === 'high') {
        penalty += 15;
      } else {
        penalty += 8;
      }
    }
    penalty += missingDecisions.length * 4;
    return Math.max(0, 100 - penalty);
  }, [contradictions, missingDecisions]);

  // Dynamic current score as questions are answered
  const currentScore = useMemo(() => {
    // Map each finding id to its unanswered factor (0 = resolved, 0.5 = you decide, 1 = unanswered)
    const getFindingUnansweredFactor = (findingId: string): number => {
      const tiedQuestions = questions.filter(
        (q) => q.relatesTo && q.relatesTo.includes(findingId)
      );

      // If no question covers this finding, it remains fully open
      if (tiedQuestions.length === 0) return 1.0;

      let sumFactor = 0;
      for (const q of tiedQuestions) {
        const ans = answers[q.id];
        if (ans?.youDecide) {
          sumFactor += 0.5; // You decide counts as half
        } else if (ans?.text && ans.text.trim().length > 0) {
          sumFactor += 0.0; // Answered
        } else {
          sumFactor += 1.0; // Unanswered
        }
      }

      return sumFactor / tiedQuestions.length;
    };

    let penalty = 0;
    for (const c of contradictions) {
      const factor = getFindingUnansweredFactor(c.id);
      const basePenalty = c.severity === 'high' ? 15 : 8;
      penalty += basePenalty * factor;
    }

    for (const md of missingDecisions) {
      const factor = getFindingUnansweredFactor(md.id);
      penalty += 4 * factor;
    }

    return Math.max(0, Math.min(100, Math.round(100 - penalty)));
  }, [contradictions, missingDecisions, questions, answers]);

  // Color gradient based on score
  const scoreColor =
    currentScore >= 80
      ? 'text-emerald-400'
      : currentScore >= 50
      ? 'text-cyan-400'
      : currentScore >= 25
      ? 'text-amber-400'
      : 'text-rose-400';

  const barColor =
    currentScore >= 80
      ? 'bg-emerald-500'
      : currentScore >= 50
      ? 'bg-cyan-500'
      : currentScore >= 25
      ? 'bg-amber-500'
      : 'bg-rose-500';

  return (
    <section
      aria-label="Spec Readiness Meter"
      className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3 shadow-xs"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <h2 className="text-xs font-mono uppercase tracking-wider font-bold text-zinc-300">
            Spec readiness
          </h2>
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded bg-zinc-950">
            Heuristic
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono flex-wrap sm:flex-nowrap">
          <span className="text-zinc-500 whitespace-nowrap shrink-0">
            Baseline: <strong className="text-zinc-400">{baselineScore}%</strong>
          </span>
          <span className="text-zinc-600 shrink-0">&rarr;</span>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-zinc-300 whitespace-nowrap">
              Current: <strong className={`${scoreColor} text-sm font-bold`}>{currentScore}%</strong>
            </span>
            {/* Readiness bar shown next to current readiness value */}
            <div className="w-24 sm:w-36 bg-zinc-950 rounded-full h-2.5 p-0.5 border border-zinc-800 overflow-hidden shrink-0">
              <div
                role="progressbar"
                aria-valuenow={currentScore}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Spec readiness ${currentScore}%`}
                className={`${barColor} h-full rounded-full transition-all duration-500 ease-out`}
                style={{ width: `${currentScore}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Progress Gauge Bar */}
      <div className="w-full bg-zinc-950 rounded-full h-3 p-0.5 border border-zinc-800 overflow-hidden">
        <div
          role="progressbar"
          aria-valuenow={currentScore}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Spec readiness ${currentScore}%`}
          className={`${barColor} h-full rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${currentScore}%` }}
        />
      </div>

      <p className="text-[11px] text-zinc-500 font-sans leading-normal">
        * Heuristic estimates clarity by penalizing unresolved contradictions and open decisions; not a formal specification guarantee.
      </p>
    </section>
  );
}

