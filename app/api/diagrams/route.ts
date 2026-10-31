import { NextResponse } from 'next/server';
import { generateDiagrams } from '@/lib/diagrams';
import {
  RateLimitError,
  ModelOverloadedError,
  ModelConfigError,
  ServerNotConfiguredError,
  InvalidModelOutputError,
} from '@/lib/llm';
import { DiagramsRequestBody, DiagramsResponseSuccess, LintResponseError } from '@/lib/types';

export const maxDuration = 60;

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  let body: DiagramsRequestBody;
  try {
    body = await request.json();
  } catch {
    console.error(`[${requestId}] Status: 400`);
    const errorResponse: LintResponseError = {
      requestId,
      error: {
        code: 'INVALID_TRANSCRIPT',
        message: 'Invalid JSON body. Expected specMarkdown.',
      },
      code: 'INVALID_TRANSCRIPT',
      message: 'Invalid JSON body. Expected specMarkdown.',
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  const { specMarkdown } = body;

  if (typeof specMarkdown !== 'string' || specMarkdown.trim().length === 0) {
    console.error(`[${requestId}] Status: 400`);
    const errorResponse: LintResponseError = {
      requestId,
      error: {
        code: 'INVALID_TRANSCRIPT',
        message: 'specMarkdown must be a non-empty string.',
      },
      code: 'INVALID_TRANSCRIPT',
      message: 'specMarkdown must be a non-empty string.',
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  const customKey = request.headers.get('x-groq-api-key') || undefined;
  const reasoningEffortHeader = request.headers.get('x-reasoning-effort') || undefined;
  const reasoningEffort =
    reasoningEffortHeader === 'low' || reasoningEffortHeader === 'medium' || reasoningEffortHeader === 'high'
      ? reasoningEffortHeader
      : undefined;

  try {
    const { flowchart, erDiagram } = await generateDiagrams(specMarkdown, customKey, reasoningEffort);

    const successResponse: DiagramsResponseSuccess = {
      requestId,
      flowchart,
      erDiagram,
    };

    return NextResponse.json(successResponse, { status: 200 });
  } catch (err) {
    if (err instanceof ServerNotConfiguredError) {
      console.error(`[${requestId}] Status: 500 SERVER_NOT_CONFIGURED`);
      const errorResponse: LintResponseError = {
        requestId,
        error: {
          code: 'SERVER_NOT_CONFIGURED',
          message: 'Server not configured: GROQ_API_KEY environment variable is missing.',
        },
        code: 'SERVER_NOT_CONFIGURED',
        message: 'Server not configured: GROQ_API_KEY environment variable is missing.',
      };
      return NextResponse.json(errorResponse, { status: 500 });
    }

    if (err instanceof RateLimitError) {
      console.error(`[${requestId}] Status: 429 RATE_LIMITED retryAfter: ${err.retryAfterSeconds}`);
      const errorResponse: LintResponseError = {
        requestId,
        error: {
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded. Please wait before retrying.',
          retryAfterSeconds: err.retryAfterSeconds,
        },
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded. Please wait before retrying.',
        retryAfterSeconds: err.retryAfterSeconds,
      };
      return NextResponse.json(errorResponse, {
        status: 429,
        headers: { 'Retry-After': String(err.retryAfterSeconds) },
      });
    }

    if (err instanceof ModelOverloadedError) {
      console.error(`[${requestId}] Status: 503 MODEL_OVERLOADED`);
      const errorResponse: LintResponseError = {
        requestId,
        error: {
          code: 'MODEL_OVERLOADED',
          message: 'The model is busy. Please try again shortly.',
          retryAfterSeconds: err.retryAfterSeconds,
        },
        code: 'MODEL_OVERLOADED',
        message: 'The model is busy. Please try again shortly.',
        retryAfterSeconds: err.retryAfterSeconds,
      };
      return NextResponse.json(errorResponse, {
        status: 503,
        headers: { 'Retry-After': String(err.retryAfterSeconds) },
      });
    }

    if (err instanceof ModelConfigError) {
      console.error(`[${requestId}] Status: 500 MODEL_CONFIG_ERROR`);
      const errorResponse: LintResponseError = {
        requestId,
        error: {
          code: 'MODEL_CONFIG_ERROR',
          message: 'The model does not support the requested response format.',
        },
        code: 'MODEL_CONFIG_ERROR',
        message: 'The model does not support the requested response format.',
      };
      return NextResponse.json(errorResponse, { status: 500 });
    }

    if (err instanceof InvalidModelOutputError) {
      console.error(`[${requestId}] Status: 502 INVALID_MODEL_OUTPUT`);
      const errorResponse: LintResponseError = {
        requestId,
        error: {
          code: 'INVALID_MODEL_OUTPUT',
          message: err.message || 'The model returned an invalid or unparseable response.',
        },
        code: 'INVALID_MODEL_OUTPUT',
        message: err.message || 'The model returned an invalid or unparseable response.',
      };
      return NextResponse.json(errorResponse, { status: 502 });
    }

    console.error(`[${requestId}] Status: 500 INTERNAL_ERROR`);
    const errorResponse: LintResponseError = {
      requestId,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal server error occurred.',
      },
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal server error occurred.',
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

