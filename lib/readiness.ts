import { Contradiction, MissingDecision, Question } from './types';

export interface ReadinessScoreResult {
  baselineScore: number;
  currentScore: number;
}

/**
 * Calculates heuristic spec readiness before and after answers are applied.
 * Penalty rules:
 * - High severity contradiction: 15 pts
 * - Medium severity contradiction: 8 pts
 * - Missing architectural decision: 4 pts
 * Unanswered factor:
 * - Answered with text: 0.0 (resolved)
 * - Answered with "you decide": 0.5 (half penalty)
 * - Unanswered: 1.0 (full penalty)
 */
export function calculateReadinessScore(
  contradictions: Contradiction[] = [],
  missingDecisions: MissingDecision[] = [],
  questions: Question[] = [],
  answers: Record<string, { text?: string; youDecide?: boolean }> = {}
): ReadinessScoreResult {
  // Baseline initial score before any answers are applied
  let baselinePenalty = 0;
  for (const c of contradictions) {
    if (c.severity === 'high') {
      baselinePenalty += 15;
    } else {
      baselinePenalty += 8;
    }
  }
  baselinePenalty += missingDecisions.length * 4;
  const baselineScore = Math.max(0, 100 - baselinePenalty);

  // Dynamic score based on provided answers
  const getFindingUnansweredFactor = (findingId: string): number => {
    const tiedQuestions = questions.filter(
      (q) => q.relatesTo && q.relatesTo.includes(findingId)
    );

    if (tiedQuestions.length === 0) return 1.0;

    let sumFactor = 0;
    for (const q of tiedQuestions) {
      const ans = answers[q.id];
      if (ans?.youDecide) {
        sumFactor += 0.5;
      } else if (ans?.text && ans.text.trim().length > 0) {
        sumFactor += 0.0;
      } else {
        sumFactor += 1.0;
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

  const currentScore = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  return {
    baselineScore,
    currentScore,
  };
}

