'use client';

import React, { useMemo } from 'react';
import { Contradiction, MissingDecision, Question } from '@/lib/types';
import { calculateReadinessScore } from '@/lib/readiness';

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
  const { baselineScore, currentScore } = useMemo(() => {
    return calculateReadinessScore(contradictions, missingDecisions, questions, answers);
  }, [contradictions, missingDecisions, questions, answers]);

  const scoreColor =
    currentScore >= 80
      ? 'text-emerald-700'
      : currentScore >= 50
      ? 'text-[#1B1B18]'
      : currentScore >= 25
      ? 'text-amber-700'
      : 'text-rose-700';

  const barColor =
    currentScore >= 80
      ? 'bg-emerald-600'
      : currentScore >= 50
      ? 'bg-[#1B1B18]'
      : currentScore >= 25
      ? 'bg-amber-500'
      : 'bg-rose-500';

  return (
    <section
      aria-label="Spec Readiness Meter"
      className="rounded-[16px] border border-[#E4E2DA] bg-white p-5 flex flex-col gap-3.5 shadow-xs font-sans text-[#1B1B18]"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-sans font-semibold text-[#1B1B18]">
            Spec readiness
          </h3>
          <span className="text-[11px] text-[#6B6A63] border border-[#E4E2DA] px-2 py-0.5 rounded-full bg-[#F7F6F3]">
            Heuristic
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs flex-wrap sm:flex-nowrap">
          <span className="text-[#6B6A63] whitespace-nowrap">
            Baseline: <strong className="text-[#1B1B18] font-mono">{baselineScore}%</strong>
          </span>
          <span className="text-[#6B6A63]">&rarr;</span>
          <div className="flex items-center gap-2.5">
            <span className="text-[#6B6A63] whitespace-nowrap">
              Current: <strong className={`${scoreColor} text-sm font-bold font-mono`}>{currentScore}%</strong>
            </span>
            {/* Readiness bar shown next to current readiness value */}
            <div className="w-24 sm:w-32 bg-[#F3F2EE] rounded-full h-2.5 p-0.5 border border-[#E4E2DA] overflow-hidden shrink-0">
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
      <div className="w-full bg-[#F3F2EE] rounded-full h-2.5 p-0.5 border border-[#E4E2DA] overflow-hidden">
        <div
          role="progressbar"
          aria-valuenow={currentScore}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Current spec readiness ${currentScore}%`}
          className={`${barColor} h-full rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${currentScore}%` }}
        />
      </div>

      <p className="text-[11px] text-[#6B6A63] leading-normal font-sans">
        Heuristic estimates specification clarity by penalizing unresolved contradictions and open decisions; not a formal specification guarantee.
      </p>
    </section>
  );
}
