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
      const src = nodeByQuote.get(c.quoteA);
      const tgt = nodeByQuote.get(c.quoteB);
      if (src && tgt && src !== tgt) {
        edgeList.push({
          contradiction: c,
          source: src,
          target: tgt,
        });
      }
    }

    return { nodes: nodeList, edges: edgeList, exceedsLimit: false };
  }, [contradictions]);

  // If more than 14 nodes, fall back gracefully
  if (exceedsLimit) {
    return (
      <div className="p-4 rounded-[16px] border border-[#E4E2DA] bg-[#F7F6F3] text-xs text-[#6B6A63] font-sans">
        Conflict graph contains more than 14 statements; falling back to list view for clarity.
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="p-4 rounded-[16px] border border-[#E4E2DA] bg-[#F7F6F3] text-xs text-[#6B6A63] font-sans">
        No contradictions detected to map.
      </div>
    );
  }

  const activeContradiction = contradictions.find((c) => c.id === selectedEdgeId);
  const relatedQuestions = questions.filter(
    (q) => activeContradiction && q.relatesTo && q.relatesTo.includes(activeContradiction.id)
  );

  return (
    <div className="flex flex-col gap-4 p-5 rounded-[16px] border border-[#E4E2DA] bg-white shadow-xs font-sans text-[#1B1B18]">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-sans font-semibold text-[#1B1B18]">
            Contradiction map
          </h3>
          <p className="text-[11px] text-[#6B6A63]">
            Statements placed on circle. Edges indicate direct contradictions. Click an edge to inspect.
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] font-sans">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
            <span className="text-[#6B6A63]">High severity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
            <span className="text-[#6B6A63]">Medium severity</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full aspect-square max-w-[500px] mx-auto bg-[#F8F8F7] rounded-[16px] border border-[#E4E2DA] p-2 flex items-center justify-center">
        <svg
          viewBox="0 0 500 500"
          className="w-full h-full select-none"
          aria-label="Interactive Contradiction Graph"
        >
          {/* Subtle perimeter circle */}
          <circle cx="250" cy="250" r="175" fill="none" stroke="#E4E2DA" strokeWidth="1" strokeDasharray="4 4" />

          {/* Edges */}
          {edges.map((edge, idx) => {
            const isSelected = selectedEdgeId === edge.contradiction.id;
            const strokeColor =
              edge.contradiction.severity === 'high' ? '#EF4444' : '#F59E0B';
            const strokeWidth = isSelected ? 3.5 : 2;

            return (
              <g key={`edge-${idx}-${edge.contradiction.id}`}>
                <line
                  x1={edge.source.x}
                  y1={edge.source.y}
                  x2={edge.target.x}
                  y2={edge.target.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeOpacity={isSelected ? 1 : 0.7}
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
                  fill={isHovered ? '#2563EB' : '#1B1B18'}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  className="transition-all"
                />
                {/* Short label */}
                <text
                  x={node.x}
                  y={node.y > 250 ? node.y + 16 : node.y - 12}
                  textAnchor="middle"
                  fill="#1B1B18"
                  fontSize="10"
                  fontFamily="sans-serif"
                  fontWeight="500"
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
          <div className="absolute bottom-3 left-3 right-3 p-3 rounded-xl bg-white border border-[#E4E2DA] text-xs text-[#1B1B18] shadow-md pointer-events-none z-20 font-sans">
            &quot;{nodes[hoveredNodeIndex].quote}&quot;
          </div>
        )}
      </div>

      {/* Selected Edge Inspector Card */}
      {activeContradiction && (
        <article className="p-4 rounded-[16px] border border-[#E4E2DA] bg-[#F7F6F3] text-xs flex flex-col gap-3 font-sans">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-[#1B1B18] bg-white border border-[#E4E2DA] px-2 py-0.5 rounded font-medium">
              {activeContradiction.id}
            </span>
            <span
              className={`text-[11px] font-sans font-medium px-2 py-0.5 rounded border ${
                activeContradiction.severity === 'high'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {activeContradiction.severity} severity
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-xl bg-white border border-[#E4E2DA]">
              <span className="text-[10px] text-[#6B6A63] uppercase block font-medium">Quote A</span>
              <span className="text-[#1B1B18] leading-relaxed">&quot;{activeContradiction.quoteA}&quot;</span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-[#E4E2DA]">
              <span className="text-[10px] text-[#6B6A63] uppercase block font-medium">Quote B</span>
              <span className="text-[#1B1B18] leading-relaxed">&quot;{activeContradiction.quoteB}&quot;</span>
            </div>
          </div>

          <p className="text-[#1B1B18] leading-relaxed">
            <strong className="text-[#6B6A63]">Why:</strong> {activeContradiction.why}
          </p>

          {/* Related questions */}
          {relatedQuestions.length > 0 && (
            <div className="pt-2 border-t border-[#E4E2DA] flex flex-col gap-1.5">
              <span className="text-[11px] text-[#6B6A63] font-medium">
                Clarifying questions for this conflict:
              </span>
              <ul className="list-disc list-inside space-y-1 text-xs text-[#1B1B18]">
                {relatedQuestions.map((q) => (
                  <li key={q.id}>{q.question}</li>
                ))}
              </ul>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
