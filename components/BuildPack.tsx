'use client';

import React, { useState, useMemo, useRef } from 'react';
import { LintResponseSuccess, SpecResponseSuccess } from '@/lib/types';

export interface BuildPackProps {
  specMarkdown: string;
  transcript: string;
  lintResult: LintResponseSuccess | null;
  answers: Record<string, { text: string; youDecide: boolean }>;
  specResult: SpecResponseSuccess | null;
  onImportSession?: (session: {
    transcript: string;
    lintResult: LintResponseSuccess;
    answers: Record<string, { text: string; youDecide: boolean }>;
    specResult: SpecResponseSuccess;
  }) => void;
}

type BuildPackTab = 'antigravity' | 'cursor' | 'claude';

const HEADER_TEXT =
  'Build this application exactly as specified below. Do not add features that are not in the spec. ' +
  'For every item under Open items, use its recommended default. Do not ask questions. ' +
  'Treat the Acceptance checklist as the definition of done.\n\n';

export function BuildPack({
  specMarkdown,
  transcript,
  lintResult,
  answers,
  specResult,
  onImportSession,
}: BuildPackProps) {
  const [activeTab, setActiveTab] = useState<BuildPackTab>('antigravity');
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [copiedIssues, setCopiedIssues] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const issuesTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Formatted prompt per tab
  const tabPrompt = useMemo(() => {
    let tabPrefix = '';
    if (activeTab === 'antigravity') {
      tabPrefix = '# Antigravity Workspace Instruction\n\n';
    } else if (activeTab === 'cursor') {
      tabPrefix = '# Cursor Rules / System Instruction\n\n';
    } else if (activeTab === 'claude') {
      tabPrefix = '# Claude Code Instruction\n\n';
    }

    return `${tabPrefix}${HEADER_TEXT}${specMarkdown}`;
  }, [activeTab, specMarkdown]);

  // Copy prompt
  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(tabPrompt);
      setCopiedPrompt(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Download AGENTS.md
  const handleDownloadAgents = () => {
    const content = `# AGENTS.md\n\n${HEADER_TEXT}${specMarkdown}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AGENTS.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download CLAUDE.md
  const handleDownloadClaude = () => {
    const content = `# CLAUDE.md\n\n${HEADER_TEXT}${specMarkdown}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CLAUDE.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Parse acceptance checklist items into GitHub issues text
  const handleCopyGitHubIssues = async () => {
    const lines = specMarkdown.split('\n');
    const items: string[] = [];
    let inChecklist = false;

    for (const line of lines) {
      if (line.toLowerCase().includes('acceptance checklist')) {
        inChecklist = true;
        continue;
      }
      if (inChecklist && line.startsWith('#')) {
        break;
      }
      if (inChecklist) {
        const match = line.match(/^[-*]\s+\[[ xX]\]\s+(.+)$/);
        if (match && match[1]) {
          items.push(match[1].trim());
        }
      }
    }

    // Fallback if section header was phrased slightly differently
    if (items.length === 0) {
      for (const line of lines) {
        const match = line.match(/^[-*]\s+\[[ xX]\]\s+(.+)$/);
        if (match && match[1]) {
          items.push(match[1].trim());
        }
      }
    }

    if (items.length === 0) {
      items.push('Implement features defined in the specification document.');
    }

    const issuesMarkdown = items
      .map((item, idx) => {
        const title = item.length > 70 ? item.slice(0, 67).trim() + '...' : item;
        return `### Issue ${idx + 1}: ${title}\n\n**Description:**\n${item}\n\n**Acceptance Criteria:**\n- [ ] ${item}\n\n---\n`;
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(issuesMarkdown);
      setCopiedIssues(true);
      if (issuesTimerRef.current) clearTimeout(issuesTimerRef.current);
      issuesTimerRef.current = setTimeout(() => setCopiedIssues(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Download Session JSON
  const handleDownloadSession = () => {
    if (!lintResult || !specResult) return;
    const sessionData = {
      version: 1,
      timestamp: Date.now(),
      transcript,
      lintResult,
      answers,
      specResult,
    };
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `speech-to-spec-session-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import Session JSON
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.transcript === 'string' &&
          parsed.lintResult &&
          typeof parsed.lintResult === 'object' &&
          parsed.specResult &&
          typeof parsed.specResult === 'object' &&
          typeof parsed.specResult.specMarkdown === 'string'
        ) {
          if (onImportSession) {
            onImportSession({
              transcript: parsed.transcript,
              lintResult: parsed.lintResult,
              answers: parsed.answers || {},
              specResult: parsed.specResult,
            });
          }
        } else {
          setImportError('Invalid session JSON: missing required transcript, lintResult, or specResult.');
        }
      } catch {
        setImportError('Failed to parse file: invalid JSON format.');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  return (
    <section
      aria-labelledby="buildpack-heading"
      className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5 flex flex-col gap-4 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <h3 id="buildpack-heading" className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-200">
            AI Build Pack
          </h3>
          <span className="text-[11px] font-mono rounded bg-cyan-950/70 border border-cyan-800/70 text-cyan-300 px-2 py-0.5 font-semibold">
            Agent Ready
          </span>
        </div>
        <p className="text-xs text-zinc-400 font-sans">
          Ready-to-paste prompts formatted for modern coding agents.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
        {(['antigravity', 'cursor', 'claude'] as BuildPackTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
              activeTab === tab
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/50 font-bold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            {tab === 'antigravity'
              ? 'Antigravity'
              : tab === 'cursor'
              ? 'Cursor'
              : 'Claude Code'}
          </button>
        ))}
      </div>

      {/* Prompt preview box */}
      <div className="relative">
        <textarea
          readOnly
          value={tabPrompt}
          rows={7}
          className="w-full rounded bg-zinc-950 border border-zinc-800 p-3 text-xs font-mono text-zinc-300 select-all focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
        <button
          type="button"
          onClick={handleCopyPrompt}
          className="px-3 py-1.5 rounded font-bold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 transition flex items-center gap-1.5 shadow-xs"
        >
          {copiedPrompt ? '✓ Copied Prompt' : 'Copy Prompt'}
        </button>

        <button
          type="button"
          onClick={handleDownloadAgents}
          className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
        >
          Download AGENTS.md
        </button>

        <button
          type="button"
          onClick={handleDownloadClaude}
          className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
        >
          Download CLAUDE.md
        </button>

        <button
          type="button"
          onClick={handleCopyGitHubIssues}
          className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
        >
          {copiedIssues ? '✓ Copied Issues!' : 'Copy as GitHub Issues'}
        </button>

        <button
          type="button"
          onClick={handleDownloadSession}
          className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
        >
          Download session JSON
        </button>

        <label className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/80 cursor-pointer transition">
          Import session JSON
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
        </label>
      </div>

      {importError && (
        <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/80 text-rose-300 font-mono text-xs">
          {importError}
        </div>
      )}
    </section>
  );
}

