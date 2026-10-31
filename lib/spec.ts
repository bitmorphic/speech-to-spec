import Groq from 'groq-sdk';
import { specResponseSchema } from './spec-schema';
import { AnswerItem, LintResult, SpecResult } from './types';
import {
  GROQ_MODEL_ID,
  ServerNotConfiguredError,
  RateLimitError,
  ModelOverloadedError,
  ModelConfigError,
  InvalidModelOutputError,
  parseGroqError,
  ParsedGroqError,
} from './llm';

const SPEC_SYSTEM_INSTRUCTION =
  'You are an expert technical specification writer and software architect. ' +
  'You generate an exhaustive, unambiguous engineering specification from a raw speech transcript, lint findings, and user-provided answers. ' +
  'Follow these rules strictly:\n' +
  '1. Answer Conflicts: In answerConflicts, report ONLY two kinds of problem:\n' +
  '   - A pair of chosen answers that cannot both be true (for example, one answer deletes phone numbers after booking while another relies on phone number lookup).\n' +
  '   - A chosen answer that fails to resolve the contradiction it was asked about.\n' +
  '   A contradiction from the lint result that the chosen answer already resolves must never be reported. ' +
  'If there are no answer conflicts, return an empty array [] in answerConflicts and do NOT add a "Known Conflicts" section to specMarkdown.\n' +
  '2. Source of Truth: Write the spec from the transcript and the answers. Answers strictly overwrite the transcript where they conflict.\n' +
  '3. Self-Corrections: Self-corrections are resolved with the last statement winning.\n' +
  '4. Delegated Decisions: Anything marked "you decide" gets a conservative, production-ready default listed under Assumptions and is labeled as assumed in the decisions log.\n' +
  '5. Uncovered Items: Any missing decisions and contradictions from the lint findings that no question covered must go under a section called "Open Items" with a recommended default. Never silently decide.\n' +
  '6. Strict Scope Guard: The spec must never introduce technologies, mechanisms, storage format, security details, or features that the speaker did not state and that no answer chose (such as service workers, offline caching layers, specific hash algorithms, or PIN lengths). If something seems necessary it goes under Open Items with a recommended default. The acceptance checklist may only contain items traceable to the transcript or an answer.\n' +
  '7. Known Conflicts: Only if there are answer conflicts, include a section at the very top of specMarkdown titled "Known Conflicts" detailing each conflict and the suggested fix. If there are none, omit this section completely.\n' +
  '8. Required Sections: The specMarkdown must include these exact sections, each with concrete acceptance criteria where applicable:\n' +
  '   - Overview\n' +
  '   - Goals\n' +
  '   - Non-goals\n' +
  '   - Users\n' +
  '   - Core features\n' +
  '   - Data and storage\n' +
  '   - Screens and flows\n' +
  '   - Rules and edge cases\n' +
  '   - Assumptions\n' +
  '   - Open Items\n' +
  '   - Decisions log, where every row is labeled with exactly one of stated, answered, or assumed (treating any questions marked "you decide" as assumed)\n' +
  '   - Acceptance checklist with checkboxes (- [ ]) containing only items traceable to the transcript or an answer\n' +
  'Write it so a coding agent could build the product from it with no further questions.';

const TOTAL_TIME_BUDGET_MS = 45_000;
const RETRY_DELAYS_MS = [4000, 10000, 20000];

