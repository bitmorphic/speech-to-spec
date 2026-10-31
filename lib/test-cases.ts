import Groq from 'groq-sdk';
import { TestCase } from './types';
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

export const testCasesResponseSchema = {
  type: 'object',
  properties: {
    testCases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          given: { type: 'string' },
          when: { type: 'string' },
          then: { type: 'string' },
          relatedChecklistItem: { type: 'string' },
        },
        required: ['id', 'title', 'given', 'when', 'then', 'relatedChecklistItem'],
        additionalProperties: false,
      },
    },
  },
  required: ['testCases'],
  additionalProperties: false,
} as const;

const TEST_CASES_SYSTEM_INSTRUCTION =
  'You are a senior software QA and test automation specialist. ' +
  'Given an engineering specification markdown, generate at most 12 thorough, high-value BDD test cases. ' +
  'Each test case must test critical business logic, edge cases, acceptance checklist items, or core flows. ' +
  'For each test case provide:\n' +
  '- id: a short identifier like TC-01, TC-02, etc.\n' +
  '- title: a concise descriptive summary of the scenario tested\n' +
  '- given: the initial prerequisite state or context\n' +
  '- when: the action or event executed\n' +
  '- then: the observable outcome and assertions\n' +
  '- relatedChecklistItem: the exact acceptance checklist item from the specification that this test validates\n' +
  'Do not exceed 12 test cases. Ensure JSON strictly matches the schema.';

const TOTAL_TIME_BUDGET_MS = 45_000;
const RETRY_DELAYS_MS = [4000, 10000, 20000];

export function computeMaxCompletionTokens(inputLength: number): number {
  return Math.min(16384, Math.max(4096, Math.ceil(inputLength / 2)));
}

async function callGroqTestCasesWithRetry(
  groq: Groq,
  specMarkdown: string,
  startTime: number,
  reasoningEffort: 'high' | 'medium' | 'low' = 'low'
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
            content: TEST_CASES_SYSTEM_INSTRUCTION,
          },
          {
            role: 'user',
            content: specMarkdown,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'test_cases',
            strict: true,
            schema: testCasesResponseSchema,
          },
        },
        stream: false,
        max_completion_tokens: computeMaxCompletionTokens(specMarkdown.length),
        reasoning_effort: reasoningEffort,
        reasoning_format: 'parsed',
      } as unknown as Parameters<typeof groq.chat.completions.create>[0])) as unknown as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };

      const content = completion.choices?.[0]?.message?.content;
      if (!content) {
        throw new InvalidModelOutputError('Model returned empty test cases response content');
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

      // 400 JSON validation failure -> InvalidModelOutputError
      if (parsed.status === 400 && parsed.isJsonValidateFailed) {
        throw new InvalidModelOutputError(parsed.message);
      }

      // 429 rate limited -> Never retried
      if (parsed.status === 429) {
        throw new RateLimitError(parsed.retryAfterSeconds ?? 60);
      }

      // 500, 503, 504 -> Retry with backoff
      const isRetryable =
        parsed.status === 500 || parsed.status === 503 || parsed.status === 504;

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
 * Generates at most 12 test cases from spec markdown.
 * Low reasoning effort, strict JSON schema, 1 retry for invalid output.
 * Never logs specs or keys.
 */
export async function generateTestCases(
  specMarkdown: string,
  userApiKey?: string,
  reasoningEffort?: 'high' | 'medium' | 'low'
): Promise<{ testCases: TestCase[] }> {
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
      const responseText = await callGroqTestCasesWithRetry(
        groq,
        specMarkdown,
        startTime,
        reasoningEffort || 'low'
      );

      let parsed: { testCases?: unknown };
      try {
        parsed = JSON.parse(responseText);
      } catch {
        throw new InvalidModelOutputError('Model returned invalid JSON for test cases');
      }

      if (!parsed || !Array.isArray(parsed.testCases)) {
        throw new InvalidModelOutputError('Model output missing testCases array');
      }

      const validatedCases: TestCase[] = [];
      for (const item of parsed.testCases) {
        if (
          item &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).id === 'string' &&
          typeof (item as Record<string, unknown>).title === 'string' &&
          typeof (item as Record<string, unknown>).given === 'string' &&
          typeof (item as Record<string, unknown>).when === 'string' &&
          typeof (item as Record<string, unknown>).then === 'string' &&
          typeof (item as Record<string, unknown>).relatedChecklistItem === 'string'
        ) {
          validatedCases.push({
            id: (item as Record<string, unknown>).id as string,
            title: (item as Record<string, unknown>).title as string,
            given: (item as Record<string, unknown>).given as string,
            when: (item as Record<string, unknown>).when as string,
            then: (item as Record<string, unknown>).then as string,
            relatedChecklistItem: (item as Record<string, unknown>).relatedChecklistItem as string,
          });
        }
      }

      // Limit to at most 12 test cases as required
      return { testCases: validatedCases.slice(0, 12) };
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

  throw lastError || new InvalidModelOutputError('Failed to generate valid test cases after retry.');
}

