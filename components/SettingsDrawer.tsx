'use client';

import React, { useState, useEffect } from 'react';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface ReasoningSettings {
  lint: ReasoningEffort;
  spec: ReasoningEffort;
  tests: ReasoningEffort;
  diagrams: ReasoningEffort;
}

export const DEFAULT_REASONING_SETTINGS: ReasoningSettings = {
  lint: 'high',
  spec: 'high',
  tests: 'low',
  diagrams: 'low',
};

export const MODEL_ID_READONLY = 'openai/gpt-oss-120b';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userApiKey: string;
  onUserApiKeyChange: (key: string) => void;
  reasoningSettings: ReasoningSettings;
  onReasoningSettingsChange: (settings: ReasoningSettings) => void;
}

export function SettingsDrawer({
  isOpen,
  onClose,
  userApiKey,
  onUserApiKeyChange,
  reasoningSettings,
  onReasoningSettingsChange,
}: SettingsDrawerProps) {
  const [showKey, setShowKey] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasHighEffort =
    reasoningSettings.lint === 'high' ||
    reasoningSettings.spec === 'high' ||
    reasoningSettings.tests === 'high' ||
    reasoningSettings.diagrams === 'high';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings Drawer"
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 h-full flex flex-col p-6 shadow-2xl overflow-y-auto font-sans text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-6">
          <div className="flex items-center gap-2.5">
            <svg
              className="w-5 h-5 text-cyan-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <h2 className="text-base font-semibold text-zinc-100 tracking-tight font-sans">
              Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            aria-label="Close settings drawer"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-6">
          {/* Section 1: Groq API Key */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="groq-api-key"
              className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300"
            >
              Your Groq API Key <span className="text-zinc-500 font-normal lowercase">(optional)</span>
            </label>
            <div className="relative">
              <input
                id="groq-api-key"
                type={showKey ? 'text' : 'password'}
                value={userApiKey}
                onChange={(e) => onUserApiKeyChange(e.target.value)}
                placeholder="gsk_..."
                autoComplete="off"
                spellCheck="false"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 pr-20 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {userApiKey && (
                  <button
                    type="button"
                    onClick={() => onUserApiKeyChange('')}
                    className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded transition"
                    title="Clear key from memory"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded transition"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
              Kept in memory for the current tab only. Never stored in local storage, cookies, or the URL.
              Sent per request in a header and used instead of the server key for that request only.
              Never logged and never returned in any response.
            </p>
          </div>

          {/* Section 2: Model ID Read-only */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300">
              Active Model ID
            </label>
            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-xs text-cyan-300 font-medium select-all">
                {MODEL_ID_READONLY}
              </span>
              <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Read-only
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-normal font-sans">
              All structured analysis and spec generation runs against this model via Groq.
            </p>
          </div>

          {/* Section 3: Reasoning Effort Selectors */}
          <div className="flex flex-col gap-3 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300">
                Reasoning Effort
              </label>
              <button
                type="button"
                onClick={() => onReasoningSettingsChange(DEFAULT_REASONING_SETTINGS)}
                className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition"
              >
                Reset to defaults
              </button>
            </div>

            {hasHighEffort && (
              <div className="p-2.5 rounded-lg border border-amber-900/60 bg-amber-950/30 text-amber-300 text-xs flex items-start gap-2">
                <svg
                  className="w-4 h-4 shrink-0 mt-0.5 text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span className="leading-snug">
                  <strong>Warning:</strong> High reasoning effort uses significantly more tokens on the free plan and may hit TPM limits faster.
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {/* Lint */}
              <div className="flex items-center justify-between p-2 rounded-md bg-zinc-950/60 border border-zinc-800">
                <div>
                  <span className="text-xs font-mono text-zinc-200 block">Lint Analysis</span>
                  <span className="text-[10px] text-zinc-500 font-sans">Default: High</span>
                </div>
                <select
                  value={reasoningSettings.lint}
                  onChange={(e) =>
                    onReasoningSettingsChange({
                      ...reasoningSettings,
                      lint: e.target.value as ReasoningEffort,
                    })
                  }
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-mono rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Spec */}
              <div className="flex items-center justify-between p-2 rounded-md bg-zinc-950/60 border border-zinc-800">
                <div>
                  <span className="text-xs font-mono text-zinc-200 block">Spec Generation</span>
                  <span className="text-[10px] text-zinc-500 font-sans">Default: High</span>
                </div>
                <select
                  value={reasoningSettings.spec}
                  onChange={(e) =>
                    onReasoningSettingsChange({
                      ...reasoningSettings,
                      spec: e.target.value as ReasoningEffort,
                    })
                  }
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-mono rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Tests */}
              <div className="flex items-center justify-between p-2 rounded-md bg-zinc-950/60 border border-zinc-800">
                <div>
                  <span className="text-xs font-mono text-zinc-200 block">Test Cases</span>
                  <span className="text-[10px] text-zinc-500 font-sans">Default: Low</span>
                </div>
                <select
                  value={reasoningSettings.tests}
                  onChange={(e) =>
                    onReasoningSettingsChange({
                      ...reasoningSettings,
                      tests: e.target.value as ReasoningEffort,
                    })
                  }
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-mono rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Diagrams */}
              <div className="flex items-center justify-between p-2 rounded-md bg-zinc-950/60 border border-zinc-800">
                <div>
                  <span className="text-xs font-mono text-zinc-200 block">Architecture Diagrams</span>
                  <span className="text-[10px] text-zinc-500 font-sans">Default: Low</span>
                </div>
                <select
                  value={reasoningSettings.diagrams}
                  onChange={(e) =>
                    onReasoningSettingsChange({
                      ...reasoningSettings,
                      diagrams: e.target.value as ReasoningEffort,
                    })
                  }
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-mono rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-6 border-t border-zinc-800 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-semibold text-xs font-mono tracking-wide transition focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

