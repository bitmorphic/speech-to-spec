export type ContradictionSeverity = 'high' | 'medium';

export interface SelfCorrection {
  id: string;
  earlierQuote: string;
  finalQuote: string;
  resolution: string;
}

export interface Contradiction {
  id: string;
  severity: ContradictionSeverity;
  quoteA: string;
  quoteB: string;
  why: string;
}

export interface MissingDecision {
  id: string;
  topic: string;
  whyItMatters: string;
}

export interface Question {
  id: string;
  question: string;
  relatesTo: string[];
  options: string[];
}

export interface LintResult {
  summary: string;
  selfCorrections: SelfCorrection[];
  contradictions: Contradiction[];
  missingDecisions: MissingDecision[];
  questions: Question[];
}

export interface LintResponseSuccess extends LintResult {
  requestId: string;
  cached?: boolean;
}

export type LintErrorCode =
  | 'SERVER_NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'MODEL_OVERLOADED'
  | 'model overloaded'
  | 'MODEL_CONFIG_ERROR'
  | 'model config error'
  | 'INVALID_MODEL_OUTPUT'
  | 'INVALID_TRANSCRIPT'
  | 'INVALID_ANSWERS'
  | 'INTERNAL_ERROR';

export interface LintErrorDetails {
  code: LintErrorCode;
  message: string;
  retryAfterSeconds?: number;
}

export interface LintResponseError {
  requestId: string;
  error: LintErrorDetails;
  code: LintErrorCode;
  message: string;
  retryAfterSeconds?: number;
}

export type LintResponse = LintResponseSuccess | LintResponseError;

export interface LintRequestBody {
  transcript?: unknown;
}

export interface AnswerItem {
  questionId: string;
  text: string;
  youDecide: boolean;
}

export interface AnswerConflict {
  questionIds: string[];
  description: string;
  suggestedFix: string;
}

export interface SpecResult {
  answerConflicts: AnswerConflict[];
  specMarkdown: string;
}

export interface SpecResponseSuccess extends SpecResult {
  requestId: string;
}

export interface SpecRequestBody {
  transcript?: unknown;
  lintResult?: unknown;
  answers?: unknown;
}

export interface TestCase {
  id: string;
  title: string;
  given: string;
  when: string;
  then: string;
  relatedChecklistItem: string;
}

export interface TestCasesResponseSuccess {
  requestId: string;
  testCases: TestCase[];
}

export interface TestCasesRequestBody {
  specMarkdown?: unknown;
}

export interface DiagramsResponseSuccess {
  requestId: string;
  flowchart: string;
  erDiagram: string;
}

export interface DiagramsRequestBody {
  specMarkdown?: unknown;
}

