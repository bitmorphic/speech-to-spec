'use client';

import React, { useState, useMemo } from 'react';
import { Contradiction, Question } from '@/lib/types';

export interface ConflictMapProps {
  contradictions: Contradiction[];
  questions?: Question[];
  onSelectContradiction?: (id: string) => void;
}

interface GraphNode {
  index: number;
  quote: string;
  shortLabel: string;
  x: number;
  y: number;
}

interface GraphEdge {
  contradiction: Contradiction;
  source: GraphNode;
  target: GraphNode;
}

export function ConflictMap({
  contradictions,
  questions = [],
  onSelectContradiction,
}: ConflictMapProps) {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredNodeIndex, setHoveredNodeIndex] = useState<number | null>(null);

  // Extract unique quotes
  const { nodes, edges, exceedsLimit } = useMemo(() => {
    if (!contradictions || contradictions.length === 0) {
      return { nodes: [], edges: [], exceedsLimit: false };
    }

    const uniqueQuoteStrings: string[] = [];
    for (const c of contradictions) {
      if (c.quoteA && !uniqueQuoteStrings.includes(c.quoteA)) {
        uniqueQuoteStrings.push(c.quoteA);
      }
      if (c.quoteB && !uniqueQuoteStrings.includes(c.quoteB)) {
        uniqueQuoteStrings.push(c.quoteB);
      }
    }

    if (uniqueQuoteStrings.length > 14) {
      return { nodes: [], edges: [], exceedsLimit: true };
    }

    const cx = 250;
    const cy = 250;
    const radius = 175;
    const total = uniqueQuoteStrings.length;

    const nodeList: GraphNode[] = uniqueQuoteStrings.map((quote, idx) => {
      const angle = (2 * Math.PI * idx) / total - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      const shortLabel =
        quote.length > 22 ? quote.slice(0, 20).trim() + '…' : quote;

      return {
        index: idx,
        quote,
        shortLabel,
        x,
        y,
      };
    });

    const nodeByQuote = new Map<string, GraphNode>();
    nodeList.forEach((n) => nodeByQuote.set(n.quote, n));

    const edgeList: GraphEdge[] = [];
    for (const c of contradictions) {
      const source = nodeByQuote.get(c.quoteA);
      const target = nodeByQuote.get(c.quoteB);
      if (source && target) {
        edgeList.push({
          contradiction: c,
          source,
          target,
        });
      }
    }

    return { nodes: nodeList, edges: edgeList, exceedsLimit: false };
  }, [contradictions]);

  // Selected contradiction details
  const activeContradiction = useMemo(() => {
    if (!selectedEdgeId) return null;
    return contradictions.find((c) => c.id === selectedEdgeId) || null;
  }, [selectedEdgeId, contradictions]);

  // Questions related to selected contradiction
  const relatedQuestions = useMemo(() => {
    if (!activeContradiction) return [];
    return questions.filter((q) => q.relatesTo && q.relatesTo.includes(activeContradiction.id));
  }, [activeContradiction, questions]);

  if (exceedsLimit) {
    return (
      <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/30 text-xs font-mono text-zinc-400">
        Over 14 distinct quotes detected. Graph view falls back to the list view to preserve legibility.
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/30 text-xs font-mono text-zinc-500">
        No contradictions available to map.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300">
            Conflict Graph Map
          </span>
          <span className="text-[11px] font-mono text-zinc-500">
            ({nodes.length} nodes, {edges.length} edges)
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="flex items-center gap-1 text-rose-300">
            <span className="w-2.5 h-0.5 bg-rose-500 rounded inline-block" /> High
          </span>
          <span className="flex items-center gap-1 text-amber-300">
            <span className="w-2.5 h-0.5 bg-amber-500 rounded inline-block" /> Medium
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full aspect-square max-w-[480px] mx-auto bg-zinc-950/80 rounded-lg border border-zinc-800/80 p-2 overflow-hidden">
        <svg
          viewBox="0 0 500 500"
          className="w-full h-full"
          role="img"
          aria-label="Interactive graph of conflicting transcript statements"
        >
          {/* Edges */}
          {edges.map((edge) => {
            const isSelected = selectedEdgeId === edge.contradiction.id;
            const strokeColor =
              edge.contradiction.severity === 'high' ? '#f43f5e' : '#f59e0b';
            const strokeWidth = isSelected ? 4 : 2;

            return (
              <g key={`edge-${edge.contradiction.id}`}>
                {/* Invisible hit-area line for easy clicking */}
                <line
                  x1={edge.source.x}
                  y1={edge.source.y}
                  x2={edge.target.x}
                  y2={edge.target.y}
                  stroke="transparent"
                  strokeWidth={16}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedEdgeId(edge.contradiction.id);
                    if (onSelectContradiction) onSelectContradiction(edge.contradiction.id);
                  }}
                />
                {/* Visible styled edge */}
                <line
                  x1={edge.source.x}
                  y1={edge.source.y}
                  x2={edge.target.x}
                  y2={edge.target.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeOpacity={isSelected ? 1 : 0.75}
                  className="cursor-pointer transition-all"
                  onClick={() => {
                    setSelectedEdgeId(edge.contradiction.id);
                    if (onSelectContradiction) onSelectContradiction(edge.contradiction.id);
                  }}
                />
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isHovered = hoveredNodeIndex === node.index;
            return (
              <g
                key={`node-${node.index}`}
                tabIndex={0}
                role="button"
                aria-label={`Statement: "${node.quote}"`}
                onMouseEnter={() => setHoveredNodeIndex(node.index)}
                onMouseLeave={() => setHoveredNodeIndex(null)}
                onFocus={() => setHoveredNodeIndex(node.index)}
                onBlur={() => setHoveredNodeIndex(null)}
                className="cursor-pointer focus:outline-none"
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isHovered ? 8 : 6}
                  fill={isHovered ? '#22d3ee' : '#3f3f46'}
                  stroke="#18181b"
                  strokeWidth={2}
                  className="transition-all"
                />
                {/* Short label */}
                <text
                  x={node.x}
                  y={node.y > 250 ? node.y + 16 : node.y - 12}
                  textAnchor="middle"
                  fill="#d4d4d8"
                  fontSize="10"
                  fontFamily="monospace"
                  className="pointer-events-none select-none"
                >
                  {node.shortLabel}
                </text>
                <title>{node.quote}</title>
              </g>
            );
          })}
        </svg>

        {/* Hovered node full quote tooltip */}
        {hoveredNodeIndex !== null && nodes[hoveredNodeIndex] && (
          <div className="absolute bottom-2 left-2 right-2 p-2 rounded bg-zinc-900 border border-zinc-700 text-xs font-mono text-cyan-300 shadow-lg pointer-events-none z-20">
            &quot;{nodes[hoveredNodeIndex].quote}&quot;
          </div>
        )}
      </div>

      {/* Selected Edge Inspector Card */}
      {activeContradiction && (
        <article className="p-3.5 rounded-lg border border-cyan-800/80 bg-zinc-950 text-xs flex flex-col gap-2.5 animate-fadeIn">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded font-bold">
              {activeContradiction.id}
            </span>
            <span
              className={`text-[10px] font-mono uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${
                activeContradiction.severity === 'high'
                  ? 'border-rose-800 bg-rose-950/80 text-rose-300'
                  : 'border-amber-800 bg-amber-950/80 text-amber-300'
              }`}
            >
              {activeContradiction.severity} severity
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block font-bold">Quote A</span>
              <span className="text-zinc-200">&quot;{activeContradiction.quoteA}&quot;</span>
            </div>
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block font-bold">Quote B</span>
              <span className="text-zinc-200">&quot;{activeContradiction.quoteB}&quot;</span>
            </div>
          </div>

          <p className="text-zinc-300 font-sans text-xs">
            <strong className="text-zinc-400 font-mono">Why:</strong> {activeContradiction.why}
          </p>

          {/* Related questions */}
          {relatedQuestions.length > 0 && (
            <div className="pt-2 border-t border-zinc-800 flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                Clarifying Questions for this conflict:
              </span>
              <ul className="list-disc list-inside space-y-1 text-zinc-300 text-xs">
                {relatedQuestions.map((q) => (
                  <li key={q.id}>
                    <span className="font-mono text-cyan-400 mr-1.5">#{q.id}:</span>
                    {q.question}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      )}
    </div>
  );
}

