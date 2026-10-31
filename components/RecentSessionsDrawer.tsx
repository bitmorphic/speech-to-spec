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
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs"
    >
      {/* Backdrop click area */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 p-5 flex flex-col gap-4 shadow-2xl z-10 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h2 id="recent-sessions-title" className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-100">
              Recent Sessions
            </h2>
            <p className="text-[11px] text-zinc-400 font-sans">
              Sessions stay in this browser.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition font-mono text-sm focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            ✕
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500 font-mono text-xs">
            No saved sessions yet. Completed specifications will appear here automatically.
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400">
                {sessions.length} / 10 stored
              </span>
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs font-mono text-rose-400 hover:text-rose-300 transition underline"
              >
                Clear all
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {sessions.map((s) => {
                const dateStr = new Date(s.timestamp).toLocaleString();
                return (
                  <div
                    key={s.id}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 flex flex-col gap-2 transition hover:border-zinc-700"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xs font-semibold text-zinc-200 font-sans line-clamp-2">
                        {s.title}
                      </h3>
                      <button
                        type="button"
                        onClick={() => onDeleteSession(s.id)}
                        title="Delete session"
                        aria-label={`Delete session ${s.title}`}
                        className="text-zinc-500 hover:text-rose-400 text-xs font-mono transition p-0.5"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
                      <span>{dateStr}</span>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSession(s);
                          onClose();
                        }}
                        className="text-cyan-400 hover:text-cyan-300 font-bold underline"
                      >
                        Reopen &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-zinc-800 text-[11px] text-zinc-500 font-mono text-center">
          Persisted locally via browser localStorage.
        </div>
      </div>
    </div>
  );
}