async function callGroqSpecWithRetry(
  groq: Groq,
  promptPayload: string,
  startTime: number,
  reasoningEffort: 'high' | 'medium' | 'low' = 'high'
): Promise<string> {
  let lastParsedError: ParsedGroqError | null = null;
  let lastRawError: unknown = null;

  const maxAttempts = 1 + RETRY_DELAYS_MS.length;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= TOTAL_TIME_BUDGET_MS) {
      break;
    }

    try {
      const completion = (await groq.chat.completions.create({
        model: GROQ_MODEL_ID,
        messages: [
          {
            role: 'system',
            content: SPEC_SYSTEM_INSTRUCTION,
          },
          {
            role: 'user',
            content: promptPayload,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'spec_document',
            strict: true,
            schema: specResponseSchema,
          },
        },
        stream: false,
        max_completion_tokens: 16384,
        reasoning_effort: reasoningEffort,
        reasoning_format: 'parsed',
      } as unknown as Parameters<typeof groq.chat.completions.create>[0])) as unknown as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };

      const content = completion.choices?.[0]?.message?.content;
      if (!content) {
        throw new InvalidModelOutputError('Model returned empty spec response content');
      }

      return content;
    } catch (err) {
      lastRawError = err;
      const parsed = parseGroqError(err);
      lastParsedError = parsed;

      if (parsed.status === 400 && parsed.isUnsupportedResponseFormat) {
        throw new ModelConfigError(parsed.message);
      }

      if (parsed.status === 400 && parsed.isJsonValidateFailed) {
        throw new InvalidModelOutputError(parsed.message);
      }

      if (parsed.status === 429) {
        throw new RateLimitError(parsed.retryAfterSeconds ?? 60);
      }

      const isRetryable =
        parsed.status === 500 ||
        parsed.status === 503 ||
        parsed.status === 504;

      if (!isRetryable) {
        throw err;
      }

      const retryIndex = attempt - 1;
      if (retryIndex < RETRY_DELAYS_MS.length) {
        const baseMs = RETRY_DELAYS_MS[retryIndex];
        const jitter = Math.floor(Math.random() * 1000);
        const delay = baseMs + jitter;

        const timeRemaining = TOTAL_TIME_BUDGET_MS - (Date.now() - startTime);
        if (delay >= timeRemaining) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (lastParsedError) {
    if (
      lastParsedError.status === 500 ||
      lastParsedError.status === 503 ||
      lastParsedError.status === 504
    ) {
      throw new ModelOverloadedError(20, 'The model is busy. Please try again shortly.');
    }
  }

  throw lastRawError || new ModelOverloadedError(20, 'The model is busy. Please try again shortly.');
}

/**
 * Generates an exhaustive engineering spec using Groq with structured outputs (strict: true),
 * high reasoning effort with parsed reasoning, transient retries within 45s, and a single retry on invalid JSON.
 * Never logs transcripts or keys.
 */
export async function generateSpec(
  transcript: string,
  lintResult: LintResult,
  answers: AnswerItem[],
  userApiKey?: string,
  reasoningEffort?: 'high' | 'medium' | 'low'
): Promise<SpecResult> {
  const apiKey = (userApiKey && userApiKey.trim() !== '') ? userApiKey.trim() : process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new ServerNotConfiguredError();
  }

  const groq = new Groq({ apiKey });
  const startTime = Date.now();

  const promptPayload = JSON.stringify({
    transcript,
    lintSummary: lintResult.summary,
    selfCorrections: lintResult.selfCorrections,
    contradictions: lintResult.contradictions,
    missingDecisions: lintResult.missingDecisions,
    questions: lintResult.questions,
    userAnswers: answers.map((a) => ({
      questionId: a.questionId,
      answer: a.youDecide ? '[YOU DECIDE - USE CONSERVATIVE DEFAULT]' : a.text,
      youDecide: a.youDecide,
    })),
  });

  const maxModelRetries = 2; // Initial attempt + 1 single retry for malformed JSON
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxModelRetries; attempt++) {
    if (Date.now() - startTime >= TOTAL_TIME_BUDGET_MS) {
      break;
    }

    try {
      const responseText = await callGroqSpecWithRetry(
        groq,
        promptPayload,
        startTime,
        reasoningEffort || 'high'
      );

      let parsed: Partial<SpecResult>;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        throw new InvalidModelOutputError('Model returned invalid JSON for spec');
      }

      if (typeof parsed.specMarkdown !== 'string' || !parsed.specMarkdown.trim()) {
        throw new InvalidModelOutputError('Model spec output missing specMarkdown string');
      }

      const answerConflicts = Array.isArray(parsed.answerConflicts)
        ? parsed.answerConflicts.map((ac) => ({
            questionIds: Array.isArray(ac.questionIds)
              ? ac.questionIds.filter((qid: unknown): qid is string => typeof qid === 'string')
              : [],
            description: typeof ac.description === 'string' ? ac.description : '',
            suggestedFix: typeof ac.suggestedFix === 'string' ? ac.suggestedFix : '',
          }))
        : [];

      return {
        answerConflicts,
        specMarkdown: parsed.specMarkdown.trim(),
      };
    } catch (err) {
      if (
        err instanceof ServerNotConfiguredError ||
        err instanceof RateLimitError ||
        err instanceof ModelOverloadedError ||
        err instanceof ModelConfigError
      ) {
        throw err;
      }

      if (err instanceof InvalidModelOutputError) {
        lastError = err;
        if (attempt < maxModelRetries && Date.now() - startTime < 40_000) {
          continue;
        }
        throw err;
      }

      throw err;
    }
  }

  throw lastError || new InvalidModelOutputError('Failed to generate valid spec output after retry.');
}
