import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import {
  lintTranscript,
  RateLimitError,
  ModelOverloadedError,
  ModelConfigError,
  ServerNotConfiguredError,
  InvalidModelOutputError,
} from '@/lib/llm';
import { LintRequestBody, LintResponseError, LintResponseSuccess } from '@/lib/types';

export const maxDuration = 60;

/**
 * Checks if the submitted transcript equals data/sample-transcript.txt after trimming whitespace,
 * and if data/sample-lint.json exists, returns the cached lint result.
 */
function getCachedSampleLint(submittedTranscript: string): Record<string, unknown> | null {
  try {
    const dataDir = path.resolve(process.cwd(), 'data');

    // 1. Locate sample transcript file (support sample-transcript.txt and sample transcript.txt)
    let sampleTranscriptPath = path.join(dataDir, 'sample-transcript.txt');
    if (!fs.existsSync(sampleTranscriptPath)) {
      sampleTranscriptPath = path.join(dataDir, 'sample transcript.txt');
    }
    if (!fs.existsSync(sampleTranscriptPath)) {
      return null;
    }

    const sampleContent = fs.readFileSync(sampleTranscriptPath, 'utf8');
    const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (normalize(submittedTranscript) !== normalize(sampleContent)) {
      return null;
    }

    // 2. Locate sample lint json file (support sample-lint.json and sample lint.json)
    let sampleLintPath = path.join(dataDir, 'sample-lint.json');
    if (!fs.existsSync(sampleLintPath)) {
      sampleLintPath = path.join(dataDir, 'sample lint.json');
    }
    if (!fs.existsSync(sampleLintPath)) {
      return null;
    }

    const lintContent = fs.readFileSync(sampleLintPath, 'utf8');
    const parsed = JSON.parse(lintContent);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const { requestId: _id, cached: _c, analysis: _a, ...rest } = parsed as Record<string, unknown>;
    return rest;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  let body: LintRequestBody;
  try {
    body = await request.json();
  } catch {
    console.error(`[${requestId}] Status: 400`);
    const errorResponse: LintResponseError = {
      requestId,
      error: {
        code: 'INVALID_TRANSCRIPT',
        message: 'Invalid JSON body. Expected an object with a transcript field.',
      },
      code: 'INVALID_TRANSCRIPT',
      message: 'Invalid JSON body. Expected an object with a transcript field.',
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  const { transcript } = body;

  if (typeof transcript !== 'string' || transcript.length < 80 || transcript.length > 12000) {
    console.error(`[${requestId}] Status: 400`);
    const errorResponse: LintResponseError = {
      requestId,
      error: {
        code: 'INVALID_TRANSCRIPT',
        message: 'Transcript must be a string between 80 and 12,000 characters.',
      },
      code: 'INVALID_TRANSCRIPT',
      message: 'Transcript must be a string between 80 and 12,000 characters.',
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  // Check if transcript matches sample transcript and cached lint result exists
  const cachedLint = getCachedSampleLint(transcript);
  if (cachedLint) {
    console.log(`[${requestId}] Status: 200 (cached)`);
    const cachedResponse: LintResponseSuccess = {
      requestId,
      cached: true,
      ...cachedLint,
    } as LintResponseSuccess;
    return NextResponse.json(cachedResponse, { status: 200 });
  }

  // Custom user key and reasoning effort from headers (optional)
  const customKey = request.headers.get('x-groq-api-key') || undefined;
  const reasoningEffortHeader = request.headers.get('x-reasoning-effort') || undefined;
  const reasoningEffort =
    reasoningEffortHeader === 'low' || reasoningEffortHeader === 'medium' || reasoningEffortHeader === 'high'
      ? reasoningEffortHeader
      : undefined;

  try {
    const result = await lintTranscript(transcript, customKey, reasoningEffort);
    console.log(`[${requestId}] Status: 200`);
    const { analysis: _analysis, ...cleanResult } = result as unknown as Record<string, unknown>;
    const successResponse: LintResponseSuccess = {
      requestId,
      ...cleanResult,
    } as LintResponseSuccess;
    return NextResponse.json(successResponse, { status: 200 });
  } catch (err) {
    if (err instanceof ServerNotConfiguredError) {
      console.error(`[${requestId}] Status: 500`);
      const errorResponse: LintResponseError = {
        requestId,
        error: {
          code: 'SERVER_NOT_CONFIGURED',
          message: err.message,
        },
        code: 'SERVER_NOT_CONFIGURED',
        message: err.message,
      };
      return NextResponse.json(errorResponse, { status: 500 });
    }

    if (err instanceof RateLimitError) {
      console.error(`[${requestId}] Status: 429`);
      const errorResponse: LintResponseError = {
        requestId,
        error: {
          code: 'RATE_LIMITED',
          message: err.message,
          retryAfterSeconds: err.retryAfterSeconds,
        },
        code: 'RATE_LIMITED',
        message: err.message,
        retryAfterSeconds: err.retryAfterSeconds,
      };
      return NextResponse.json(errorResponse, {
        status: 429,
        headers: {
          'Retry-After': String(err.retryAfterSeconds),
        },
      });
    }

    if (err instanceof ModelOverloadedError) {
      console.error(`[${requestId}] Status: 503`);
      const errorResponse: LintResponseError = {
        requestId,
        error: {
          code: 'MODEL_OVERLOADED',
          message: err.message,
          retryAfterSeconds: err.retryAfterSeconds,
        },
        code: 'MODEL_OVERLOADED',
        message: err.message,
        retryAfterSeconds: err.retryAfterSeconds,
      };
      return NextResponse.json(errorResponse, {
        status: 503,
        headers: {
          'Retry-After': String(err.retryAfterSeconds),
        },
      });
    }

    if (err instanceof ModelConfigError) {
      console.error(`[${requestId}] Status: 500`);
      const errorResponse: LintResponseError = {
        requestId,
        error: {
          code: 'MODEL_CONFIG_ERROR',
          message: err.message,
        },
        code: 'MODEL_CONFIG_ERROR',
        message: err.message,
      };
      return NextResponse.json(errorResponse, { status: 500 });
    }

    if (err instanceof InvalidModelOutputError) {
      console.error(`[${requestId}] Status: 502`);
      const errorResponse: LintResponseError = {
        requestId,
        error: {
          code: 'INVALID_MODEL_OUTPUT',
          message: err.message,
        },
        code: 'INVALID_MODEL_OUTPUT',
        message: err.message,
      };
      return NextResponse.json(errorResponse, { status: 502 });
    }

    // Generic unhandled internal error
    console.error(`[${requestId}] Status: 500`);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    const errorResponse: LintResponseError = {
      requestId,
      error: {
        code: 'INTERNAL_ERROR',
        message,
      },
      code: 'INTERNAL_ERROR',
      message,
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
