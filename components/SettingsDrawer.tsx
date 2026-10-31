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
      className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#FFFFFF] border-l border-[#E4E2DA] h-full flex flex-col p-6 sm:p-8 shadow-2xl overflow-y-auto font-sans text-[#1B1B18]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-[#E4E2DA] mb-6">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-serif font-normal text-[#1B1B18] tracking-tight">
              Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-[#6B6A63] hover:text-[#1B1B18] hover:bg-[#F3F2EE] transition focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none"
            aria-label="Close settings drawer"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
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
              className="text-xs font-sans font-medium text-[#1B1B18]"
            >
              Your Groq API key <span className="text-[#6B6A63] font-normal">(optional)</span>
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
                className="w-full bg-[#F7F6F3] border border-[#E4E2DA] rounded-[16px] px-3.5 py-2.5 pr-20 text-xs font-mono text-[#1B1B18] placeholder:text-[#6B6A63] focus:outline-none focus:border-[#1B1B18] focus:ring-1 focus:ring-[#1B1B18] transition"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {userApiKey && (
                  <button
                    type="button"
                    onClick={() => onUserApiKeyChange('')}
                    className="px-2 py-0.5 text-[10px] font-medium text-[#6B6A63] hover:text-[#1B1B18] bg-white border border-[#E4E2DA] rounded-full transition"
                    title="Clear key from memory"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="px-2 py-0.5 text-[10px] font-medium text-[#6B6A63] hover:text-[#1B1B18] bg-white border border-[#E4E2DA] rounded-full transition"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <p className="text-[12px] text-[#6B6A63] leading-relaxed font-sans">
              Kept in memory for the current tab only. Never stored in local storage, cookies, or the URL.
              Sent per request in a header and used instead of the server key for that request only.
              Never logged and never returned in any response.
            </p>
          </div>

          {/* Section 2: Model ID Read-only */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-sans font-medium text-[#1B1B18]">
              Active model
            </label>
            <div className="flex items-center gap-2 bg-[#F7F6F3] border border-[#E4E2DA] rounded-[16px] px-3.5 py-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span className="font-mono text-xs text-[#1B1B18] font-medium select-all">
                {MODEL_ID_READONLY}
              </span>
              <span className="ml-auto text-[11px] text-[#6B6A63] font-sans">
                Read-only
              </span>
            </div>
            <p className="text-[12px] text-[#6B6A63] leading-normal font-sans">
              All structured analysis and spec generation runs against this model via Groq.
            </p>
          </div>

          {/* Section 3: Reasoning Effort Selectors */}
          <div className="flex flex-col gap-3 pt-3 border-t border-[#E4E2DA]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-sans font-medium text-[#1B1B18]">
                Reasoning effort
              </label>
              <button
                type="button"
                onClick={() => onReasoningSettingsChange(DEFAULT_REASONING_SETTINGS)}
                className="text-[11px] font-sans text-[#6B6A63] hover:text-[#1B1B18] underline transition"
              >
                Reset to defaults
              </button>
            </div>

            {hasHighEffort && (
              <div className="p-3 rounded-[16px] border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-start gap-2.5">
                <svg
                  className="w-4 h-4 shrink-0 mt-0.5 text-amber-700"
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
                <span className="leading-relaxed">
                  <strong>Notice:</strong> High reasoning effort uses significantly more tokens on the free plan and may hit TPM limits faster.
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {/* Lint */}
              <div className="flex items-center justify-between p-3 rounded-[16px] bg-[#F7F6F3] border border-[#E4E2DA]">
                <div>
                  <span className="text-xs font-sans text-[#1B1B18] block font-medium">Lint analysis</span>
                  <span className="text-[11px] text-[#6B6A63] font-sans">Default: High</span>
                </div>
                <select
                  value={reasoningSettings.lint}
                  onChange={(e) =>
                    onReasoningSettingsChange({
                      ...reasoningSettings,
                      lint: e.target.value as ReasoningEffort,
                    })
                  }
                  className="bg-white border border-[#E4E2DA] text-[#1B1B18] text-xs font-sans rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#1B1B18]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Spec */}
              <div className="flex items-center justify-between p-3 rounded-[16px] bg-[#F7F6F3] border border-[#E4E2DA]">
                <div>
                  <span className="text-xs font-sans text-[#1B1B18] block font-medium">Spec generation</span>
                  <span className="text-[11px] text-[#6B6A63] font-sans">Default: High</span>
                </div>
                <select
                  value={reasoningSettings.spec}
                  onChange={(e) =>
                    onReasoningSettingsChange({
                      ...reasoningSettings,
                      spec: e.target.value as ReasoningEffort,
                    })
                  }
                  className="bg-white border border-[#E4E2DA] text-[#1B1B18] text-xs font-sans rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#1B1B18]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Tests */}
              <div className="flex items-center justify-between p-3 rounded-[16px] bg-[#F7F6F3] border border-[#E4E2DA]">
                <div>
                  <span className="text-xs font-sans text-[#1B1B18] block font-medium">Test cases</span>
                  <span className="text-[11px] text-[#6B6A63] font-sans">Default: Low</span>
                </div>
                <select
                  value={reasoningSettings.tests}
                  onChange={(e) =>
                    onReasoningSettingsChange({
                      ...reasoningSettings,
                      tests: e.target.value as ReasoningEffort,
                    })
                  }
                  className="bg-white border border-[#E4E2DA] text-[#1B1B18] text-xs font-sans rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#1B1B18]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Diagrams */}
              <div className="flex items-center justify-between p-3 rounded-[16px] bg-[#F7F6F3] border border-[#E4E2DA]">
                <div>
                  <span className="text-xs font-sans text-[#1B1B18] block font-medium">Architecture diagrams</span>
                  <span className="text-[11px] text-[#6B6A63] font-sans">Default: Low</span>
                </div>
                <select
                  value={reasoningSettings.diagrams}
                  onChange={(e) =>
                    onReasoningSettingsChange({
                      ...reasoningSettings,
                      diagrams: e.target.value as ReasoningEffort,
                    })
                  }
                  className="bg-white border border-[#E4E2DA] text-[#1B1B18] text-xs font-sans rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#1B1B18]"
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
        <div className="mt-auto pt-6 border-t border-[#E4E2DA]">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-[#1B1B18] hover:bg-black text-white font-medium text-xs font-sans tracking-wide transition shadow-sm focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
