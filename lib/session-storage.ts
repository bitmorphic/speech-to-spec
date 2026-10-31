import LZString from 'lz-string';
import { LintResponseSuccess, SpecResponseSuccess } from './types';

export interface StoredSession {
  id: string;
  timestamp: number;
  title: string;
  transcript: string;
  lintResult: LintResponseSuccess;
  answers: Record<string, { text: string; youDecide: boolean }>;
  specResult: SpecResponseSuccess;
}

const STORAGE_KEY = 'speech_to_spec_sessions';
const MAX_SESSIONS = 10;
export const MAX_HASH_LENGTH = 30000;

export function loadStoredSessions(): StoredSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, MAX_SESSIONS);
    }
  } catch {
    // Graceful fallback if storage unavailable or corrupted
  }
  return [];
}

export function saveStoredSession(session: {
  transcript: string;
  lintResult: LintResponseSuccess;
  answers: Record<string, { text: string; youDecide: boolean }>;
  specResult: SpecResponseSuccess;
  title?: string;
}): StoredSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const existing = loadStoredSessions();
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const title =
      session.title ||
      session.transcript.slice(0, 45).replace(/[\r\n]+/g, ' ').trim() + '...';

    const newSession: StoredSession = {
      id,
      timestamp: Date.now(),
      title,
      transcript: session.transcript,
      lintResult: session.lintResult,
      answers: session.answers,
      specResult: session.specResult,
    };

    // Keep latest ten
    const updated = [newSession, ...existing.filter((s) => s.transcript !== session.transcript)].slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function deleteStoredSession(id: string): StoredSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const existing = loadStoredSessions();
    const filtered = existing.filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch {
    return [];
  }
}

export function clearAllStoredSessions(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore error
  }
}

/**
 * Compresses session data with LZString into an encoded URI component.
 * Ensures NO api keys are included.
 */
export function compressSessionForUrl(session: {
  transcript: string;
  lintResult: LintResponseSuccess;
  answers: Record<string, { text: string; youDecide: boolean }>;
  specResult: SpecResponseSuccess;
}): { encoded: string; length: number; tooLarge: boolean } {
  // Strip any accidental sensitive fields
  const safeData = {
    v: 1,
    t: Date.now(),
    transcript: session.transcript,
    lintResult: session.lintResult,
    answers: session.answers,
    specResult: session.specResult,
  };

  const jsonStr = JSON.stringify(safeData);
  const encoded = LZString.compressToEncodedURIComponent(jsonStr);
  const length = encoded.length;

  return {
    encoded,
    length,
    tooLarge: length > MAX_HASH_LENGTH,
  };
}

/**
 * Decompresses session data from an encoded hash string.
 */
export function decompressSessionFromUrl(encoded: string): {
  transcript: string;
  lintResult: LintResponseSuccess;
  answers: Record<string, { text: string; youDecide: boolean }>;
  specResult: SpecResponseSuccess;
} | null {
  try {
    const jsonStr = LZString.decompressFromEncodedURIComponent(encoded);
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.transcript === 'string' &&
      parsed.lintResult &&
      parsed.specResult
    ) {
      return {
        transcript: parsed.transcript,
        lintResult: parsed.lintResult,
        answers: parsed.answers || {},
        specResult: parsed.specResult,
      };
    }
  } catch {
    return null;
  }
  return null;
}

