import { NextResponse } from 'next/server';
import { generateSpec } from '@/lib/spec';
import {
  RateLimitError,
  ModelOverloadedError,
  ModelConfigError,
  ServerNotConfiguredError,
  InvalidModelOutputError,
} from '@/lib/llm';
import {
  AnswerItem,
  LintResult,
  LintResponseError,
  SpecRequestBody,
  SpecResponseSuccess,
} from '@/lib/types';

export const maxDuration = 60;

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  let body: SpecRequestBody;
  try {
    body = await request.json();
  } catch {
    console.error(`[${requestId}] Status: 400`);
    const errorResponse: LintResponseError = {
      requestId,
      error: {
        code: 'INVALID_TRANSCRIPT',
        message: 'Invalid JSON body. Expected an object with transcript, lintResult, and answers.',
      },
      code: 'INVALID_TRANSCRIPT',
      message: 'Invalid JSON body. Expected an object with transcript, lintResult, and answers.',
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  const { transcript, lintResult, answers } = body;

  // 1. Validate transcript length
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

  // 2. Validate lintResult structure
  if (!lintResult || typeof lintResult !== 'object') {
    console.error(`[${requestId}] Status: 400`);
    const errorResponse: LintResponseError = {
      requestId,
      error: {
        code: 'INVALID_TRANSCRIPT',
        message: 'Missing or invalid lintResult in request body.',
      },
      code: 'INVALID_TRANSCRIPT',
      message: 'Missing or invalid lintResult in request body.',
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  const typedLintResult = lintResult as LintResult;
  const questions = Array.isArray(typedLintResult.questions) ? typedLintResult.questions : [];
  const validQuestionIds = new Set(questions.map((q) => q.id));

  // 3. Validate answers array & matching question IDs
  if (!Array.isArray(answers)) {
    console.error(`[${requestId}] Status: 400`);
    const errorResponse: LintResponseError = {
      requestId,
      error: {
        code: 'INVALID_ANSWERS',
        message: 'Answers field must be an array.',
      },
      code: 'INVALID_ANSWERS',
      message: 'Answers field must be an array.',
    };
    return NextResponse.json(errorResponse, { status: 400 });
  }

  const typedAnswers: AnswerItem[] = [];
  for (const a of answers) {
    if (
      !a ||
      typeof a !== 'object' ||
      typeof a.questionId !== 'string' ||
      typeof a.text !== 'string' ||
      typeof a.youDecide !== 'boolean'
    ) {
      console.error(`[${requestId}] Status: 400`);
      const errorResponse: LintResponseError = {
        requestId,
        error: {
          code: 'INVALID_ANSWERS',
          message: 'Each answer must include questionId, text, and youDecide flag.',
        },
        code: 'INVALID_ANSWERS',
        message: 'Each answer must include questionId, text, and youDecide flag.',
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    if (!validQuestionIds.has(a.questionId)) {
      console.error(`[${requestId}] Status: 400`);
      const errorResponse: LintResponseError = {
        requestId,
        error: {
          code: 'INVALID_ANSWERS',
          message: `Answer questionId "${a.questionId}" does not match any finding question ID.`,
        },
        code: 'INVALID_ANSWERS',
        message: `Answer questionId "${a.questionId}" does not match any finding question ID.`,
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    typedAnswers.push({
      questionId: a.questionId,
      text: a.text,
      youDecide: a.youDecide,
    });
  }

  const customKey = request.headers.get('x-groq-api-key') || undefined;
  const reasoningEffortHeader = request.headers.get('x-reasoning-effort') || undefined;
  const reasoningEffort =
    reasoningEffortHeader === 'low' || reasoningEffortHeader === 'medium' || reasoningEffortHeader === 'high'
      ? reasoningEffortHeader
      : undefined;

  try {
    const result = await generateSpec(
      transcript,
      typedLintResult,
      typedAnswers,
      customKey,
      reasoningEffort
    );
    console.log(`[${requestId}] Status: 200`);
    const successResponse: SpecResponseSuccess = {
      requestId,
      ...result,
    };
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

    console.error(`[${requestId}] Status: 500`);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred during spec generation.';
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

