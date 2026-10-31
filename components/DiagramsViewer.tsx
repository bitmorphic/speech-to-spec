'use client';

import React, { useState, useEffect, useRef } from 'react';

export interface DiagramsViewerProps {
  specMarkdown: string;
  flowchart: string | null;
  erDiagram: string | null;
  isLoading: boolean;
  onGenerate: () => void;
  error?: string | null;
}

interface DiagramRenderState {
  svg: string;
  parseError: string | null;
  sanitizedCode?: string;
}

/**
 * Sanitizes Mermaid flowchart code.
 * Fixes empty node labels (e.g. End1[""]), empty edge labels, and unescaped characters.
 */
export function sanitizeFlowchart(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = raw.trim();

  // Strip markdown code fences
  if (cleaned.startsWith('```mermaid')) {
    cleaned = cleaned.replace(/^```mermaid\s*/i, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '');
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/```$/, '');
  }
  cleaned = cleaned.trim();

  if (!cleaned.startsWith('flowchart') && !cleaned.startsWith('graph')) {
    cleaned = `flowchart TD\n${cleaned}`;
  }

  // 1. Fix empty node labels like NodeId[""] or NodeId[''] or NodeId[]
  cleaned = cleaned.replace(/([a-zA-Z0-9_-]+)\[\s*["']?\s*["']?\s*\]/g, '$1["End"]');
  cleaned = cleaned.replace(/([a-zA-Z0-9_-]+)\(\s*["']?\s*["']?\s*\)/g, '$1("End")');
  cleaned = cleaned.replace(/([a-zA-Z0-9_-]+)\{\s*["']?\s*["']?\s*\}/g, '$1{"End"}');

  // 2. Fix empty edge labels e.g. -->||
  cleaned = cleaned.replace(/-->\|\|\s*/g, '--> ');

  // 3. Fix unescaped comparison operators inside node braces e.g. {"... > ..."}
  cleaned = cleaned.replace(/\{"([^"]*?)>([^"]*?)"\}/g, '{"$1&gt;$2"}');
  cleaned = cleaned.replace(/\{"([^"]*?)<([^"]*?)"\}/g, '{"$1&lt;$2"}');

  return cleaned;
}

/**
 * Sanitizes Mermaid erDiagram code.
 * Fixes array brackets (e.g. string[] or string["End"] participantIds) into valid attribute types (e.g. string_array).
 */
export function sanitizeErDiagram(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = raw.trim();

  // Strip markdown code fences
  if (cleaned.startsWith('```mermaid')) {
    cleaned = cleaned.replace(/^```mermaid\s*/i, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '');
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/```$/, '');
  }
  cleaned = cleaned.trim();

  if (!cleaned.startsWith('erDiagram')) {
    cleaned = `erDiagram\n${cleaned}`;
  }

  // 1. Fix any type["End"] or type["..."] before attribute name (e.g. string["End"] participantIds -> string_array participantIds)
  cleaned = cleaned.replace(/([a-zA-Z0-9_]+)\[\s*["']?.*?["']?\s*\]\s+([a-zA-Z0-9_]+)/g, '$1_array $2');

  // 2. Fix array types like string[] participantIds -> string_array participantIds
  cleaned = cleaned.replace(/([a-zA-Z0-9_]+)\[\]\s+([a-zA-Z0-9_]+)/g, '$1_array $2');

  // 3. Clean lines inside entity blocks
  const lines = cleaned.split('\n');
  let inEntity = false;
  const processedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.endsWith('{')) {
      inEntity = true;
      return line;
    }
    if (trimmed === '}') {
      inEntity = false;
      return line;
    }
    if (inEntity && trimmed.length > 0) {
      let attrLine = line.replace(/(\w+)\[.*?\]\s+(\w+)/g, '$1_array $2');
      attrLine = attrLine.replace(/(\w+)\[\]/g, '$1_array');
      return attrLine;
    }
    return line;
  });

  return processedLines.join('\n');
}

export function sanitizeMermaid(raw: string | null | undefined): string {
  if (!raw) return '';
  if (raw.includes('erDiagram')) {
    return sanitizeErDiagram(raw);
  }
  return sanitizeFlowchart(raw);
}

export function DiagramsViewer({
  specMarkdown,
  flowchart,
  erDiagram,
  isLoading,
  onGenerate,
  error,
}: DiagramsViewerProps) {
  const [activeTab, setActiveTab] = useState<'flowchart' | 'er'>('flowchart');
  const [flowchartState, setFlowchartState] = useState<DiagramRenderState>({ svg: '', parseError: null });
  const [erState, setErState] = useState<DiagramRenderState>({ svg: '', parseError: null });
  const [isRendering, setIsRendering] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Dynamically load mermaid and render diagrams in browser
  useEffect(() => {
    let isMounted = true;

    async function render() {
      if (typeof window === 'undefined') return;
      if (!flowchart && !erDiagram) return;

      setIsRendering(true);

      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        });

        // 1. Render Flowchart
        if (flowchart) {
          const sanitized = sanitizeFlowchart(flowchart);
          try {
            await mermaid.parse(sanitized);
            const id = `mermaid-flowchart-${Math.random().toString(36).substring(2, 9)}`;
            const { svg } = await mermaid.render(id, sanitized);
            if (isMounted) {
              setFlowchartState({ svg, parseError: null, sanitizedCode: sanitized });
            }
          } catch (err: unknown) {
            if (isMounted) {
              setFlowchartState({
                svg: '',
                parseError: err instanceof Error ? err.message : 'Invalid Mermaid flowchart syntax',
                sanitizedCode: sanitized,
              });
            }
          }
        }

        // 2. Render ER Diagram
        if (erDiagram) {
          const sanitized = sanitizeErDiagram(erDiagram);
          try {
            await mermaid.parse(sanitized);
            const id = `mermaid-er-${Math.random().toString(36).substring(2, 9)}`;
            const { svg } = await mermaid.render(id, sanitized);
            if (isMounted) {
              setErState({ svg, parseError: null, sanitizedCode: sanitized });
            }
          } catch (err: unknown) {
            if (isMounted) {
              setErState({
                svg: '',
                parseError: err instanceof Error ? err.message : 'Invalid Mermaid ER diagram syntax',
                sanitizedCode: sanitized,
              });
            }
          }
        }
      } catch (err: unknown) {
        console.error('Failed to load mermaid', err);
      } finally {
        if (isMounted) {
          setIsRendering(false);
        }
      }
    }

    render();

    return () => {
      isMounted = false;
    };
  }, [flowchart, erDiagram]);

  const activeCode = activeTab === 'flowchart' ? (flowchartState.sanitizedCode || flowchart) : (erState.sanitizedCode || erDiagram);
  const activeState = activeTab === 'flowchart' ? flowchartState : erState;
  const fileNamePrefix = activeTab === 'flowchart' ? 'flowchart' : 'data-model';

  const handleDownloadMmd = () => {
    if (!activeCode) return;
    const blob = new Blob([activeCode], { type: 'text/vnd.mermaid;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileNamePrefix}.mmd`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSvg = () => {
    if (!activeState.svg) return;
    const blob = new Blob([activeState.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileNamePrefix}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasDiagrams = Boolean(flowchart || erDiagram);

  return (
    <div className="flex flex-col gap-6" ref={containerRef}>
      {/* Header toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900/60">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">
              Architecture Diagrams
            </h3>
            {hasDiagrams && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-cyan-950/60 border border-cyan-800/80 text-cyan-300">
                User Flow &amp; Data Model
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Visual representations rendered in browser via Mermaid.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!hasDiagrams ? (
            <button
              type="button"
              onClick={onGenerate}
              disabled={isLoading || !specMarkdown}
              className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider bg-cyan-500 hover:bg-cyan-400 text-zinc-950 rounded transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-cyan-950/40 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            >
              {isLoading ? 'Generating Diagrams...' : 'Generate Diagrams'}
            </button>
          ) : (
            <>
              {activeCode && (
                <button
                  type="button"
                  onClick={handleDownloadMmd}
                  className="px-3 py-1.5 text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
                  title="Download raw Mermaid diagram file"
                >
                  Download .mmd
                </button>
              )}

              {activeState.svg && (
                <button
                  type="button"
                  onClick={handleDownloadSvg}
                  className="px-3 py-1.5 text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
                  title="Download scalable vector graphic"
                >
                  Download SVG
                </button>
              )}

              <button
                type="button"
                onClick={onGenerate}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:bg-zinc-800 rounded transition"
                title="Regenerate diagrams"
              >
                {isLoading ? 'Regenerating...' : 'Regenerate'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-3.5 rounded-lg border border-rose-900/60 bg-rose-950/40 text-xs font-mono text-rose-300">
          <strong className="font-bold">Error:</strong> {error}
        </div>
      )}

      {/* Empty placeholder */}
      {!hasDiagrams && !isLoading && !error && (
        <div className="p-8 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/20 text-center flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-zinc-300">
            No architecture diagrams generated yet
          </p>
          <p className="text-xs text-zinc-500 max-w-md">
            Click &quot;Generate Diagrams&quot; to inspect specification flows and entities, creating an interactive user flow chart and entity-relationship diagram.
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="h-10 w-60 rounded bg-zinc-900 border border-zinc-800/80" />
          <div className="h-80 rounded-lg bg-zinc-900/60 border border-zinc-800/80" />
        </div>
      )}

      {/* Diagram Viewer */}
      {hasDiagrams && !isLoading && (
        <div className="flex flex-col gap-4">
          {/* Sub-tabs: User Flow vs Entity Relationship */}
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('flowchart')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition ${
                activeTab === 'flowchart'
                  ? 'bg-zinc-800 text-cyan-300 font-semibold border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              1. User Flow Diagram
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('er')}
              className={`px-3 py-1.5 rounded text-xs font-mono transition ${
                activeTab === 'er'
                  ? 'bg-zinc-800 text-cyan-300 font-semibold border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              2. Data Model (ERD)
            </button>
          </div>

          {/* Diagram display area */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 sm:p-6 overflow-x-auto min-h-[360px] flex items-center justify-center">
            {isRendering ? (
              <div className="text-xs font-mono text-zinc-500 animate-pulse">
                Rendering diagram...
              </div>
            ) : activeState.parseError ? (
              /* Fallback if Mermaid parse fails: show code with note instead of crashing */
              <div className="w-full flex flex-col gap-3">
                <div className="p-3 rounded border border-amber-900/60 bg-amber-950/30 text-xs font-mono text-amber-300 flex flex-col gap-1">
                  <span className="font-bold">Notice: Mermaid syntax validation failed to render visually.</span>
                  <span className="text-amber-400/80 text-[11px]">{activeState.parseError}</span>
                  <span className="text-zinc-400 text-[11px] mt-1">Displaying raw diagram code below:</span>
                </div>
                <pre className="p-4 rounded bg-zinc-900/90 border border-zinc-800 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre">
                  {activeCode}
                </pre>
              </div>
            ) : activeState.svg ? (
              <div
                className="w-full flex items-center justify-center [&_svg]:max-w-full [&_svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: activeState.svg }}
              />
            ) : (
              <div className="text-xs font-mono text-zinc-500">
                Diagram definition empty.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

