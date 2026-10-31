import Groq from 'groq-sdk';
import { lintResponseSchema } from './schema';
import { LintResult } from './types';
import { validateLintResult } from './validate';

export const GROQ_MODEL_ID = 'openai/gpt-oss-120b';

export class ServerNotConfiguredError extends Error {
  code = 'SERVER_NOT_CONFIGURED' as const;
  constructor(message = 'Server not configured: GROQ_API_KEY environment variable is missing.') {
    super(message);
    this.name = 'ServerNotConfiguredError';
  }
}

export class RateLimitError extends Error {
  code = 'RATE_LIMITED' as const;
  retryAfterSeconds: number;
  constructor(retryAfterSeconds = 60, message = 'Groq API rate limit exceeded.') {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ModelOverloadedError extends Error {
  code = 'MODEL_OVERLOADED' as const;
  retryAfterSeconds: number;
  constructor(retryAfterSeconds = 20, message = 'The model is busy. Please try again shortly.') {
    super(message);
    this.name = 'ModelOverloadedError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ModelConfigError extends Error {
  code = 'MODEL_CONFIG_ERROR' as const;
  constructor(message = 'The model does not support the requested response format.') {
    super(message);
    this.name = 'ModelConfigError';
  }
}

export class InvalidModelOutputError extends Error {
  code = 'INVALID_MODEL_OUTPUT' as const;
  constructor(message = 'Invalid model output: received malformed JSON or unverified schema.') {
    super(message);
    this.name = 'InvalidModelOutputError';
  }
}

const SYSTEM_INSTRUCTION =
  'Treat the input as speech with fillers, repetition and corrections. ' +
  'When the speaker revises with phrases like actually, no wait, scratch that, I mean, instead, on second thought or forget that, ' +
  'the later statement wins. Record it under selfCorrections and never as a contradiction. ' +
  'A statement that the speaker has revised is superseded and is no longer a requirement. ' +
  'Never use a superseded statement in a contradiction. ' +
  'Never ask a question about it and never put a self-correction ID in a question\'s "relates to". ' +
  'Before reporting anything, fill in analysis completely with constraints (listing every limit the speaker states, such as no login, browser-only storage, no database, and offline) ' +
  'and requirements (listing every distinct feature or rule the speaker asks for). ' +
  'Then derive contradictions by comparing every requirement against every constraint and against every other requirement. ' +
  'Check these conflict categories one by one and report every violated pair separately: ' +
  '- Identity-dependent features, such as personal data, personal balance, personal history, or admin roles, against no login or anonymous use (any feature that treats people as distinct individuals requires a way to know who the person is). ' +
  '- Private or restricted views against any screen that shows the same data to everyone. ' +
  '- Data shared across people or devices against browser-only or local-only storage. ' +
  '- Automatic actions, such as reminders or notifications, against no backend or offline constraint. ' +
  'Do not merge separate conflicts into one. ' +
  'A contradiction is two statements that are both still in force and cannot both hold, or that force a hidden tradeoff. ' +
  'When choosing a quote for a contradiction, pick the phrase that shows the conflicting requirement most directly and prefer the shortest one, under 15 words. ' +
  'Every quote must be a verbatim substring of the transcript, at most 25 words. ' +
  'Rate severity high only when the conflict blocks a core feature from working at all, and medium when it only degrades it. ' +
  'A missing decision is something an implementer must decide that the transcript does not settle, ' +
  'such as storage, authentication, platform, limits, edge cases, error states, ownership, deletion and time zones. ' +
  'If a feature needs data and the speaker never said how to get it (such as phone numbers for reminders), report it as a missing decision. ' +
  'List 4 to 6 missing decisions where they apply, including product-level ones such as rounding, editing versus deleting, group size limits, and recording settlements, ' +
  'not only the architectural ones. Prioritize decisions that change the architecture or core product behavior. ' +
  'Return three to five questions, ordered by impact, each answerable in one sentence, each tied to a finding, each with concrete options. ' +
  "Each question's options must be meaningfully different from each other with no duplicates. " +
  'Never ask something the transcript already answers, and never add requirements the speaker did not state.';

export interface ParsedGroqError {
  status: number;
  code: string;
  message: string;
  retryAfterSeconds?: number;
  isUnsupportedResponseFormat?: boolean;
  isJsonValidateFailed?: boolean;
}

export function parseGroqError(err: unknown): ParsedGroqError {
  let status = 500;
  let code = 'INTERNAL';
  let message = 'An unexpected error occurred';
  let retryAfterSeconds: number | undefined;
  let isUnsupportedResponseFormat = false;
  let isJsonValidateFailed = false;

  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;

    if (typeof anyErr.status === 'number') {
      status = anyErr.status;
    } else if (typeof anyErr.statusCode === 'number') {
      status = anyErr.statusCode;
    }

    if (typeof anyErr.message === 'string') {
      message = anyErr.message;
    }

    if (anyErr.error && typeof anyErr.error === 'object') {
      const subErr = anyErr.error as Record<string, unknown>;
      if (typeof subErr.message === 'string') {
        message = subErr.message;
      }
      if (typeof subErr.code === 'string') {
        code = subErr.code;
      }
    }

    // Parse nested JSON in message string if present (e.g. 400 {"error":{...}})
    if (typeof message === 'string' && message.includes('{')) {
      try {
        const jsonMatch = message.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          const parsedInner = JSON.parse(jsonMatch[1]);
          if (parsedInner.error) {
            if (typeof parsedInner.error.message === 'string') {
              message = parsedInner.error.message;
            }
            if (typeof parsedInner.error.code === 'string') {
              code = parsedInner.error.code;
            }
          }
        }
      } catch {
        // ignore parse error
      }
    }

    if (anyErr.headers && typeof anyErr.headers === 'object') {
      const headers = anyErr.headers as Record<string, string> | Headers;
      const headerVal =
        typeof (headers as Headers).get === 'function'
          ? (headers as Headers).get('retry-after')
          : (headers as Record<string, string>)['retry-after'];

      if (headerVal) {
        const parsed = parseInt(headerVal, 10);
        if (!isNaN(parsed) && parsed > 0) {
          retryAfterSeconds = parsed;
        }
      }
    }

    if (!retryAfterSeconds && typeof message === 'string') {
      const match = message.match(/retry\s+after\s+(\d+)/i) || message.match(/try\s+again\s+in\s+(\d+)/i);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > 0) {
          retryAfterSeconds = parsed;
        }
      }
    }

