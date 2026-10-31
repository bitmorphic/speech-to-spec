'use client';

import React, { useMemo } from 'react';
import * as Diff from 'diff';

export interface SpecDiffViewerProps {
  previousSpecMarkdown: string;
  currentSpecMarkdown: string;
}

export function SpecDiffViewer({
  previousSpecMarkdown,
  currentSpecMarkdown,
}: SpecDiffViewerProps) {
  const { lineDiffs, addedCount, removedCount } = useMemo(() => {
    const changes = Diff.diffLines(previousSpecMarkdown, currentSpecMarkdown);
    let added = 0;
    let removed = 0;

    for (const change of changes) {
      if (change.added) {
        added += change.count || 0;
      } else if (change.removed) {
        removed += change.count || 0;
      }
    }

    return { lineDiffs: changes, addedCount: added, removedCount: removed };
  }, [previousSpecMarkdown, currentSpecMarkdown]);

  return (
    <div className="flex flex-col gap-4">
      {/* Diff stats bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/60 font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-zinc-200">
            Specification Changes
          </span>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 font-bold">
              +{addedCount} added
            </span>
            <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-800/80 text-rose-300 font-bold">
              -{removedCount} removed
            </span>
          </div>
        </div>

        <span className="text-zinc-500 text-[11px]">
          Comparing regenerated spec with previous version
        </span>
      </div>

      {/* Diff container */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-x-auto text-xs font-mono">
        <pre className="p-4 leading-relaxed font-mono">
          {lineDiffs.map((part, index) => {
            const lines = part.value.replace(/\n$/, '').split('\n');

            if (part.added) {
              return lines.map((line, lineIdx) => (
                <div
                  key={`${index}-${lineIdx}`}
                  className="bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500 px-2 py-0.5 whitespace-pre flex items-start gap-2"
                >
                  <span className="text-emerald-500/70 select-none font-bold shrink-0">+</span>
                  <span className="break-all">{line}</span>
                </div>
              ));
            }

            if (part.removed) {
              return lines.map((line, lineIdx) => (
                <div
                  key={`${index}-${lineIdx}`}
                  className="bg-rose-950/40 text-rose-300/90 border-l-2 border-rose-500 line-through px-2 py-0.5 whitespace-pre flex items-start gap-2"
                >
                  <span className="text-rose-500/70 select-none font-bold shrink-0">-</span>
                  <span className="break-all">{line}</span>
                </div>
              ));
            }

            return lines.map((line, lineIdx) => (
              <div
                key={`${index}-${lineIdx}`}
                className="text-zinc-400 px-2 py-0.5 whitespace-pre flex items-start gap-2"
              >
                <span className="text-zinc-600 select-none shrink-0">&nbsp;</span>
                <span className="break-all">{line}</span>
              </div>
            ));
          })}
        </pre>
      </div>
    </div>
  );
}

