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
    let inChecklist = false;
    const checklistItems: string[] = [];

    for (const line of lines) {
      if (line.match(/^#+\s*Acceptance\s+checklist/i)) {
        inChecklist = true;
        continue;
      }
      if (inChecklist && line.startsWith('#')) {
        break; // Reached next section
      }
      if (inChecklist && line.trim().startsWith('- [')) {
        const cleaned = line.replace(/^-\s*\[[ xX]\]\s*/, '').trim();
        if (cleaned) checklistItems.push(cleaned);
      }
    }

    if (checklistItems.length === 0) {
      checklistItems.push('Implement core features as specified in specification');
    }

    const formattedIssues = checklistItems
      .map((item, index) => {
        return `Title: Issue ${index + 1} - ${item}\nBody: Verified acceptance criteria item:\n\n- [ ] ${item}\n\nTraceable to specification acceptance checklist.\n`;
      })
      .join('\n---\n\n');

    try {
      await navigator.clipboard.writeText(formattedIssues);
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
    e.target.value = '';
  };

  return (
    <section
      aria-labelledby="buildpack-heading"
      className="rounded-[16px] border border-[#E4E2DA] bg-white p-6 flex flex-col gap-5 shadow-xs font-sans text-[#1B1B18]"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E4E2DA] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 id="buildpack-heading" className="text-sm font-semibold text-[#1B1B18]">
              AI build pack
            </h3>
            <span className="text-[11px] font-sans rounded-full bg-[#F3F2EE] border border-[#E4E2DA] text-[#6B6A63] px-2.5 py-0.5 font-medium">
              Coding agent ready
            </span>
          </div>
          <p className="text-xs text-[#6B6A63] mt-0.5 font-sans">
            Ready-to-paste prompts and configuration files formatted for modern coding agents.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E4E2DA] pb-3">
        {(['antigravity', 'cursor', 'claude'] as BuildPackTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3.5 py-1.5 text-xs rounded-full font-medium transition-colors ${
              activeTab === tab
                ? 'bg-[#1B1B18] text-white'
                : 'text-[#6B6A63] hover:text-[#1B1B18] hover:bg-[#F3F2EE]'
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

      {/* Prompt Preview */}
      <div className="relative rounded-[16px] border border-[#E4E2DA] bg-[#F8F8F7] p-4 text-xs font-mono max-h-56 overflow-y-auto">
        <pre className="text-[#1B1B18] whitespace-pre-wrap font-mono leading-relaxed select-all">
          {tabPrompt}
        </pre>
      </div>

      {/* Action Buttons Toolbar */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleCopyPrompt}
          className="px-4 py-2 text-xs font-sans bg-[#1B1B18] hover:bg-black text-white rounded-xl transition flex items-center gap-1.5 shadow-sm font-medium focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none"
        >
          {copiedPrompt ? 'Copied to clipboard' : 'Copy agent prompt'}
        </button>

        <button
          type="button"
          onClick={handleDownloadAgents}
          className="px-3.5 py-2 text-xs font-sans bg-white hover:bg-[#F7F6F3] text-[#1B1B18] border border-[#E4E2DA] rounded-xl transition flex items-center gap-1.5 shadow-xs font-medium focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none"
          title="Download AGENTS.md for Antigravity"
        >
          Download AGENTS.md
        </button>

        <button
          type="button"
          onClick={handleDownloadClaude}
          className="px-3.5 py-2 text-xs font-sans bg-white hover:bg-[#F7F6F3] text-[#1B1B18] border border-[#E4E2DA] rounded-xl transition flex items-center gap-1.5 shadow-xs font-medium focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none"
          title="Download CLAUDE.md for Claude Code"
        >
          Download CLAUDE.md
        </button>

        <button
          type="button"
          onClick={handleCopyGitHubIssues}
          className="px-3.5 py-2 text-xs font-sans bg-white hover:bg-[#F7F6F3] text-[#1B1B18] border border-[#E4E2DA] rounded-xl transition flex items-center gap-1.5 shadow-xs font-medium focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none"
          title="Copy acceptance checklist items as formatted GitHub issue blocks"
        >
          {copiedIssues ? 'Copied issues' : 'Copy as GitHub issues'}
        </button>

        <button
          type="button"
          onClick={handleDownloadSession}
          className="px-3.5 py-2 text-xs font-sans bg-white hover:bg-[#F7F6F3] text-[#1B1B18] border border-[#E4E2DA] rounded-xl transition flex items-center gap-1.5 shadow-xs font-medium focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none"
          title="Download complete session state as JSON backup"
        >
          Download session JSON
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3.5 py-2 text-xs font-sans bg-white hover:bg-[#F7F6F3] text-[#6B6A63] hover:text-[#1B1B18] border border-[#E4E2DA] rounded-xl transition flex items-center gap-1.5 shadow-xs font-medium focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none ml-auto"
          title="Import session state from a downloaded JSON file"
        >
          Import session JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportFile}
          className="hidden"
        />
      </div>

      {importError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-sans">
          {importError}
        </div>
      )}
    </section>
  );
}
