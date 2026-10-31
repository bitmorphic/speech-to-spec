'use client';

import { useState, useEffect, useRef } from 'react';
import { SpecViewer } from '@/components/SpecViewer';
import { InstantHints } from '@/components/InstantHints';
import { TranscriptHighlighter } from '@/components/TranscriptHighlighter';
import { ConflictMap } from '@/components/ConflictMap';
import { ReadinessMeter } from '@/components/ReadinessMeter';
import { RecentSessionsDrawer } from '@/components/RecentSessionsDrawer';
import { AppHeader } from '@/components/AppHeader';
import { useSettings } from '@/components/SettingsContext';
import {
  loadStoredSessions,
  saveStoredSession,
  deleteStoredSession,
  clearAllStoredSessions,
  decompressSessionFromUrl,
  StoredSession,
} from '@/lib/session-storage';
import type {
  LintResponseSuccess,
  LintResponseError,
  SpecResponseSuccess,
  AnswerItem,
  TestCase,
} from '@/lib/types';

type StepperStep = 'input' | 'findings' | 'spec';

interface AppError {
  code: string;
  message: string;
  requestId?: string;
  retryAfterSeconds?: number;
  isAutoRetrying?: boolean;
}

interface QuestionAnswer {
  text: string;
  youDecide: boolean;
}

const LINT_LOADING_STATUSES = [
  'Reading transcript',
  'Checking for contradictions',
  'Drafting questions',
];

const SPEC_LOADING_STATUSES = [
  'Checking your answers',
  'Resolving answer conflicts',
  'Writing the spec',
  'Checking your answers, then writing the spec.',
];

