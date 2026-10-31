import fs from 'node:fs';
import path from 'node:path';
import { LintResponseSuccess, SpecResponseSuccess, Contradiction, MissingDecision, Question, SelfCorrection } from './types';
import { calculateReadinessScore } from './readiness';

export interface DecisionRow {
  id: string;
  decision: string;
  source: string;
  details: string;
}

export interface DecisionsSummary {
  statedCount: number;
  answeredCount: number;
  assumedCount: number;
  firstFive: DecisionRow[];
}

export interface CaseStudyData {
  id: string;
  name: string;
  filename: string;
  transcript: string;
  lintResult: LintResponseSuccess;
  answers: Record<string, { text?: string; youDecide?: boolean }>;
  specResult: SpecResponseSuccess;
  stats: {
    wordsCount: number;
    selfCorrectionsCount: number;
    contradictionsCount: number;
    questionsAnsweredCount: number;
    totalQuestionsCount: number;
    readinessBefore: number;
    readinessAfter: number;
  };
  decisions: DecisionsSummary;
}

/**
 * Validates session export structure using the exact same check that the import feature uses.
 */
export function isValidSessionExport(parsed: unknown): parsed is {
  transcript: string;
  lintResult: LintResponseSuccess;
  answers?: Record<string, { text?: string; youDecide?: boolean }>;
  specResult: SpecResponseSuccess;
} {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as Record<string, unknown>;

  if (typeof p.transcript !== 'string' || p.transcript.trim().length === 0) {
    return false;
  }

  if (
    !p.lintResult ||
    typeof p.lintResult !== 'object' ||
    !Array.isArray((p.lintResult as LintResponseSuccess).contradictions) ||
    !Array.isArray((p.lintResult as LintResponseSuccess).questions)
  ) {
    return false;
  }

  if (
    !p.specResult ||
    typeof p.specResult !== 'object' ||
    typeof (p.specResult as SpecResponseSuccess).specMarkdown !== 'string' ||
    (p.specResult as SpecResponseSuccess).specMarkdown.trim().length === 0
  ) {
    return false;
  }

  return true;
}

/**
 * Formats a clean human-readable case title from a filename (e.g. hostel-expense-splitter.json -> Hostel Expense Splitter)
 */
export function formatCaseName(filename: string): string {
  const base = filename.replace(/\.json$/i, '');
  const words = base.split(/[-_]+/).filter(Boolean);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Parses the Decisions Log table from the markdown specification.
 */
export function parseDecisionsLog(specMarkdown: string): DecisionsSummary {
  const lines = specMarkdown.split('\n');
  let inDecisionsLog = false;
  let statedCount = 0;
  let answeredCount = 0;
  let assumedCount = 0;
  const allRows: DecisionRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('# Decisions Log') || line.startsWith('## Decisions Log')) {
      inDecisionsLog = true;
      continue;
    }

    if (inDecisionsLog && (line.startsWith('# ') || line.startsWith('## '))) {
      // Reached next section
      break;
    }

    if (inDecisionsLog && line.startsWith('|') && line.endsWith('|')) {
      const parts = line.split('|').map((s) => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      // Skip markdown table header and divider rows (e.g. | ID | Decision | ... or |---|---|)
      if (parts.length >= 3) {
        if (parts[0].toLowerCase() === 'id' || parts[0].includes('---')) {
          continue;
        }

        const id = parts[0] || '';
        const decision = parts[1] || '';
        const source = parts[2] || '';
        const details = parts[3] || '';

        const srcLower = source.toLowerCase();
        if (srcLower.includes('stated') || srcLower.includes('transcript')) {
          statedCount++;
        } else if (srcLower.includes('answer')) {
          answeredCount++;
        } else if (srcLower.includes('assum')) {
          assumedCount++;
        } else {
          assumedCount++;
        }

        allRows.push({ id, decision, source, details });
      }
    }
  }

  // Fallback heuristic if no Decisions Log table was found
  if (allRows.length === 0) {
    // Scan markdown for decision lines
    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();
      if (lower.includes('(stated)') || lower.includes('[stated]')) statedCount++;
      if (lower.includes('(answered)') || lower.includes('[answered]')) answeredCount++;
      if (lower.includes('(assumed)') || lower.includes('[assumed]')) assumedCount++;
    }
  }

  return {
    statedCount,
    answeredCount,
    assumedCount,
    firstFive: allRows.slice(0, 5),
  };
}

/**
 * Loads all valid case studies from the server filesystem (data/cases/*.json).
 * Skips invalid or corrupted files.
 */
export function loadAllCaseStudies(): CaseStudyData[] {
  const casesDir = path.join(process.cwd(), 'data', 'cases');
  if (!fs.existsSync(/*turbopackIgnore: true*/ casesDir)) {
    return [];
  }

  const files = fs.readdirSync(/*turbopackIgnore: true*/ casesDir);
  const jsonFiles = files.filter((f) => f.endsWith('.json')).sort();
  const validCases: CaseStudyData[] = [];

  for (const file of jsonFiles) {
    const fullPath = path.join(casesDir, file);
    try {
      const content = fs.readFileSync(/*turbopackIgnore: true*/ fullPath, 'utf8');
      const parsed = JSON.parse(content);

      if (!isValidSessionExport(parsed)) {
        continue;
      }

      const transcript = parsed.transcript;
      const lintResult = parsed.lintResult;
      const answers = parsed.answers || {};
      const specResult = parsed.specResult;

      const wordsCount = transcript.trim().split(/\s+/).filter(Boolean).length;
      const selfCorrectionsCount = lintResult.selfCorrections?.length || 0;
      const contradictionsCount = lintResult.contradictions?.length || 0;
      const totalQuestionsCount = lintResult.questions?.length || 0;
      const questionsAnsweredCount = (lintResult.questions || []).filter((q) => {
        const a = answers[q.id];
        return Boolean(a?.youDecide || (a?.text && a.text.trim().length > 0));
      }).length;

      const { baselineScore: readinessBefore, currentScore: readinessAfter } = calculateReadinessScore(
        lintResult.contradictions,
        lintResult.missingDecisions,
        lintResult.questions,
        answers
      );

      const decisions = parseDecisionsLog(specResult.specMarkdown);

      validCases.push({
        id: file.replace(/\.json$/i, ''),
        name: formatCaseName(file),
        filename: file,
        transcript,
        lintResult,
        answers,
        specResult,
        stats: {
          wordsCount,
          selfCorrectionsCount,
          contradictionsCount,
          questionsAnsweredCount,
          totalQuestionsCount,
          readinessBefore,
          readinessAfter,
        },
        decisions,
      });
    } catch {
      // Gracefully skip corrupted files
    }
  }

  return validCases;
}

