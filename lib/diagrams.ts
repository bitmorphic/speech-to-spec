import Groq from 'groq-sdk';
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
import { computeMaxCompletionTokens } from './test-cases';

export const diagramsResponseSchema = {
  type: 'object',
  properties: {
    flowchart: {
      type: 'string',
      description: 'Mermaid flowchart code starting with flowchart TD or flowchart LR',
    },
    erDiagram: {
      type: 'string',
      description: 'Mermaid entity-relationship diagram code starting with erDiagram',
    },
  },
  required: ['flowchart', 'erDiagram'],
  additionalProperties: false,
} as const;

const DIAGRAMS_SYSTEM_INSTRUCTION =
  'You are a software architect specialized in system documentation and Mermaid diagrams. ' +
  'Given an engineering specification markdown, generate two clean, strictly valid Mermaid diagram strings:\n\n' +
  '1. flowchart: A flowchart of the main user flow and key screen transitions. It MUST start with "flowchart TD" or "flowchart LR". ' +
  'All node labels containing spaces, punctuation, or parentheses MUST be enclosed in double quotes, e.g. NodeId["Node Label (details)"]. ' +
  'Use simple alphanumeric IDs for nodes (A, B, C or Step1, Step2).\n\n' +
  '2. erDiagram: An entity-relationship diagram of data models and storage entities. It MUST start with "erDiagram". ' +
  'Entities must list fields with types, e.g.:\n' +
  '  USER {\n' +
  '    string id PK\n' +
  '    string name\n' +
  '  }\n\n' +
  'CRITICAL MERMAID SYNTAX RULES:\n' +
  '- NEVER produce empty node labels like [""], (\'\'), or {""}. All nodes must have descriptive text, e.g. End1["End"] or Terminal["Exit"].\n' +
  '- Do NOT use comparison symbols (<, >) inside node labels or edge labels; write "is greater than" or "above" instead of ">" (e.g. NetDebtCond{"Net debt above 500?"}).\n' +
  '- A single per-level secret (such as an admin PIN) must not be modeled as an entity related to every user. Put it as an attribute of a setting entity and never mark a secret as a primary key.\n' +
  '- Return RAW Mermaid code in the strings. DO NOT wrap with markdown backticks (no ```mermaid or ```).\n' +
  '- Do NOT use HTML tags or forbidden characters inside labels.\n' +
  '- Both strings must be completely independent and directly parseable by mermaid.parse().';

const TOTAL_TIME_BUDGET_MS = 45_000;
const RETRY_DELAYS_MS = [4000, 10000, 20000];

async function callGroqDiagramsWithRetry(
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
            content: DIAGRAMS_SYSTEM_INSTRUCTION,
          },
          {
            role: 'user',
            content: specMarkdown,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'spec_diagrams',
            strict: true,
            schema: diagramsResponseSchema,
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
        throw new InvalidModelOutputError('Model returned empty diagrams response content');
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
 * Clean up and sanitize Mermaid flowchart code.
 */
export function cleanFlowchart(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```mermaid')) {
    cleaned = cleaned.replace(/^```mermaid\s*/i, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '');
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/```$/, '');
  }
  cleaned = cleaned.trim();

  // Fix empty node labels on flowchart nodes, e.g. NodeId[""] or NodeId[''] or NodeId[]
  cleaned = cleaned.replace(/([a-zA-Z0-9_-]+)\[\s*["']?\s*["']?\s*\]/g, '$1["End"]');
  cleaned = cleaned.replace(/([a-zA-Z0-9_-]+)\(\s*["']?\s*["']?\s*\)/g, '$1("End")');
  cleaned = cleaned.replace(/([a-zA-Z0-9_-]+)\{\s*["']?\s*["']?\s*\}/g, '$1{"End"}');

  return cleaned;
}

/**
 * Clean up and sanitize Mermaid erDiagram code.
 */
export function cleanErDiagram(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```mermaid')) {
    cleaned = cleaned.replace(/^```mermaid\s*/i, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '');
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/```$/, '');
  }
  cleaned = cleaned.trim();

  // Convert array types like string[] or string["End"] to string_array
  cleaned = cleaned.replace(/([a-zA-Z0-9_]+)\[\s*["']?.*?["']?\s*\]\s+([a-zA-Z0-9_]+)/g, '$1_array $2');
  cleaned = cleaned.replace(/([a-zA-Z0-9_]+)\[\]\s+([a-zA-Z0-9_]+)/g, '$1_array $2');

  return cleaned;
}

/**
 * Backwards compatibility helper
 */
export function cleanMermaidCode(raw: string): string {
  if (raw.includes('erDiagram')) {
    return cleanErDiagram(raw);
  }
  return cleanFlowchart(raw);
}

/**
 * Generates Mermaid flowchart and erDiagram from spec markdown.
 * Low reasoning effort, strict JSON schema, 1 retry for invalid output.
 * Never logs specs or keys.
 */
export async function generateDiagrams(
  specMarkdown: string,
  userApiKey?: string,
  reasoningEffort?: 'high' | 'medium' | 'low'
): Promise<{ flowchart: string; erDiagram: string }> {
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
      const responseText = await callGroqDiagramsWithRetry(
        groq,
        specMarkdown,
        startTime,
        reasoningEffort || 'low'
      );

      let parsed: { flowchart?: unknown; erDiagram?: unknown };
      try {
        parsed = JSON.parse(responseText);
      } catch {
        throw new InvalidModelOutputError('Model returned invalid JSON for diagrams');
      }

      if (
        !parsed ||
        typeof parsed.flowchart !== 'string' ||
        typeof parsed.erDiagram !== 'string'
      ) {
        throw new InvalidModelOutputError('Model output missing flowchart or erDiagram string');
      }

      return {
        flowchart: cleanFlowchart(parsed.flowchart),
        erDiagram: cleanErDiagram(parsed.erDiagram),
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

  throw lastError || new InvalidModelOutputError('Failed to generate valid diagrams after retry.');
}

