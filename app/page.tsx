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
  const [isReadinessOpen, setIsReadinessOpen] = useState(false);
  const [isConflictMapOpen, setIsConflictMapOpen] = useState(false);
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
    <div className="min-h-screen bg-[#F8F8F7] text-[#1B1B18] flex flex-col font-sans">
      {/* Shared Header Navigation */}
      <AppHeader
        onOpenRecent={() => setIsRecentDrawerOpen(true)}
        recentCount={storedSessions.length}
        stepperSlot={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 text-xs font-sans text-[#6B6A63]">
              <span className="text-[#6B6A63] font-medium">Stage:</span>
              <span className="text-[#1B1B18] font-semibold capitalize">{step}</span>
            </div>
            <nav aria-label="Progress" className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setStep('input')}
                disabled={isLoading}
                className={`px-3 py-1 text-xs font-sans rounded-full transition-colors ${
                  step === 'input'
                    ? 'bg-white text-[#1B1B18] border border-[#E4E2DA] font-medium shadow-xs'
                    : 'text-[#6B6A63] hover:text-[#1B1B18]'
                }`}
              >
                1. Input
              </button>

              <span className="text-[#E4E2DA] text-xs">&rarr;</span>

              <button
                onClick={() => {
                  if (lintResult) setStep('findings');
                }}
                disabled={!lintResult || isLoading}
                className={`px-3 py-1 text-xs font-sans rounded-full transition-colors ${
                  step === 'findings'
                    ? 'bg-white text-[#1B1B18] border border-[#E4E2DA] font-medium shadow-xs'
                    : lintResult
                    ? 'text-[#1B1B18] hover:text-black'
                    : 'text-[#6B6A63]/50 cursor-not-allowed'
                }`}
              >
                2. Findings
              </button>

              <span className="text-[#E4E2DA] text-xs">&rarr;</span>

              <button
                onClick={() => {
                  if (specResult) setStep('spec');
                }}
                disabled={!specResult || isLoading}
                className={`px-3 py-1 text-xs font-sans rounded-full transition-colors ${
                  step === 'spec'
                    ? 'bg-white text-[#1B1B18] border border-[#E4E2DA] font-medium shadow-xs'
                    : specResult
                    ? 'text-[#1B1B18] hover:text-black'
                    : 'text-[#6B6A63]/50 cursor-not-allowed'
                }`}
              >
                3. Spec
              </button>
            </nav>
          </div>
        }
      />

      {/* Main Container */}
      <main className={`flex-1 w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6 transition-all ${step === 'findings' || step === 'spec' ? 'max-w-7xl' : 'max-w-3xl'}`}>
        {/* Reusable Inline Error Banner */}
        {error && (
          <div
            role="alert"
            className="rounded-[16px] border border-rose-200 bg-rose-50/90 p-4 sm:p-5 text-rose-950 flex flex-col gap-3 shadow-warm-xs transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-sans font-medium text-rose-900 border border-rose-300 bg-rose-100 px-2 py-0.5 rounded-full">
                    Notice
                  </span>
                  <span className="text-sm font-medium text-rose-900">
                    {error.message}
                  </span>
                </div>

                {countdown !== null && countdown > 0 && (
                  <p className="text-xs text-rose-800 font-mono mt-1">
                    {error.isAutoRetrying ? 'Auto-retrying in ' : 'Retry available in '}
                    <span className="font-bold">{countdown}s</span>
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
                    className="px-3.5 py-1.5 text-xs font-sans font-medium bg-[#1B1B18] hover:bg-black text-white rounded-lg transition"
                  >
                    Retry now
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
                    className="px-3.5 py-1.5 text-xs font-sans font-medium bg-[#1B1B18] hover:bg-black text-white rounded-lg transition"
                  >
                    Retry now
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
                    className="px-3.5 py-1.5 text-xs font-sans font-medium bg-[#1B1B18] hover:bg-black text-white rounded-lg transition"
                  >
                    Try again
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
                    className="px-3.5 py-1.5 text-xs font-sans font-medium bg-[#1B1B18] hover:bg-black text-white rounded-lg transition"
                  >
                    Retry
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-[#6B6A63] hover:text-[#1B1B18] text-xs font-sans px-1.5 py-1"
                  aria-label="Dismiss error"
                >
                  Dismiss
                </button>
              </div>
            </div>

            <div className="border-t border-rose-200/80 pt-2 text-xs">
              <button
                type="button"
                onClick={() => setShowDebug((prev) => !prev)}
                className="text-rose-800/80 hover:text-rose-950 font-sans text-xs underline underline-offset-2"
              >
                {showDebug ? 'Hide debug info' : 'Show debug info'}
              </button>
              {showDebug && (
                <div className="mt-2 p-3 rounded-lg bg-white/80 border border-rose-200 font-mono text-[11px] text-rose-900 space-y-1">
                  <div>
                    <span className="text-[#6B6A63]">Error code:</span> {error.code}
                  </div>
                  {error.requestId && (
                    <div>
                      <span className="text-[#6B6A63]">Request ID:</span> {error.requestId}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 1: INPUT STAGE */}
        {step === 'input' && (
          <section aria-labelledby="input-heading" className="flex flex-col gap-6 w-full">
            {/* Centered Editorial Newsletter Headlines */}
            <div className="text-center max-w-2xl mx-auto pt-4 sm:pt-8 pb-2 flex flex-col items-center">
              <h1 id="input-heading" className="font-serif text-3xl sm:text-5xl font-normal text-[#1B1B18] tracking-tight leading-tight">
                Say it out loud. We will find what doesn&apos;t add up.
              </h1>
              <p className="mt-3 text-sm sm:text-base text-[#6B6A63] font-sans max-w-xl">
                Voice Requirements Linter turns messy spoken thoughts into sharp engineering specs.
              </p>
            </div>

            {/* Small Callout directly above the input */}
            <div className="rounded-[16px] border border-[#E4E2DA] bg-[#F7F6F3] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-warm-xs">
              <div>
                <span className="font-medium text-[#1B1B18] block mb-0.5">
                  Speak your spec with Wispr Flow
                </span>
                <span className="text-[#6B6A63] font-sans">
                  Click the box. Hold your Wispr Flow key and talk. Say it messy. Changes of mind are fine.
                </span>
              </div>
              <a
                href="https://flow.wispr.ai"
                target="_blank"
                rel="noopener nofollow"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1B1B18] underline hover:text-black shrink-0 font-sans"
              >
                Get Wispr Flow &rarr;
              </a>
            </div>

            {/* Large White Input Card */}
            <div className="rounded-[16px] border border-[#E4E2DA] bg-white p-5 sm:p-6 shadow-warm-md flex flex-col gap-3 focus-within:ring-2 focus-within:ring-[#2563EB]/30 transition-all">
              <div className="flex items-center justify-between text-xs text-[#6B6A63]">
                <span className="font-sans">Wispr Flow will type here</span>
                <div className="flex items-center gap-3">
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
                    className="text-xs text-[#6B6A63] hover:text-[#1B1B18] underline font-sans"
                    title="Import a previously saved session JSON file"
                  >
                    Import session
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    disabled={isLoading || sampleLoading}
                    className="text-xs text-[#6B6A63] hover:text-[#1B1B18] underline font-sans"
                  >
                    {sampleLoading ? 'Loading sample...' : 'Load sample transcript'}
                  </button>
                </div>
              </div>

              <label htmlFor="transcript" className="sr-only">
                Voice transcript input
              </label>
              <textarea
                id="transcript"
                value={transcript}
                onChange={(e) => handleTranscriptChange(e.target.value)}
                disabled={isLoading}
                rows={10}
                placeholder="Hold your Wispr Flow key and speak or paste your transcript"
                className="w-full bg-transparent border-0 p-0 text-sm font-sans text-[#1B1B18] placeholder-[#6B6A63]/60 focus:ring-0 focus:outline-none resize-y leading-relaxed"
              />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#E4E2DA]">
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span
                    className={
                      charCount === 0
                        ? 'text-[#6B6A63]'
                        : charCount < 80
                        ? 'text-amber-700'
                        : charCount > 12000
                        ? 'text-rose-700 font-bold'
                        : 'text-[#1B1B18] font-medium'
                    }
                  >
                    {charCount.toLocaleString()} / 12,000 characters
                  </span>
                  {charCount > 0 && charCount < 80 && (
                    <span className="text-[#6B6A63] font-sans text-[11px]">
                      (min 80 required)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  {lintResult && (
                    <button
                      type="button"
                      onClick={() => setStep('findings')}
                      disabled={isLoading}
                      className="px-4 py-2 text-xs font-sans font-medium text-[#1B1B18] hover:bg-[#F7F6F3] bg-white border border-[#E4E2DA] rounded-lg transition"
                    >
                      View findings &rarr;
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => executeLint(transcript)}
                    disabled={!isInputValid || isLoading}
                    className="px-6 py-2.5 text-xs font-sans font-medium bg-[#1B1B18] hover:bg-black text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition shadow-warm-xs"
                  >
                    {isLoading ? 'Linting...' : 'Lint transcript'}
                  </button>
                </div>
              </div>
            </div>

            {/* Instant Hints: Smaller and quieter below the card */}
            <div className="px-1">
              <InstantHints transcript={transcript} />
            </div>
          </section>
        )}

        {/* LOADING SKELETON STATE */}
        {isLoading && (
          <section aria-label="Loading analysis" className="flex flex-col gap-4 animate-pulse">
            <div className="p-4 rounded-[16px] border border-[#E4E2DA] bg-white text-xs font-sans text-[#1B1B18] shadow-warm-xs">
              <span className="font-medium text-[#1B1B18] animate-pulse">
                {activeLoadingStatuses[loadingStatusIndex]}...
              </span>
            </div>
            <div className="h-28 bg-white/70 rounded-[16px] border border-[#E4E2DA] w-full" />
            <div className="h-36 bg-white/70 rounded-[16px] border border-[#E4E2DA] w-full" />
            <div className="h-36 bg-white/70 rounded-[16px] border border-[#E4E2DA] w-full" />
          </section>
        )}

        {/* STEP 2: FINDINGS STAGE */}
        {!isLoading && step === 'findings' && lintResult && (
          <section aria-labelledby="findings-heading" className="flex flex-col gap-6">
            {/* Analysis Summary Header */}
            <div className="rounded-[16px] border border-[#E4E2DA] bg-white p-5 sm:p-6 flex flex-col gap-3 shadow-warm-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <h2 id="findings-heading" className="text-base sm:text-lg font-serif font-normal text-[#1B1B18] tracking-tight">
                    Analysis summary
                  </h2>
                  {lintResult.cached && (
                    <span className="px-2.5 py-0.5 text-xs font-sans rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 font-medium">
                      Sample cached
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="text-xs font-sans font-medium text-[#6B6A63] hover:text-[#1B1B18] transition"
                >
                  &larr; Edit transcript
                </button>
              </div>

              <p className="text-sm text-[#1B1B18]/90 leading-relaxed font-sans">
                {lintResult.summary}
              </p>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-[#E4E2DA] text-xs font-sans">
                <span className="px-3 py-1 rounded-full bg-[#F3F2EE] text-[#1B1B18] border border-[#E4E2DA]">
                  {lintResult.selfCorrections?.length || 0} self-corrections
                </span>
                <span className="px-3 py-1 rounded-full bg-[#F3F2EE] text-[#1B1B18] border border-[#E4E2DA]">
                  {lintResult.contradictions?.length || 0} contradictions
                </span>
                <span className="px-3 py-1 rounded-full bg-[#F3F2EE] text-[#1B1B18] border border-[#E4E2DA]">
                  {lintResult.missingDecisions?.length || 0} missing decisions
                </span>
                <span className="px-3 py-1 rounded-full bg-[#F3F2EE] text-[#1B1B18] border border-[#E4E2DA]">
                  {lintResult.questions?.length || 0} clarifying questions
                </span>
              </div>
            </div>

            {/* Secondary Panels Behind Clear Toggles (Collapsed by default) */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsReadinessOpen((prev) => !prev)}
                  className={`px-3.5 py-1.5 text-xs font-sans font-medium rounded-full border transition inline-flex items-center gap-1.5 shadow-warm-xs ${
                    isReadinessOpen
                      ? 'bg-[#1B1B18] text-white border-[#1B1B18]'
                      : 'bg-white text-[#1B1B18] border-[#E4E2DA] hover:bg-[#F7F6F3]'
                  }`}
                >
                  <span>Readiness meter</span>
                  <span className="text-[10px]">{isReadinessOpen ? '▲' : '▼'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsConflictMapOpen((prev) => !prev)}
                  className={`px-3.5 py-1.5 text-xs font-sans font-medium rounded-full border transition inline-flex items-center gap-1.5 shadow-warm-xs ${
                    isConflictMapOpen
                      ? 'bg-[#1B1B18] text-white border-[#1B1B18]'
                      : 'bg-white text-[#1B1B18] border-[#E4E2DA] hover:bg-[#F7F6F3]'
                  }`}
                >
                  <span>Conflict map</span>
                  <span className="text-[10px]">{isConflictMapOpen ? '▲' : '▼'}</span>
                </button>
              </div>

              {isReadinessOpen && (
                <div className="rounded-[16px] border border-[#E4E2DA] bg-white p-5 shadow-warm-sm">
                  <ReadinessMeter
                    contradictions={lintResult.contradictions}
                    missingDecisions={lintResult.missingDecisions}
                    questions={lintResult.questions}
                    answers={answers}
                  />
                </div>
              )}

              {isConflictMapOpen && (
                <div className="rounded-[16px] border border-[#E4E2DA] bg-white p-5 shadow-warm-sm">
                  <ConflictMap
                    contradictions={lintResult.contradictions}
                    questions={lintResult.questions}
                    onSelectContradiction={(id) => handleScrollToFinding(id)}
                  />
                </div>
              )}
            </div>

            {/* Main Column: Highlighted Transcript, Findings as notes beside it */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* MAIN COLUMN (7 cols): Highlighted Transcript */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-sans font-semibold text-[#1B1B18]">
                    Transcript with findings
                  </h3>
                  <span className="text-xs text-[#6B6A63] font-sans">
                    Click any highlighted phrase to jump to its note
                  </span>
                </div>

                <TranscriptHighlighter
                  transcript={transcript}
                  lintResult={lintResult}
                  activeFindingId={highlightedFindingId}
                  onSelectFinding={(id) => handleScrollToFinding(id)}
                />
              </div>

              {/* NOTES BESIDE IT (5 cols): Findings Cards */}
              <div className="lg:col-span-5 flex flex-col gap-6 lg:sticky lg:top-20">
                {/* Self-Corrections Resolved */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-mono uppercase tracking-wider font-medium text-[#6B6A63]">
                      Self-corrections resolved
                    </h3>
                    <span className="text-xs font-mono text-[#6B6A63]">
                      ({lintResult.selfCorrections?.length || 0})
                    </span>
                  </div>

                  {(!lintResult.selfCorrections || lintResult.selfCorrections.length === 0) ? (
                    <div className="p-3.5 rounded-[16px] border border-[#E4E2DA] bg-white text-xs text-[#6B6A63] font-sans shadow-warm-xs">
                      No self-corrections detected in transcript.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {lintResult.selfCorrections.map((sc) => (
                        <article
                          key={sc.id}
                          id={`finding-${sc.id}`}
                          className={`p-4 rounded-[16px] border transition-all ${
                            highlightedFindingId === sc.id
                              ? 'border-[#2563EB] bg-blue-50/40 ring-2 ring-[#2563EB]/40'
                              : 'border-[#E4E2DA] bg-white shadow-warm-xs hover:border-[#1B1B18]/30'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <span className="font-mono text-xs text-[#6B6A63] bg-[#F3F2EE] px-2 py-0.5 rounded">
                              {sc.id}
                            </span>
                            <span className="text-[11px] font-sans font-medium px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800">
                              Last statement wins
                            </span>
                          </div>

                          <div className="flex flex-col gap-1.5 mb-2 font-mono text-xs">
                            <span className="line-through text-[#6B6A63] bg-[#F7F6F3] px-2 py-1 rounded border border-[#E4E2DA] break-words">
                              &quot;{sc.earlierQuote}&quot;
                            </span>
                            <span className="text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-1 rounded break-words">
                              &quot;{sc.finalQuote}&quot;
                            </span>
                          </div>

                          <p className="text-xs text-[#1B1B18]/90 leading-relaxed font-sans">
                            <span className="text-[#6B6A63] font-medium">Resolution:</span> {sc.resolution}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                {/* Contradictions */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-mono uppercase tracking-wider font-medium text-[#6B6A63]">
                      Contradictions
                    </h3>
                    <span className="text-xs font-mono text-[#6B6A63]">
                      ({lintResult.contradictions?.length || 0})
                    </span>
                  </div>

                  {(!lintResult.contradictions || lintResult.contradictions.length === 0) ? (
                    <div className="p-3.5 rounded-[16px] border border-[#E4E2DA] bg-white text-xs text-[#6B6A63] font-sans shadow-warm-xs">
                      No contradictions identified.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {lintResult.contradictions.map((c) => (
                        <article
                          key={c.id}
                          id={`finding-${c.id}`}
                          className={`p-4 rounded-[16px] border transition-all ${
                            highlightedFindingId === c.id
                              ? 'border-[#2563EB] bg-blue-50/40 ring-2 ring-[#2563EB]/40'
                              : 'border-[#E4E2DA] bg-white shadow-warm-xs hover:border-[#1B1B18]/30'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2.5">
                            <span className="font-mono text-xs text-[#6B6A63] bg-[#F3F2EE] px-2 py-0.5 rounded">
                              {c.id}
                            </span>
                            <span
                              className={`text-[11px] font-sans font-medium px-2.5 py-0.5 rounded-full border ${
                                c.severity === 'high'
                                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                                  : 'border-amber-200 bg-amber-50 text-amber-800'
                              }`}
                            >
                              {c.severity} severity
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2 mb-2.5 font-mono text-xs">
                            <div className="p-2 rounded bg-amber-50/60 border border-amber-200/70 flex flex-col gap-0.5">
                              <span className="text-[10px] text-amber-800 uppercase font-sans font-medium">
                                Quote A
                              </span>
                              <span className="text-amber-950 break-words">
                                &quot;{c.quoteA}&quot;
                              </span>
                            </div>
                            <div className="p-2 rounded bg-rose-50/60 border border-rose-200/70 flex flex-col gap-0.5">
                              <span className="text-[10px] text-rose-800 uppercase font-sans font-medium">
                                Quote B
                              </span>
                              <span className="text-rose-950 break-words">
                                &quot;{c.quoteB}&quot;
                              </span>
                            </div>
                          </div>

                          <p className="text-xs text-[#1B1B18]/90 leading-relaxed font-sans">
                            <span className="text-[#6B6A63] font-medium">Why it clashes:</span> {c.why}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                {/* Missing Decisions */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-mono uppercase tracking-wider font-medium text-[#6B6A63]">
                      Missing decisions
                    </h3>
                    <span className="text-xs font-mono text-[#6B6A63]">
                      ({lintResult.missingDecisions?.length || 0})
                    </span>
                  </div>

                  {(!lintResult.missingDecisions || lintResult.missingDecisions.length === 0) ? (
                    <div className="p-3.5 rounded-[16px] border border-[#E4E2DA] bg-white text-xs text-[#6B6A63] font-sans shadow-warm-xs">
                      No missing decisions reported.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {lintResult.missingDecisions.map((md) => (
                        <article
                          key={md.id}
                          id={`finding-${md.id}`}
                          className={`p-4 rounded-[16px] border transition-all ${
                            highlightedFindingId === md.id
                              ? 'border-[#2563EB] bg-blue-50/40 ring-2 ring-[#2563EB]/40'
                              : 'border-[#E4E2DA] bg-white shadow-warm-xs hover:border-[#1B1B18]/30'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="font-mono text-xs text-[#6B6A63] bg-[#F3F2EE] px-2 py-0.5 rounded">
                              {md.id}
                            </span>
                            <span className="text-xs font-medium text-[#1B1B18] font-sans">
                              {md.topic}
                            </span>
                          </div>

                          <p className="text-xs text-[#1B1B18]/90 leading-relaxed font-sans">
                            <span className="text-[#6B6A63] font-medium">Why it matters:</span> {md.whyItMatters}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Clarifying Questions & Spec Generation */}
            <div className="flex flex-col gap-4 border-t border-[#E4E2DA] pt-8 mt-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base sm:text-lg font-serif font-normal text-[#1B1B18] tracking-tight">
                      Clarifying questions
                    </h3>
                    <p className="text-xs text-[#6B6A63] font-sans">
                      Resolve ambiguity by picking an option or typing your answer before generating the spec.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#6B6A63]">
                    {totalQuestions} questions
                  </span>
                </div>

                {/* Questions Progress Bar */}
                {totalQuestions > 0 && (
                  <div className="flex flex-col gap-1.5 p-3.5 rounded-[16px] border border-[#E4E2DA] bg-white shadow-warm-xs">
                    <div className="flex items-center justify-between text-xs font-sans">
                      <span className="text-[#6B6A63]">
                        Progress: <strong className="text-[#1B1B18] font-semibold">{answeredQuestionsCount}</strong> of{' '}
                        {totalQuestions} answered
                      </span>
                      <span className={allQuestionsSatisfied ? 'text-emerald-700 font-medium' : 'text-[#6B6A63]'}>
                        {Math.round(questionsProgressPercent)}%
                      </span>
                    </div>
                    <div className="w-full bg-[#F3F2EE] rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#1B1B18] h-full rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${questionsProgressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {(!lintResult.questions || lintResult.questions.length === 0) ? (
                <div className="p-4 rounded-[16px] border border-[#E4E2DA] bg-white text-xs text-[#6B6A63] font-sans shadow-warm-xs">
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
                        className={`p-5 rounded-[16px] border flex flex-col gap-3 transition-colors ${
                          isSatisfied
                            ? 'border-[#E4E2DA] bg-white shadow-warm-xs'
                            : 'border-[#E4E2DA] bg-white shadow-warm-sm'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div className="flex flex-col gap-1">
                            <span className="font-mono text-xs text-[#6B6A63]">{q.id}</span>
                            <p className="text-sm font-medium text-[#1B1B18] font-sans">
                              {q.question}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                            <span className="text-[11px] font-sans text-[#6B6A63]">Relates to:</span>
                            {q.relatesTo && q.relatesTo.map((findingId) => (
                              <button
                                key={findingId}
                                type="button"
                                onClick={() => handleScrollToFinding(findingId)}
                                className="px-2 py-0.5 text-[11px] font-mono bg-[#F7F6F3] hover:bg-[#F3F2EE] text-[#1B1B18] border border-[#E4E2DA] rounded transition"
                                title={`Click to jump to finding ${findingId}`}
                              >
                                #{findingId}
                              </button>
                            ))}
                          </div>
                        </div>

                        {q.options && q.options.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-xs font-sans text-[#6B6A63]">Quick-pick:</span>
                            {q.options.map((opt, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleQuickPick(q.id, opt)}
                                disabled={ans.youDecide}
                                className={`px-3 py-1 text-xs rounded-full border transition font-sans ${
                                  ans.text === opt && !ans.youDecide
                                    ? 'bg-[#1B1B18] text-white border-[#1B1B18] font-medium shadow-xs'
                                    : 'bg-[#F7F6F3] hover:bg-[#F3F2EE] text-[#1B1B18] border-[#E4E2DA] disabled:opacity-40'
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
                            className="flex-1 rounded-lg bg-[#F7F6F3] border border-[#E4E2DA] px-3.5 py-2 text-xs font-sans text-[#1B1B18] placeholder-[#6B6A63]/70 focus:border-[#1B1B18] focus:outline-none disabled:opacity-40 transition"
                          />

                          <button
                            type="button"
                            onClick={() => handleToggleYouDecide(q.id)}
                            className={`px-3.5 py-2 text-xs font-sans font-medium rounded-lg border transition ${
                              ans.youDecide
                                ? 'bg-[#1B1B18] text-white border-[#1B1B18]'
                                : 'bg-white hover:bg-[#F7F6F3] text-[#6B6A63] border-[#E4E2DA]'
                            }`}
                          >
                            {ans.youDecide ? '✓ You decide' : 'You decide'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Generate Clean Spec Action */}
              <div className="border-t border-[#E4E2DA] pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="text-xs font-sans text-[#6B6A63]">
                  {totalQuestions > 0 && !allQuestionsSatisfied ? (
                    <span className="text-amber-800">
                      Answer all questions or select &quot;You decide&quot; to unlock spec generation.
                    </span>
                  ) : (
                    <span className="text-emerald-800 font-medium">
                      Ready to generate clean engineering specification.
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => executeGenerateSpec()}
                  disabled={!allQuestionsSatisfied || isLoading}
                  className="px-6 py-2.5 text-xs font-sans font-medium bg-[#1B1B18] hover:bg-black text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition shadow-warm-xs"
                >
                  Generate clean spec &rarr;
                </button>
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