export default function Home() {
  const [step, setStep] = useState<StepperStep>('input');
  const [transcript, setTranscript] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState<'lint' | 'spec'>('lint');
  const [loadingStatusIndex, setLoadingStatusIndex] = useState(0);

  const [lintResult, setLintResult] = useState<LintResponseSuccess | null>(null);
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>({});
  const [highlightedFindingId, setHighlightedFindingId] = useState<string | null>(null);

  const [specResult, setSpecResult] = useState<SpecResponseSuccess | null>(null);
  const [previousSpecMarkdown, setPreviousSpecMarkdown] = useState<string | null>(null);
  const [showConflictsWarning, setShowConflictsWarning] = useState(false);

  // Phase 2: Test cases and diagrams state
  const [testCases, setTestCases] = useState<TestCase[] | null>(null);
  const [isGeneratingTestCases, setIsGeneratingTestCases] = useState(false);
  const [testCasesError, setTestCasesError] = useState<string | null>(null);

  const [diagrams, setDiagrams] = useState<{ flowchart: string; erDiagram: string } | null>(null);
  const [isGeneratingDiagrams, setIsGeneratingDiagrams] = useState(false);
  const [diagramsError, setDiagramsError] = useState<string | null>(null);

  const [error, setError] = useState<AppError | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hasAutoRetriedOverload, setHasAutoRetriedOverload] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const [sampleLoading, setSampleLoading] = useState(false);
  const [findingsViewMode, setFindingsViewMode] = useState<'list' | 'map'>('list');
  const [isRecentDrawerOpen, setIsRecentDrawerOpen] = useState(false);
  const [storedSessions, setStoredSessions] = useState<StoredSession[]>([]);
  const [isReadOnlyReport, setIsReadOnlyReport] = useState(false);
  const { getApiHeaders } = useSettings();

  // Load recent sessions & check for shared report in URL hash
  useEffect(() => {
    setStoredSessions(loadStoredSessions());

    if (typeof window !== 'undefined' && window.location.hash.startsWith('#report=')) {
      const hashData = window.location.hash.slice(8);
      const decompressed = decompressSessionFromUrl(hashData);
      if (decompressed) {
        setTranscript(decompressed.transcript);
        setLintResult(decompressed.lintResult);
        setAnswers(decompressed.answers);
        setSpecResult(decompressed.specResult);
        setIsReadOnlyReport(true);
        setStep('spec');
      }
    }
  }, []);

  const abortControllerRef = useRef<AbortController | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const charCount = transcript.length;
  const isInputValid = charCount >= 80 && charCount <= 12000;

  // Rotate loading statuses while request is running
  useEffect(() => {
    if (isLoading) {
      setLoadingStatusIndex(0);
      const activeStatuses = loadingContext === 'lint' ? LINT_LOADING_STATUSES : SPEC_LOADING_STATUSES;
      statusIntervalRef.current = setInterval(() => {
        setLoadingStatusIndex((prev) => (prev + 1) % activeStatuses.length);
      }, 2500);
    } else {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
    }
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
    };
  }, [isLoading, loadingContext]);

  // Handle countdown interval
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      countdownTimerRef.current = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
    } else if (countdown === 0) {
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
      }
      // If countdown finished for an auto-retrying overloaded model, trigger retry
      if (error?.code === 'MODEL_OVERLOADED' && error.isAutoRetrying) {
        setCountdown(null);
        if (loadingContext === 'lint') {
          executeLint(transcript, true);
        } else {
          executeGenerateSpec(true);
        }
      }
    }
    return () => {
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
      }
    };
  }, [countdown, error, transcript, loadingContext]);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  // When user edits transcript: clear findings and spec
  const handleTranscriptChange = (newText: string) => {
    setTranscript(newText);
    if (lintResult) {
      setLintResult(null);
      setSpecResult(null);
      setStep('input');
    }
    if (error && error.code === 'INVALID_TRANSCRIPT') {
      setError(null);
    }
  };

  // Load sample transcript from GET /api/sample
  const handleLoadSample = async () => {
    if (isLoading || sampleLoading) return;
    setSampleLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/sample');
      if (!res.ok) {
        throw new Error('Could not load sample transcript');
      }
      const data = await res.json();
      if (typeof data.transcript === 'string') {
        handleTranscriptChange(data.transcript);
      }
    } catch {
      setError({
        code: 'SAMPLE_LOAD_ERROR',
        message: 'Could not load sample transcript. Please paste your text manually.',
      });
    } finally {
      setSampleLoading(false);
    }
  };

  // Perform lint request
  const executeLint = async (textToLint: string, isOverloadRetry = false) => {
    if (isLoading) return;
    if (textToLint.length < 80 || textToLint.length > 12000) {
      setError({
        code: 'INVALID_TRANSCRIPT',
        message: 'Transcript must be between 80 and 12,000 characters.',
      });
      return;
    }

    setIsLoading(true);
    setLoadingContext('lint');
    setError(null);
    setCountdown(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 55000);

    try {
      const res = await fetch('/api/lint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders('lint'),
        },
        body: JSON.stringify({ transcript: textToLint }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json().catch(() => null);

      if (res.status === 200 && data && data.summary) {
        setLintResult(data as LintResponseSuccess);
        setStep('findings');
        setHasAutoRetriedOverload(false);
        setError(null);
        setCountdown(null);
        return;
      }

      const errorData = data as LintResponseError | null;
      const rawCode = errorData?.code || errorData?.error?.code || 'INTERNAL_ERROR';
      const requestId = errorData?.requestId;
      const retryAfter = errorData?.retryAfterSeconds || errorData?.error?.retryAfterSeconds;

      if (res.status === 429 || rawCode === 'RATE_LIMITED') {
        const seconds = typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : 60;
        setCountdown(seconds);
        setError({
          code: 'RATE_LIMITED',
          message: 'Rate-limited. You can retry after the countdown completes.',
          requestId,
          retryAfterSeconds: seconds,
        });
      } else if (res.status === 503 || rawCode === 'MODEL_OVERLOADED' || rawCode === 'model overloaded') {
        const seconds = typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : 20;

        if (!hasAutoRetriedOverload && !isOverloadRetry) {
          setHasAutoRetriedOverload(true);
          setCountdown(seconds);
          setError({
            code: 'MODEL_OVERLOADED',
            message: 'The model is busy right now. Trying is safe.',
            requestId,
            retryAfterSeconds: seconds,
            isAutoRetrying: true,
          });
        } else {
          setError({
            code: 'MODEL_OVERLOADED',
            message: 'The model is busy right now. Trying is safe.',
            requestId,
            retryAfterSeconds: seconds,
            isAutoRetrying: false,
          });
        }
      } else if (rawCode === 'MODEL_CONFIG_ERROR' || rawCode === 'model config error') {
        setError({
          code: 'MODEL_CONFIG_ERROR',
          message: 'Something is misconfigured on the server.',
          requestId,
        });
      } else if (res.status === 500 && rawCode === 'SERVER_NOT_CONFIGURED') {
        setError({
          code: 'SERVER_NOT_CONFIGURED',
          message: 'Server not configured',
          requestId,
        });
      } else if (res.status === 502 || rawCode === 'INVALID_MODEL_OUTPUT') {
        setError({
          code: 'INVALID_MODEL_OUTPUT',
          message: 'The model returned something unreadable. Try again.',
          requestId,
        });
      } else if (res.status === 400 || rawCode === 'INVALID_TRANSCRIPT') {
        setError({
          code: 'INVALID_TRANSCRIPT',
          message: 'Transcript must be between 80 and 12,000 characters.',
          requestId,
        });
      } else {
        setError({
          code: rawCode,
          message: errorData?.message || 'An unexpected error occurred. Please try again.',
          requestId,
        });
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === 'AbortError') {
        setError({
          code: 'NETWORK_TIMEOUT',
          message: 'Network failure: request timed out at 55 seconds.',
        });
      } else {
        setError({
          code: 'NETWORK_FAILURE',
          message: 'Network failure. Could not reach server.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Perform spec generation request
  const executeGenerateSpec = async (isOverloadRetry = false) => {
    if (!lintResult || isLoading) return;

    setIsLoading(true);
    setLoadingContext('spec');
    setError(null);
    setCountdown(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 55000);

    const questions = lintResult.questions || [];
    const formattedAnswers: AnswerItem[] = questions.map((q) => {
      const a = answers[q.id];
      return {
        questionId: q.id,
        text: a?.youDecide ? '' : a?.text || '',
        youDecide: Boolean(a?.youDecide),
      };
    });

    try {
      const res = await fetch('/api/spec', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders('spec'),
        },
        body: JSON.stringify({
          transcript,
          lintResult,
          answers: formattedAnswers,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json().catch(() => null);

      if (res.status === 200 && data && data.specMarkdown) {
        const typedData = data as SpecResponseSuccess;
        // Feature 9: Keep previous spec version in state for line diff comparison
        if (specResult?.specMarkdown && specResult.specMarkdown !== typedData.specMarkdown) {
          setPreviousSpecMarkdown(specResult.specMarkdown);
        }
        setSpecResult(typedData);
        setStep('spec');
        setHasAutoRetriedOverload(false);
        setError(null);
        setCountdown(null);

        // If conflicts detected, prompt warning panel first
        if (typedData.answerConflicts && typedData.answerConflicts.length > 0) {
          setShowConflictsWarning(true);
        } else {
          setShowConflictsWarning(false);
        }

        // Feature 6: Save completed session to localStorage
        const answersObj: Record<string, QuestionAnswer> = {};
        for (const ans of formattedAnswers) {
          answersObj[ans.questionId] = { text: ans.text, youDecide: ans.youDecide };
        }
        const updatedSessions = saveStoredSession({
          transcript,
          lintResult,
          answers: answersObj,
          specResult: typedData,
        });
        setStoredSessions(updatedSessions);

        return;
      }

      const errorData = data as LintResponseError | null;
      const rawCode = errorData?.code || errorData?.error?.code || 'INTERNAL_ERROR';
      const requestId = errorData?.requestId;
      const retryAfter = errorData?.retryAfterSeconds || errorData?.error?.retryAfterSeconds;

      if (res.status === 429 || rawCode === 'RATE_LIMITED') {
        const seconds = typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : 60;
        setCountdown(seconds);
        setError({
          code: 'RATE_LIMITED',
          message: 'Rate-limited. You can retry after the countdown completes.',
          requestId,
          retryAfterSeconds: seconds,
        });
      } else if (res.status === 503 || rawCode === 'MODEL_OVERLOADED' || rawCode === 'model overloaded') {
        const seconds = typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : 20;

        if (!hasAutoRetriedOverload && !isOverloadRetry) {
          setHasAutoRetriedOverload(true);
          setCountdown(seconds);
          setError({
            code: 'MODEL_OVERLOADED',
            message: 'The model is busy right now. Trying is safe.',
            requestId,
            retryAfterSeconds: seconds,
            isAutoRetrying: true,
          });
        } else {
          setError({
            code: 'MODEL_OVERLOADED',
            message: 'The model is busy right now. Trying is safe.',
            requestId,
            retryAfterSeconds: seconds,
            isAutoRetrying: false,
          });
        }
      } else if (rawCode === 'MODEL_CONFIG_ERROR' || rawCode === 'model config error') {
        setError({
          code: 'MODEL_CONFIG_ERROR',
          message: 'Something is misconfigured on the server.',
          requestId,
        });
      } else if (res.status === 500 && rawCode === 'SERVER_NOT_CONFIGURED') {
        setError({
          code: 'SERVER_NOT_CONFIGURED',
          message: 'Server not configured',
          requestId,
        });
      } else if (res.status === 502 || rawCode === 'INVALID_MODEL_OUTPUT') {
        setError({
          code: 'INVALID_MODEL_OUTPUT',
          message: 'The model returned something unreadable. Try again.',
          requestId,
        });
      } else if (res.status === 400 || rawCode === 'INVALID_TRANSCRIPT' || rawCode === 'INVALID_ANSWERS') {
        setError({
          code: rawCode,
          message: errorData?.message || 'Invalid input or answers provided.',
          requestId,
        });
      } else {
        setError({
          code: rawCode,
          message: errorData?.message || 'Failed to generate specification. Please try again.',
          requestId,
        });
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === 'AbortError') {
        setError({
          code: 'NETWORK_TIMEOUT',
          message: 'Network failure: request timed out at 55 seconds.',
        });
      } else {
        setError({
          code: 'NETWORK_FAILURE',
          message: 'Network failure. Could not reach server.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Scroll to and highlight finding
  const handleScrollToFinding = (findingId: string) => {
    const el = document.getElementById(`finding-${findingId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedFindingId(findingId);
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedFindingId(null);
      }, 2000);
    }
  };

  const handleAnswerText = (questionId: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        text,
        youDecide: false,
      },
    }));
  };

  const handleQuickPick = (questionId: string, option: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        text: option,
        youDecide: false,
      },
    }));
  };

  const handleToggleYouDecide = (questionId: string) => {
    setAnswers((prev) => {
      const current = prev[questionId];
      const nextYouDecide = !current?.youDecide;
      return {
        ...prev,
        [questionId]: {
          text: nextYouDecide ? '' : current?.text || '',
          youDecide: nextYouDecide,
        },
      };
    });
  };

  // Import session JSON handler
  const handleImportSession = (session: {
    transcript: string;
    lintResult: LintResponseSuccess;
    answers: Record<string, QuestionAnswer>;
    specResult: SpecResponseSuccess;
  }) => {
    setTranscript(session.transcript);
    setLintResult(session.lintResult);
    setAnswers(session.answers);
    setSpecResult(session.specResult);
    setIsReadOnlyReport(false);
    setStep('spec');
    const updated = saveStoredSession(session);
    setStoredSessions(updated);
  };

  const handleSessionFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = JSON.parse(event.target?.result as string);
        if (raw.transcript) {
          handleImportSession(raw);
        }
      } catch (err) {
        console.error('Failed to parse session file', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Feature 7: Generate Test Cases via POST /api/tests
  const handleGenerateTestCases = async () => {
    if (!specResult?.specMarkdown) return;
    setIsGeneratingTestCases(true);
    setTestCasesError(null);
    try {
      const res = await fetch('/api/tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders('tests'),
        },
        body: JSON.stringify({ specMarkdown: specResult.specMarkdown }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 200 && data && Array.isArray(data.testCases)) {
        setTestCases(data.testCases);
      } else {
        const errorMsg = data?.error?.message || data?.message || 'Failed to generate test cases.';
        setTestCasesError(errorMsg);
      }
    } catch {
      setTestCasesError('Network failure. Could not reach server.');
    } finally {
      setIsGeneratingTestCases(false);
    }
  };

  // Feature 8: Generate Diagrams via POST /api/diagrams
  const handleGenerateDiagrams = async () => {
    if (!specResult?.specMarkdown) return;
    setIsGeneratingDiagrams(true);
    setDiagramsError(null);
    try {
      const res = await fetch('/api/diagrams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getApiHeaders('diagrams'),
        },
        body: JSON.stringify({ specMarkdown: specResult.specMarkdown }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 200 && data && data.flowchart && data.erDiagram) {
        setDiagrams({ flowchart: data.flowchart, erDiagram: data.erDiagram });
      } else {
        const errorMsg = data?.error?.message || data?.message || 'Failed to generate diagrams.';
        setDiagramsError(errorMsg);
      }
    } catch {
      setDiagramsError('Network failure. Could not reach server.');
    } finally {
      setIsGeneratingDiagrams(false);
    }
  };

  const totalQuestions = lintResult?.questions?.length || 0;
  const answeredQuestionsCount = (lintResult?.questions || []).filter((q) => {
    const a = answers[q.id];
    return Boolean(a?.youDecide || (a?.text && a.text.trim().length > 0));
  }).length;
  const questionsProgressPercent =
    totalQuestions > 0 ? (answeredQuestionsCount / totalQuestions) * 100 : 0;

  const allQuestionsSatisfied =
    totalQuestions === 0 ||
    (lintResult?.questions || []).every((q) => {
      const a = answers[q.id];
      return Boolean(a?.youDecide || (a?.text && a.text.trim().length > 0));
    });

  const activeLoadingStatuses =
    loadingContext === 'lint' ? LINT_LOADING_STATUSES : SPEC_LOADING_STATUSES;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Shared Header Navigation */}
      <AppHeader
        onOpenRecent={() => setIsRecentDrawerOpen(true)}
        recentCount={storedSessions.length}
        stepperSlot={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <span className="text-zinc-500 uppercase tracking-wider font-semibold">Workflow:</span>
              <span className="text-cyan-400 font-medium capitalize">{step}</span>
            </div>
            <nav aria-label="Progress" className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setStep('input')}
                disabled={isLoading}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                  step === 'input'
                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                1. Input
              </button>

              <span className="text-zinc-700 text-xs font-mono">&rarr;</span>

              <button
                onClick={() => {
                  if (lintResult) setStep('findings');
                }}
                disabled={!lintResult || isLoading}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                  step === 'findings'
                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40 font-medium'
                    : lintResult
                    ? 'text-zinc-300 hover:text-zinc-100'
                    : 'text-zinc-600 cursor-not-allowed'
                }`}
              >
                2. Findings
              </button>

              <span className="text-zinc-700 text-xs font-mono">&rarr;</span>

              <button
                onClick={() => {
                  if (specResult) setStep('spec');
                }}
                disabled={!specResult || isLoading}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                  step === 'spec'
                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/40 font-medium'
                    : specResult
                    ? 'text-zinc-300 hover:text-zinc-100'
                    : 'text-zinc-600 cursor-not-allowed'
                }`}
              >
                3. Spec
              </button>
            </nav>
          </div>
        }
      />

      {/* Main Container */}
      <main className={`flex-1 w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6 transition-all ${step === 'findings' || step === 'spec' ? 'max-w-7xl' : 'max-w-5xl'}`}>
        {/* Reusable Inline Error Banner */}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-rose-900/60 bg-rose-950/40 p-4 text-zinc-200 flex flex-col gap-3 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-rose-400 font-bold border border-rose-800/80 bg-rose-900/40 px-1.5 py-0.5 rounded">
                    Error
                  </span>
                  <span className="text-sm font-medium text-rose-200">
                    {error.message}
                  </span>
                </div>

                {countdown !== null && countdown > 0 && (
                  <p className="text-xs text-rose-300/80 font-mono mt-1">
                    {error.isAutoRetrying ? 'Auto-retrying in ' : 'Retry available in '}
                    <span className="text-cyan-400 font-bold">{countdown}s</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {error.code === 'MODEL_OVERLOADED' && !error.isAutoRetrying && (
                  <button
                    type="button"
                    onClick={() => {
                      if (loadingContext === 'lint') executeLint(transcript);
                      else executeGenerateSpec();
                    }}
                    disabled={isLoading}
                    className="px-3 py-1 text-xs font-mono bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-semibold rounded disabled:opacity-50 transition"
                  >
                    Retry Now
                  </button>
                )}

                {error.code === 'RATE_LIMITED' && countdown === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (loadingContext === 'lint') executeLint(transcript);
                      else executeGenerateSpec();
                    }}
                    disabled={isLoading}
                    className="px-3 py-1 text-xs font-mono bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-semibold rounded disabled:opacity-50 transition"
                  >
                    Retry Now
                  </button>
                )}

                {error.code === 'INVALID_MODEL_OUTPUT' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (loadingContext === 'lint') executeLint(transcript);
                      else executeGenerateSpec();
                    }}
                    disabled={isLoading}
                    className="px-3 py-1 text-xs font-mono bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-semibold rounded disabled:opacity-50 transition"
                  >
                    Try Again
                  </button>
                )}

                {(error.code === 'NETWORK_FAILURE' || error.code === 'NETWORK_TIMEOUT') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (loadingContext === 'lint') executeLint(transcript);
                      else executeGenerateSpec();
                    }}
                    disabled={isLoading}
                    className="px-3 py-1 text-xs font-mono bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-semibold rounded disabled:opacity-50 transition"
                  >
                    Retry
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-zinc-400 hover:text-zinc-200 text-xs font-mono px-1 py-1"
                  aria-label="Dismiss error"
                >
                  Dismiss
                </button>
              </div>
            </div>

            <div className="border-t border-rose-900/40 pt-2 text-xs">
              <button
                type="button"
                onClick={() => setShowDebug((prev) => !prev)}
                className="text-rose-400/80 hover:text-rose-300 font-mono text-[11px] underline underline-offset-2"
              >
                {showDebug ? 'Hide debug info' : 'Show debug info'}
              </button>
              {showDebug && (
                <div className="mt-2 p-2 rounded bg-zinc-950/80 border border-zinc-800 font-mono text-[11px] text-zinc-400 space-y-1">
                  <div>
                    <span className="text-zinc-500">Error Code:</span> {error.code}
                  </div>
                  {error.requestId && (
                    <div>
                      <span className="text-zinc-500">Request ID:</span> {error.requestId}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 1: INPUT STAGE */}
        {step === 'input' && (
          <section aria-labelledby="input-heading" className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h1 id="input-heading" className="text-lg font-semibold tracking-tight text-zinc-100">
                  Spoken Requirements Transcript
                </h1>
                <p className="text-xs text-zinc-400">
                  Paste raw speech or voice notes. Revisions with &quot;actually&quot; or &quot;scratch that&quot; automatically win.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleSessionFileUpload}
                  accept=".json,application/json"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-750 border-zinc-700/80 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                  title="Import a previously saved session JSON file"
                >
                  Import Session
                </button>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  disabled={isLoading || sampleLoading}
                  className="px-3 py-1.5 text-xs font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-700/80 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                >
                  {sampleLoading ? 'Loading Sample...' : 'Load Sample'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="transcript" className="sr-only">
                Voice transcript input
              </label>
              <textarea
                id="transcript"
                value={transcript}
                onChange={(e) => handleTranscriptChange(e.target.value)}
                disabled={isLoading}
                rows={10}
                placeholder="Example: I want to build an expense splitter for our hostel. Anyone can add an expense. Everything should be in browser only, no database. Actually no wait, scratch that, let's use SQLite locally. Each person sees only their own balance..."
                className="w-full rounded-lg bg-zinc-900/90 border border-zinc-800 px-4 py-3 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none disabled:opacity-60 transition"
              />

              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      charCount === 0
                        ? 'text-zinc-500'
                        : charCount < 80
                        ? 'text-amber-400'
                        : charCount > 12000
                        ? 'text-rose-400 font-bold'
                        : 'text-cyan-400 font-medium'
                    }
                  >
                    {charCount.toLocaleString()} / 12,000 characters
                  </span>
                  {charCount > 0 && charCount < 80 && (
                    <span className="text-zinc-500 text-[11px]">
                      (min 80 required)
                    </span>
                  )}
                </div>

                <span className="text-zinc-600 text-[11px] hidden sm:inline">
                  Range: 80 - 12,000 characters
                </span>
              </div>

              {/* Feature 1: Instant Hints (rule-based detection with mirror text highlight) */}
              <InstantHints transcript={transcript} />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-zinc-500 font-mono">
                {isLoading && (
                  <span className="text-cyan-400 animate-pulse font-medium">
                    {activeLoadingStatuses[loadingStatusIndex]}...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {lintResult && (
                  <button
                    type="button"
                    onClick={() => setStep('findings')}
                    disabled={isLoading}
                    className="px-4 py-2 text-xs font-mono text-zinc-300 hover:text-zinc-100 border border-zinc-700 bg-zinc-900 rounded hover:bg-zinc-800 transition"
                  >
                    View Current Findings &rarr;
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => executeLint(transcript)}
                  disabled={!isInputValid || isLoading}
                  className="px-5 py-2 text-xs font-mono font-bold uppercase tracking-wider bg-cyan-500 hover:bg-cyan-400 text-zinc-950 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-cyan-950/40 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
                >
                  {isLoading ? 'Linting...' : 'Lint Transcript'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* LOADING SKELETON STATE */}
        {isLoading && (
          <section aria-label="Loading analysis" className="flex flex-col gap-4 animate-pulse">
            <div className="p-4 rounded-lg border border-cyan-900/40 bg-cyan-950/20 text-xs font-mono text-cyan-300">
              {activeLoadingStatuses[loadingStatusIndex]}...
            </div>
            <div className="h-28 bg-zinc-900/60 rounded-lg border border-zinc-800/60 w-full" />
            <div className="h-36 bg-zinc-900/60 rounded-lg border border-zinc-800/60 w-full" />
            <div className="h-36 bg-zinc-900/60 rounded-lg border border-zinc-800/60 w-full" />
          </section>
        )}

        {/* STEP 2: FINDINGS STAGE */}
        {!isLoading && step === 'findings' && lintResult && (
          <section aria-labelledby="findings-heading" className="flex flex-col gap-6">
            {/* Feature 4: Readiness Meter */}
            <ReadinessMeter
              contradictions={lintResult.contradictions}
              missingDecisions={lintResult.missingDecisions}
              questions={lintResult.questions}
              answers={answers}
            />

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 id="findings-heading" className="text-base font-semibold text-zinc-100 tracking-tight">
                    Analysis Summary
                  </h2>
                  {lintResult.cached && (
                    <span className="px-2 py-0.5 text-[11px] font-mono rounded-full border border-cyan-500/40 bg-cyan-950/60 text-cyan-300 font-medium">
                      Sample results cached
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="text-xs font-mono text-zinc-400 hover:text-cyan-400 transition"
                >
                  &larr; Edit Transcript
                </button>
              </div>

              <p className="text-sm text-zinc-300 leading-relaxed">
                {lintResult.summary}
              </p>

              <div className="flex flex-wrap gap-2 pt-1 border-t border-zinc-800/80 text-xs font-mono">
                <span className="px-2 py-1 rounded bg-zinc-800/70 text-zinc-300 border border-zinc-700/60">
                  {lintResult.selfCorrections?.length || 0} self-corrections
                </span>
                <span className="px-2 py-1 rounded bg-zinc-800/70 text-zinc-300 border border-zinc-700/60">
                  {lintResult.contradictions?.length || 0} contradictions
                </span>
                <span className="px-2 py-1 rounded bg-zinc-800/70 text-zinc-300 border border-zinc-700/60">
                  {lintResult.missingDecisions?.length || 0} missing decisions
                </span>
                <span className="px-2 py-1 rounded bg-zinc-800/70 text-zinc-300 border border-zinc-700/60">
                  {lintResult.questions?.length || 0} clarifying questions
                </span>
              </div>
            </div>

            {/* Split layout: Findings Left, Feature 2 Transcript Highlighter Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (7 cols): Findings List / Graph */}
              <div className="lg:col-span-7 flex flex-col gap-6">

            {/* Self-Corrections Resolved */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                  Self-Corrections Resolved
                </h3>
                <span className="text-xs font-mono text-zinc-500">
                  ({lintResult.selfCorrections?.length || 0})
                </span>
              </div>

              {(!lintResult.selfCorrections || lintResult.selfCorrections.length === 0) ? (
                <div className="p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/30 text-xs text-zinc-500 font-mono">
                  No self-corrections detected in transcript.
                </div>
              ) : (
                <div className="grid gap-3">
                  {lintResult.selfCorrections.map((sc) => (
                    <article
                      key={sc.id}
                      id={`finding-${sc.id}`}
                      className={`p-4 rounded-lg border transition-all ${
                        highlightedFindingId === sc.id
                          ? 'border-cyan-400 bg-cyan-950/40 ring-2 ring-cyan-400/50'
                          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                        <span className="font-mono text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                          {sc.id}
                        </span>
                        <span className="text-[11px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded border border-cyan-500/40 bg-cyan-950/60 text-cyan-300">
                          Last statement wins
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2 font-mono text-xs sm:text-sm">
                        <span className="line-through text-zinc-500 bg-zinc-950/80 px-2 py-1 rounded border border-zinc-800/80 break-words">
                          &quot;{sc.earlierQuote}&quot;
                        </span>
                        <span className="text-zinc-600 hidden sm:inline">&rarr;</span>
                        <span className="text-cyan-300 font-semibold bg-cyan-950/70 border border-cyan-800/80 px-2 py-1 rounded break-words">
                          &quot;{sc.finalQuote}&quot;
                        </span>
                      </div>

                      <p className="text-xs text-zinc-300 leading-normal">
                        <span className="text-zinc-500 font-mono">Resolution:</span> {sc.resolution}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* Contradictions & Feature 3: Conflict Map */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                    Contradictions
                  </h3>
                  <span className="text-xs font-mono text-zinc-500">
                    ({lintResult.contradictions?.length || 0})
                  </span>
                </div>

                {lintResult.contradictions && lintResult.contradictions.length > 0 && (
                  <div className="flex items-center rounded border border-zinc-800 bg-zinc-950 p-0.5 text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setFindingsViewMode('list')}
                      className={`px-2.5 py-1 rounded transition ${
                        findingsViewMode === 'list'
                          ? 'bg-zinc-800 text-zinc-100 font-medium'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      List View
                    </button>
                    <button
                      type="button"
                      onClick={() => setFindingsViewMode('map')}
                      className={`px-2.5 py-1 rounded transition ${
                        findingsViewMode === 'map'
                          ? 'bg-zinc-800 text-cyan-300 font-medium'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      Conflict Map
                    </button>
                  </div>
                )}
              </div>

              {(!lintResult.contradictions || lintResult.contradictions.length === 0) ? (
                <div className="p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/30 text-xs text-zinc-500 font-mono">
                  No contradictions identified.
                </div>
              ) : findingsViewMode === 'map' ? (
                <ConflictMap
                  contradictions={lintResult.contradictions}
                  questions={lintResult.questions}
                  onSelectContradiction={(id) => handleScrollToFinding(id)}
                />
              ) : (
                <div className="grid gap-3">
                  {lintResult.contradictions.map((c) => (
                    <article
                      key={c.id}
                      id={`finding-${c.id}`}
                      className={`p-4 rounded-lg border transition-all ${
                        highlightedFindingId === c.id
                          ? 'border-cyan-400 bg-cyan-950/40 ring-2 ring-cyan-400/50'
                          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="font-mono text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                          {c.id}
                        </span>
                        <span
                          className={`text-[11px] font-mono uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${
                            c.severity === 'high'
                              ? 'border-rose-800/80 bg-rose-950/60 text-rose-300'
                              : 'border-amber-800/80 bg-amber-950/60 text-amber-300'
                          }`}
                        >
                          {c.severity} severity
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3 font-mono text-xs">
                        <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800/90 flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                            Quote A
                          </span>
                          <span className="text-zinc-200 break-words">
                            &quot;{c.quoteA}&quot;
                          </span>
                        </div>
                        <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800/90 flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                            Quote B
                          </span>
                          <span className="text-zinc-200 break-words">
                            &quot;{c.quoteB}&quot;
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-300 leading-normal">
                        <span className="text-zinc-500 font-mono">Conflict Why:</span> {c.why}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* Missing Decisions */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                  Missing Decisions
                </h3>
                <span className="text-xs font-mono text-zinc-500">
                  ({lintResult.missingDecisions?.length || 0})
                </span>
              </div>

              {(!lintResult.missingDecisions || lintResult.missingDecisions.length === 0) ? (
                <div className="p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/30 text-xs text-zinc-500 font-mono">
                  No missing architectural decisions reported.
                </div>
              ) : (
                <div className="grid gap-3">
                  {lintResult.missingDecisions.map((md) => (
                    <article
                      key={md.id}
                      id={`finding-${md.id}`}
                      className={`p-4 rounded-lg border transition-all ${
                        highlightedFindingId === md.id
                          ? 'border-cyan-400 bg-cyan-950/40 ring-2 ring-cyan-400/50'
                          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                          {md.id}
                        </span>
                        <span className="text-xs font-bold text-zinc-200 font-mono">
                          {md.topic}
                        </span>
                      </div>

                      <p className="text-xs text-zinc-300 leading-normal">
                        <span className="text-zinc-500 font-mono">Why It Matters:</span>{' '}
                        {md.whyItMatters}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* Clarifying Questions */}
            <div className="flex flex-col gap-4 border-t border-zinc-800 pt-6">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300">
                      Clarifying Questions
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Resolve ambiguity by picking an option or typing your answer before generating the spec.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-zinc-400">
                    {totalQuestions} questions
                  </span>
                </div>

                {/* Questions Progress Bar */}
                {totalQuestions > 0 && (
                  <div className="flex flex-col gap-1.5 p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400">
                        Progress:{' '}
                        <strong className="text-cyan-300 font-semibold">{answeredQuestionsCount}</strong> of{' '}
                        {totalQuestions} answered
                      </span>
                      <span className={allQuestionsSatisfied ? 'text-cyan-400 font-bold' : 'text-zinc-500'}>
                        {Math.round(questionsProgressPercent)}%
                      </span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-cyan-500 h-full rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${questionsProgressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {(!lintResult.questions || lintResult.questions.length === 0) ? (
                <div className="p-4 rounded-lg border border-cyan-900/40 bg-cyan-950/20 text-xs text-cyan-300 font-mono">
                  No clarifying questions were needed for this transcript.
                </div>
              ) : (
                <div className="grid gap-4">
                  {lintResult.questions.map((q) => {
                    const ans = answers[q.id] || { text: '', youDecide: false };
                    const isSatisfied = ans.youDecide || (ans.text && ans.text.trim().length > 0);

                    return (
                      <div
                        key={q.id}
                        className={`p-4 rounded-lg border flex flex-col gap-3 transition-colors ${
                          isSatisfied
                            ? 'border-zinc-800 bg-zinc-900/60'
                            : 'border-zinc-700/80 bg-zinc-900/90'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div className="flex flex-col gap-1.5">
                            <span className="font-mono text-xs text-zinc-500">{q.id}</span>
                            <p className="text-sm font-medium text-zinc-100">
                              {q.question}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                            <span className="text-[11px] font-mono text-zinc-500">Relates to:</span>
                            {q.relatesTo && q.relatesTo.map((findingId) => (
                              <button
                                key={findingId}
                                type="button"
                                onClick={() => handleScrollToFinding(findingId)}
                                className="px-1.5 py-0.5 text-[11px] font-mono bg-zinc-800 hover:bg-cyan-950 hover:text-cyan-300 hover:border-cyan-500/60 text-zinc-300 border border-zinc-700 rounded transition"
                                title={`Click to jump to finding ${findingId}`}
                              >
                                #{findingId}
                              </button>
                            ))}
                          </div>
                        </div>

                        {q.options && q.options.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-xs font-mono text-zinc-500">Quick-pick:</span>
                            {q.options.map((opt, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleQuickPick(q.id, opt)}
                                disabled={ans.youDecide}
                                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                                  ans.text === opt && !ans.youDecide
                                    ? 'bg-cyan-950 text-cyan-300 border-cyan-500/80 font-medium'
                                    : 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border-zinc-700/80 disabled:opacity-40'
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                          <label htmlFor={`answer-${q.id}`} className="sr-only">
                            Your answer for question {q.id}
                          </label>
                          <input
                            id={`answer-${q.id}`}
                            type="text"
                            value={ans.text}
                            onChange={(e) => handleAnswerText(q.id, e.target.value)}
                            disabled={ans.youDecide}
                            placeholder={ans.youDecide ? 'Delegated to AI ("You Decide")' : 'Type custom decision or choose option...'}
                            className="flex-1 rounded bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:border-cyan-500 focus:outline-none disabled:opacity-40 transition"
                          />

                          <button
                            type="button"
                            onClick={() => handleToggleYouDecide(q.id)}
                            className={`px-3 py-1.5 text-xs font-mono font-medium rounded border transition ${
                              ans.youDecide
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/70'
                                : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/70'
                            }`}
                          >
                            {ans.youDecide ? '✓ You Decide' : 'You Decide'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Generate Clean Spec Action */}
              <div className="border-t border-zinc-800 pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs font-mono text-zinc-500">
                  {totalQuestions > 0 && !allQuestionsSatisfied ? (
                    <span className="text-amber-400">
                      Answer all questions or select &quot;You Decide&quot; to unlock spec generation.
                    </span>
                  ) : (
                    <span className="text-cyan-400">
                      Ready to generate clean specification.
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => executeGenerateSpec()}
                  disabled={!allQuestionsSatisfied || isLoading}
                  className="px-5 py-2.5 text-xs font-mono font-bold uppercase tracking-wider bg-cyan-500 hover:bg-cyan-400 text-zinc-950 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-cyan-950/40 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
                >
                  Generate Clean Spec &rarr;
                </button>
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Feature 2 Sticky Transcript Highlighter */}
          <div className="lg:col-span-5 lg:sticky lg:top-20">
            <TranscriptHighlighter
              transcript={transcript}
              lintResult={lintResult}
              activeFindingId={highlightedFindingId}
              onSelectFinding={(id) => handleScrollToFinding(id)}
            />
          </div>
        </div>
      </section>
    )}

    {/* STEP 3: SPEC STAGE */}
    {!isLoading && step === 'spec' && specResult && (
      <section aria-labelledby="spec-heading" className="w-full">
        <SpecViewer
          specMarkdown={specResult.specMarkdown}
          transcript={transcript}
          lintResult={lintResult}
          answers={answers}
          specResult={specResult}
          answerConflicts={specResult.answerConflicts}
          questions={lintResult?.questions}
          onBackToFindings={() => setStep('findings')}
          onStartOver={() => {
            setStep('input');
            setLintResult(null);
            setSpecResult(null);
            setShowConflictsWarning(true);
            setIsReadOnlyReport(false);
            setPreviousSpecMarkdown(null);
            setTestCases(null);
            setDiagrams(null);
            if (typeof window !== 'undefined' && window.location.hash) {
              history.replaceState(null, '', window.location.pathname);
            }
          }}
          showConflictsWarning={showConflictsWarning}
          onGenerateAnyway={() => setShowConflictsWarning(false)}
          isReadOnlyReport={isReadOnlyReport}
          onImportSession={handleImportSession}
          onExitReadOnly={() => {
            setIsReadOnlyReport(false);
            if (typeof window !== 'undefined' && window.location.hash) {
              history.replaceState(null, '', window.location.pathname);
            }
          }}
          previousSpecMarkdown={previousSpecMarkdown}
          testCases={testCases}
          isLoadingTestCases={isGeneratingTestCases}
          onGenerateTestCases={handleGenerateTestCases}
          testCasesError={testCasesError}
          diagrams={diagrams}
          isLoadingDiagrams={isGeneratingDiagrams}
          onGenerateDiagrams={handleGenerateDiagrams}
          diagramsError={diagramsError}
        />
      </section>
    )}
  </main>

  {/* Feature 6: Recent Sessions Drawer */}
  <RecentSessionsDrawer
    isOpen={isRecentDrawerOpen}
    onClose={() => setIsRecentDrawerOpen(false)}
    sessions={storedSessions}
    onSelectSession={handleImportSession}
    onDeleteSession={(id) => {
      const updated = deleteStoredSession(id);
      setStoredSessions(updated);
    }}
    onClearAll={() => {
      clearAllStoredSessions();
      setStoredSessions([]);
    }}
  />
</div>
);
}
