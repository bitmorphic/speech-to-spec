import { LintResult, SelfCorrection, Contradiction, MissingDecision, Question } from './types';

/**
 * Normalizes whitespace, case, and punctuation for robust quote verification.
 */
export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  return text
    .toLowerCase()
    // Replace all unicode punctuation and symbols with a single space
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    // Collapse consecutive whitespace to a single space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifies if a quote appears as a verbatim substring in the normalized transcript.
 * Also enforces the maximum 25-word limit.
 */
export function verifyQuote(quote: string, normalizedTranscript: string): boolean {
  if (!quote || typeof quote !== 'string') {
    return false;
  }

  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 25) {
    return false;
  }

  const normalizedQuote = normalizeText(quote);
  if (!normalizedQuote) {
    return false;
  }

  return normalizedTranscript.includes(normalizedQuote);
}

export interface ValidationOutput {
  validated: LintResult;
  everythingDropped: boolean;
  questionsValid: boolean;
  droppedCount: {
    selfCorrections: number;
    contradictions: number;
  };
}

/**
 * Validates the raw model output against the original transcript:
 * 1. Normalizes whitespace, case, and punctuation.
 * 2. Verifies every quote appears in the transcript (max 25 words).
 * 3. Drops any self-corrections or contradictions whose quotes cannot be verified.
 * 4. Applies deterministic filter on contradictions against self-corrections:
 *    - Drops any contradiction where either quote matches, contains, or is contained by the earlier quote of any self-correction.
 *    - Drops any contradiction whose two quotes match a self-correction's earlier quote and final quote in either order.
 * 5. Removes dropped IDs and self-correction IDs from question relatesTo, and drops any question left with empty relatesTo.
 * 6. Keeps remaining questions even if fewer than three remain.
 */
