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

  // 0. Split multiple statements smashed on the same line (e.g. End1[""] Home --> ...)
  cleaned = cleaned.replace(/(\]|[\}\)])\s+([a-zA-Z0-9_-]+\s*-->)/g, '$1\n  $2');

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
          theme: 'neutral',
          securityLevel: 'loose',
          fontFamily: 'Instrument Sans, system-ui, sans-serif',
          themeVariables: {
            background: '#F8F8F7',
            primaryColor: '#FFFFFF',
            primaryTextColor: '#1B1B18',
            primaryBorderColor: '#E4E2DA',
            lineColor: '#1B1B18',
            secondaryColor: '#F7F6F3',
            tertiaryColor: '#FFFFFF',
          },
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
    <div className="flex flex-col gap-6 font-sans text-[#1B1B18]" ref={containerRef}>
      {/* Header toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-[16px] border border-[#E4E2DA] bg-white shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#1B1B18]">
              Architecture diagrams
            </h3>
            {hasDiagrams && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-[#F3F2EE] border border-[#E4E2DA] text-[#6B6A63] font-medium">
                User flow &amp; data model
              </span>
            )}
          </div>
          <p className="text-xs text-[#6B6A63] mt-0.5 font-sans">
            Visual representations rendered in browser via Mermaid in light theme.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!hasDiagrams ? (
            <button
              type="button"
              onClick={onGenerate}
              disabled={isLoading || !specMarkdown}
              className="px-4 py-2 text-xs font-sans font-medium bg-[#1B1B18] hover:bg-black text-white rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-xs focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none"
            >
              {isLoading ? 'Generating diagrams...' : 'Generate diagrams'}
            </button>
          ) : (
            <>
              {activeCode && (
                <button
                  type="button"
                  onClick={handleDownloadMmd}
                  className="px-3 py-1.5 text-xs font-sans bg-white hover:bg-[#F7F6F3] text-[#1B1B18] border border-[#E4E2DA] rounded-xl transition flex items-center gap-1.5 shadow-xs focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none font-medium"
                  title="Download raw Mermaid diagram file"
                >
                  Download .mmd
                </button>
              )}

              {activeState.svg && (
                <button
                  type="button"
                  onClick={handleDownloadSvg}
                  className="px-3 py-1.5 text-xs font-sans bg-white hover:bg-[#F7F6F3] text-[#1B1B18] border border-[#E4E2DA] rounded-xl transition flex items-center gap-1.5 shadow-xs focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-none font-medium"
                  title="Download scalable vector graphic"
                >
                  Download SVG
                </button>
              )}

              <button
                type="button"
                onClick={onGenerate}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs font-sans text-[#6B6A63] hover:text-[#1B1B18] border border-[#E4E2DA] hover:bg-[#F7F6F3] rounded-xl transition font-medium"
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
        <div className="p-4 rounded-[16px] border border-rose-200 bg-rose-50 text-xs text-rose-900 font-sans">
          <strong className="font-semibold">Error:</strong> {error}
        </div>
      )}

      {/* Empty placeholder */}
      {!hasDiagrams && !isLoading && !error && (
        <div className="p-8 rounded-[16px] border border-dashed border-[#E4E2DA] bg-[#F7F6F3] text-center flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-[#1B1B18]">
            No architecture diagrams generated yet
          </p>
          <p className="text-xs text-[#6B6A63] max-w-md">
            Click &quot;Generate diagrams&quot; to inspect specification flows and entities, creating an interactive user flow chart and entity-relationship diagram.
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="h-10 w-60 rounded-[16px] bg-[#F3F2EE] border border-[#E4E2DA]" />
          <div className="h-80 rounded-[16px] bg-white border border-[#E4E2DA]" />
        </div>
      )}

      {/* Diagram Viewer */}
      {hasDiagrams && !isLoading && (
        <div className="flex flex-col gap-4">
          {/* Sub-tabs: User Flow vs Entity Relationship */}
          <div className="flex items-center gap-2 border-b border-[#E4E2DA] pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('flowchart')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
                activeTab === 'flowchart'
                  ? 'bg-[#1B1B18] text-white'
                  : 'text-[#6B6A63] hover:text-[#1B1B18] hover:bg-[#F3F2EE]'
              }`}
            >
              1. User flow diagram
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('er')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
                activeTab === 'er'
                  ? 'bg-[#1B1B18] text-white'
                  : 'text-[#6B6A63] hover:text-[#1B1B18] hover:bg-[#F3F2EE]'
              }`}
            >
              2. Data model (ERD)
            </button>
          </div>

          {/* Diagram display area */}
          <div className="rounded-[16px] border border-[#E4E2DA] bg-white p-5 sm:p-7 overflow-x-auto min-h-[360px] flex items-center justify-center shadow-xs">
            {isRendering ? (
              <div className="text-xs text-[#6B6A63] animate-pulse">
                Rendering diagram...
              </div>
            ) : activeState.parseError ? (
              /* Fallback if Mermaid parse fails: show code with note instead of crashing */
              <div className="w-full flex flex-col gap-3">
                <div className="p-3.5 rounded-[16px] border border-amber-200 bg-amber-50 text-xs text-amber-900 flex flex-col gap-1 font-sans">
                  <span className="font-semibold">Notice: Mermaid syntax validation failed to render visually.</span>
                  <span className="text-amber-800 text-[11px]">{activeState.parseError}</span>
                  <span className="text-[#6B6A63] text-[11px] mt-1 font-mono">Displaying raw diagram code below:</span>
                </div>
                <pre className="p-4 rounded-[16px] bg-[#F7F6F3] border border-[#E4E2DA] text-xs font-mono text-[#1B1B18] overflow-x-auto whitespace-pre">
                  {activeCode}
                </pre>
              </div>
            ) : activeState.svg ? (
              <div
                className="w-full flex items-center justify-center [&_svg]:max-w-full [&_svg]:h-auto text-[#1B1B18]"
                dangerouslySetInnerHTML={{ __html: activeState.svg }}
              />
            ) : (
              <div className="text-xs text-[#6B6A63]">
                Diagram definition empty.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

