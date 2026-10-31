'use client';

import React, { useEffect } from 'react';
import { StoredSession } from '@/lib/session-storage';

export interface RecentSessionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: StoredSession[];
  onSelectSession: (session: StoredSession) => void;
  onDeleteSession: (id: string) => void;
  onClearAll: () => void;
}

export function RecentSessionsDrawer({
  isOpen,
  onClose,
  sessions,
  onSelectSession,
  onDeleteSession,
  onClearAll,
}: RecentSessionsDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recent-sessions-title"
      className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs font-sans"
    >
      {/* Backdrop click area */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-md h-full bg-[#FFFFFF] border-l border-[#E4E2DA] p-6 flex flex-col gap-5 shadow-2xl z-10 overflow-y-auto text-[#1B1B18]">
        <div className="flex items-center justify-between border-b border-[#E4E2DA] pb-4">
          <div>
            <h2 id="recent-sessions-title" className="text-base font-serif text-[#1B1B18]">
              Recent sessions
            </h2>
            <p className="text-xs text-[#6B6A63] font-sans mt-0.5">
              Sessions stay in this browser.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-[#6B6A63] hover:text-[#1B1B18] hover:bg-[#F3F2EE] transition focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none"
            aria-label="Close recent sessions drawer"
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

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#6B6A63] font-sans rounded-2xl bg-[#F7F6F3] border border-[#E4E2DA]">
              No recent sessions found. Completed specs will be saved here automatically.
            </div>
          ) : (
            sessions.map((s) => {
              const dateStr = new Date(s.timestamp).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={s.id}
                  className="p-4 rounded-[16px] border border-[#E4E2DA] bg-[#F7F6F3] hover:bg-white hover:border-[#1B1B18] transition-all flex flex-col gap-2.5 text-xs shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-mono text-[#6B6A63]">
                      {dateStr}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteSession(s.id)}
                      className="text-[#6B6A63] hover:text-rose-600 p-1 rounded transition"
                      title="Delete session"
                      aria-label="Delete session"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.75}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>

                  <p className="line-clamp-2 text-[#1B1B18] leading-relaxed font-sans">
                    {s.transcript}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-[#E4E2DA]/80">
                    <span className="text-[11px] text-[#6B6A63]">
                      {s.specResult?.specMarkdown ? 'Spec ready' : 'Draft'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectSession(s)}
                      className="text-xs font-medium text-[#1B1B18] hover:underline transition"
                    >
                      Reopen &rarr;
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer actions */}
        {sessions.length > 0 && (
          <div className="pt-3 border-t border-[#E4E2DA]">
            <button
              type="button"
              onClick={onClearAll}
              className="w-full py-2 px-3 rounded-xl border border-[#E4E2DA] hover:bg-rose-50 hover:text-rose-700 text-xs text-[#6B6A63] font-medium transition"
            >
              Clear all sessions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
