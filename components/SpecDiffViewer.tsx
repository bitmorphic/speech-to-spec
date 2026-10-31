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
    <div className="flex flex-col gap-4 font-sans text-[#1B1B18]">
      {/* Diff stats bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-[16px] border border-[#E4E2DA] bg-white shadow-xs text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[#1B1B18]">
            Specification changes
          </span>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
              +{addedCount} added
            </span>
            <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-800 font-medium">
              -{removedCount} removed
            </span>
          </div>
        </div>

        <span className="text-[#6B6A63] text-[11px]">
          Comparing regenerated specification with previous version
        </span>
      </div>

      {/* Diff container */}
      <div className="rounded-[16px] border border-[#E4E2DA] bg-[#F8F8F7] overflow-x-auto text-xs font-mono shadow-xs">
        <pre className="p-4 leading-relaxed">
          {lineDiffs.map((part, index) => {
            const lines = part.value.replace(/\n$/, '').split('\n');

            if (part.added) {
              return lines.map((line, lineIdx) => (
                <div
                  key={`${index}-${lineIdx}`}
                  className="bg-emerald-50 text-emerald-900 border-l-2 border-emerald-600 px-3 py-0.5 whitespace-pre flex items-start gap-2"
                >
                  <span className="text-emerald-700 select-none font-bold shrink-0">+</span>
                  <span className="break-all">{line}</span>
                </div>
              ));
            }

            if (part.removed) {
              return lines.map((line, lineIdx) => (
                <div
                  key={`${index}-${lineIdx}`}
                  className="bg-rose-50 text-rose-900 border-l-2 border-rose-600 line-through px-3 py-0.5 whitespace-pre flex items-start gap-2"
                >
                  <span className="text-rose-700 select-none font-bold shrink-0">-</span>
                  <span className="break-all">{line}</span>
                </div>
              ));
            }

            return lines.map((line, lineIdx) => (
              <div
                key={`${index}-${lineIdx}`}
                className="text-[#6B6A63] px-3 py-0.5 whitespace-pre flex items-start gap-2"
              >
                <span className="text-stone-400 select-none shrink-0">&nbsp;</span>
                <span className="break-all">{line}</span>
              </div>
            ));
          })}
        </pre>
      </div>
    </div>
  );
}