    if (status === 400) {
      const lower = message.toLowerCase();
      if (
        code === 'json_validate_failed' ||
        lower.includes('failed to validate json') ||
        lower.includes('failed to generate json')
      ) {
        isJsonValidateFailed = true;
      }
      if (
        lower.includes('response_format') ||
        lower.includes('response format') ||
        lower.includes('json_schema') ||
        lower.includes('not supported') ||
        lower.includes('unsupported')
      ) {
        isUnsupportedResponseFormat = true;
      }
    }
  }

  return { status, code, message, retryAfterSeconds, isUnsupportedResponseFormat, isJsonValidateFailed };
}

const TOTAL_TIME_BUDGET_MS = 45_000;
const RETRY_DELAYS_MS = [4000, 10000, 20000];

async function callGroqWithTransientRetry(
  groq: Groq,
  transcript: string,
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
            content: SYSTEM_INSTRUCTION,
          },
          {
            role: 'user',
            content: transcript,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'lint_analysis',
            strict: true,
            schema: lintResponseSchema,
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
        throw new InvalidModelOutputError('Model returned empty response content');
      }

      return content;
    } catch (err) {
      lastRawError = err;
      const parsed = parseGroqError(err);
      lastParsedError = parsed;

      // 400 response format unsupported -> ModelConfigError
      if (parsed.status === 400 && parsed.isUnsupportedResponseFormat) {
        throw new ModelConfigError(parsed.message);
      }

      // 400 JSON validation failure -> InvalidModelOutputError for single JSON retry
      if (parsed.status === 400 && parsed.isJsonValidateFailed) {
        throw new InvalidModelOutputError(parsed.message);
      }

      // 429 rate limited -> Never retried
      if (parsed.status === 429) {
        throw new RateLimitError(parsed.retryAfterSeconds ?? 60);
      }

      // 500, 503, 504 -> Retry with backoff
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
 * Invokes Groq with structured outputs (json_schema with strict: true),
 * high reasoning effort with parsed reasoning format, transient retries within 45s,
 * and 1 single retry for malformed JSON.
 * Never logs transcripts or keys.
 */
export async function lintTranscript(
  transcript: string,
  userApiKey?: string,
  reasoningEffort?: 'high' | 'medium' | 'low'
): Promise<LintResult> {
  const apiKey = (userApiKey && userApiKey.trim() !== '') ? userApiKey.trim() : process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new ServerNotConfiguredError();
  }

  const groq = new Groq({ apiKey });
  const startTime = Date.now();

  const maxModelRetries = 2; // Initial attempt + 1 single retry for invalid JSON
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxModelRetries; attempt++) {
    if (Date.now() - startTime >= TOTAL_TIME_BUDGET_MS) {
      break;
    }

    try {
      const responseText = await callGroqWithTransientRetry(
        groq,
        transcript,
        startTime,
        reasoningEffort || 'high'
      );

      let parsed: Partial<LintResult>;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        throw new InvalidModelOutputError('Model returned invalid JSON');
      }

      const { validated, everythingDropped } = validateLintResult(parsed, transcript);

      if (everythingDropped) {
        if (attempt < maxModelRetries && Date.now() - startTime < 40_000) {
          continue;
        }

        throw new InvalidModelOutputError(
          'All quotes in model findings failed verification against the transcript.'
        );
      }

      return validated;
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

  throw lastError || new InvalidModelOutputError('Failed to generate valid linting output after retry.');
}