export function validateLintResult(raw: Partial<LintResult>, transcript: string): ValidationOutput {
  const normalizedTranscript = normalizeText(transcript);

  const rawSelfCorrections = Array.isArray(raw.selfCorrections) ? raw.selfCorrections : [];
  const rawContradictions = Array.isArray(raw.contradictions) ? raw.contradictions : [];
  const rawMissingDecisions = Array.isArray(raw.missingDecisions) ? raw.missingDecisions : [];
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];

  // 1. Validate self-corrections (earlierQuote and finalQuote must both appear verbatim)
  const validSelfCorrections: SelfCorrection[] = [];
  let droppedSelfCorrections = 0;

  for (const item of rawSelfCorrections) {
    if (
      item &&
      typeof item.id === 'string' &&
      typeof item.earlierQuote === 'string' &&
      typeof item.finalQuote === 'string' &&
      typeof item.resolution === 'string' &&
      verifyQuote(item.earlierQuote, normalizedTranscript) &&
      verifyQuote(item.finalQuote, normalizedTranscript)
    ) {
      validSelfCorrections.push({
        id: item.id,
        earlierQuote: item.earlierQuote.trim(),
        finalQuote: item.finalQuote.trim(),
        resolution: item.resolution.trim(),
      });
    } else {
      droppedSelfCorrections++;
    }
  }

  // 2. Validate contradictions (quoteA and quoteB must both appear verbatim)
  const quoteVerifiedContradictions: Contradiction[] = [];
  let droppedContradictions = 0;

  for (const item of rawContradictions) {
    const severity = item?.severity === 'high' ? 'high' : item?.severity === 'medium' ? 'medium' : null;
    if (
      item &&
      typeof item.id === 'string' &&
      severity !== null &&
      typeof item.quoteA === 'string' &&
      typeof item.quoteB === 'string' &&
      typeof item.why === 'string' &&
      verifyQuote(item.quoteA, normalizedTranscript) &&
      verifyQuote(item.quoteB, normalizedTranscript)
    ) {
      quoteVerifiedContradictions.push({
        id: item.id,
        severity,
        quoteA: item.quoteA.trim(),
        quoteB: item.quoteB.trim(),
        why: item.why.trim(),
      });
    } else {
      droppedContradictions++;
    }
  }

  // 3. Deterministic filter: drop contradictions conflicting with self-corrections
  const finalContradictions: Contradiction[] = [];

  for (const c of quoteVerifiedContradictions) {
    const normA = normalizeText(c.quoteA);
    const normB = normalizeText(c.quoteB);

    let shouldDrop = false;

    for (const sc of validSelfCorrections) {
      const normEarlier = normalizeText(sc.earlierQuote);
      const normFinal = normalizeText(sc.finalQuote);

      if (normEarlier) {
        // Drop if either quote matches, contains, or is contained by the earlier quote of any self-correction
        const aConflictsWithEarlier =
          normA === normEarlier ||
          normA.includes(normEarlier) ||
          normEarlier.includes(normA);

        const bConflictsWithEarlier =
          normB === normEarlier ||
          normB.includes(normEarlier) ||
          normEarlier.includes(normB);

        if (aConflictsWithEarlier || bConflictsWithEarlier) {
          shouldDrop = true;
          break;
        }
      }

      // Also drop if two quotes match a self-correction's earlier quote and final quote in either order
      if (normEarlier && normFinal) {
        const matchesBothOrder1 = normA === normEarlier && normB === normFinal;
        const matchesBothOrder2 = normA === normFinal && normB === normEarlier;
        if (matchesBothOrder1 || matchesBothOrder2) {
          shouldDrop = true;
          break;
        }
      }
    }

    if (shouldDrop) {
      droppedContradictions++;
    } else {
      finalContradictions.push(c);
    }
  }

  // 4. Validate missing decisions (no quotes to verify, but validate required fields)
  const validMissingDecisions: MissingDecision[] = [];
  for (const item of rawMissingDecisions) {
    if (
      item &&
      typeof item.id === 'string' &&
      typeof item.topic === 'string' &&
      typeof item.whyItMatters === 'string' &&
      item.topic.trim() &&
      item.whyItMatters.trim()
    ) {
      validMissingDecisions.push({
        id: item.id,
        topic: item.topic.trim(),
        whyItMatters: item.whyItMatters.trim(),
      });
    }
  }

  // Allowed finding IDs for questions' relatesTo:
  // Must remove dropped IDs AND self-correction IDs!
  // Only valid remaining contradictions and missing decisions are allowed.
  const allowedFindingIdsForQuestions = new Set<string>([
    ...finalContradictions.map((f) => f.id),
    ...validMissingDecisions.map((f) => f.id),
  ]);

  // 5. Validate questions:
  // Remove any dropped IDs and any self-correction IDs from relatesTo.
  // Drop any question left with an empty relatesTo.
  const validQuestions: Question[] = [];
  for (const q of rawQuestions) {
    if (q && typeof q.id === 'string' && typeof q.question === 'string') {
      const rawOptions = Array.isArray(q.options)
        ? q.options.filter((opt): opt is string => typeof opt === 'string' && opt.trim().length > 0)
        : [];

      // Enforce 2 to 3 options
      let cleanOptions = rawOptions.slice(0, 3);
      if (cleanOptions.length < 2) {
        continue; // invalid question if fewer than 2 options
      }

      const rawRelatesTo = Array.isArray(q.relatesTo) ? q.relatesTo : [];
      const cleanRelatesTo = rawRelatesTo.filter(
        (id): id is string => typeof id === 'string' && allowedFindingIdsForQuestions.has(id)
      );

      // Drop any question left with an empty "relates to"
      if (cleanRelatesTo.length === 0) {
        continue;
      }

      validQuestions.push({
        id: q.id,
        question: q.question.trim(),
        relatesTo: cleanRelatesTo,
        options: cleanOptions,
      });
    }
  }

  // Keep remaining questions (up to 5), even if fewer than 3 remain
  const finalQuestions = validQuestions.slice(0, 5);
  const questionsValid = true;

  // Determine if everything was dropped:
  // If the model produced quote-bearing findings (selfCorrections or contradictions) and ALL were dropped,
  // or if all findings across all categories are empty.
  const totalRawQuotedFindings = rawSelfCorrections.length + rawContradictions.length;
  const totalValidQuotedFindings = validSelfCorrections.length + finalContradictions.length;
  const totalValidFindings = totalValidQuotedFindings + validMissingDecisions.length;

  const everythingDropped =
    (totalRawQuotedFindings > 0 && totalValidQuotedFindings === 0 && validMissingDecisions.length === 0) ||
    (rawSelfCorrections.length === 0 && rawContradictions.length === 0 && rawMissingDecisions.length === 0) ||
    totalValidFindings === 0;

  return {
    validated: {
      summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
      selfCorrections: validSelfCorrections,
      contradictions: finalContradictions,
      missingDecisions: validMissingDecisions,
      questions: finalQuestions,
    },
    everythingDropped,
    questionsValid,
    droppedCount: {
      selfCorrections: droppedSelfCorrections,
      contradictions: droppedContradictions,
    },
  };
}
