"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface GraphNode {
  id: number;
  title: string;
  venue: string | null;
  year: number | null;
  weighted_score: number | null;
  in_graph: boolean;
}

export interface GraphEdge {
  source: number;
  target: number;
  weight: number;
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function simulate(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  const sim: SimNode[] = nodes.map((n, i) => ({
    ...n,
    x: width / 2 + Math.cos((2 * Math.PI * i) / Math.max(nodes.length, 1)) * 160,
    y: height / 2 + Math.sin((2 * Math.PI * i) / Math.max(nodes.length, 1)) * 130,
    vx: 0,
    vy: 0,
  }));
  const idx = new Map(sim.map((n, i) => [n.id, i]));
  for (let iter = 0; iter < 300; iter++) {
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        let dx = sim[i].x - sim[j].x;
        let dy = sim[i].y - sim[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) d2 = 1;
        const f = 22000 / d2;
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        sim[i].vx += dx * f;
        sim[i].vy += dy * f;
        sim[j].vx -= dx * f;
        sim[j].vy -= dy * f;
      }
    }
    for (const e of edges) {
      const a = idx.get(e.source);
      const b = idx.get(e.target);
      if (a === undefined || b === undefined) continue;
      const dx = sim[b].x - sim[a].x;
      const dy = sim[b].y - sim[a].y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = (d - 190) * 0.015 * (0.6 + e.weight);
      sim[a].vx += (dx / d) * f;
      sim[a].vy += (dy / d) * f;
      sim[b].vx -= (dx / d) * f;
      sim[b].vy -= (dy / d) * f;
    }
    for (const n of sim) {
      n.vx += (width / 2 - n.x) * 0.004;
      n.vy += (height / 2 - n.y) * 0.004;
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(70, Math.min(width - 70, n.x));
      n.y = Math.max(50, Math.min(height - 50, n.y));
    }
  }
  return sim;
}

export default function RelationGraph({
  nodes,
  edges,
  onOpen,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onOpen: (id: number) => void;
}) {
  const width = 880;
  const height = 520;
  const sim = useMemo(() => simulate(nodes, edges, width, height), [nodes, edges]);
  const [hover, setHover] = useState<number | null>(null);
  const idx = new Map(sim.map((n) => [n.id, n]));

  const radius = (n: SimNode) =>
    n.weighted_score == null ? 16 : 14 + (n.weighted_score - 2) * 4;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <span className="text-xs text-neutral-500">
          节点大小 = 加权总分 · 连线 = 内容相似度 · 点击节点进入精读
        </span>
        <span className="text-xs text-neutral-400">
          {nodes.length} 篇 · {edges.length} 条关联
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {edges.map((e, i) => {
          const a = idx.get(e.source);
          const b = idx.get(e.target);
          if (!a || !b) return null;
          const active = hover !== null && (e.source === hover || e.target === hover);
          return (
            <g key={i}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={active ? "#2563eb" : "#cbd5e1"}
                strokeWidth={1 + e.weight * 3}
                strokeOpacity={active ? 0.9 : 0.6}
              />
              {active && (
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#2563eb"
                >
                  相似度 {e.weight}
                </text>
              )}
            </g>
          );
        })}
        {sim.map((n) => (
          <g
            key={n.id}
            className="cursor-pointer"
            onClick={() => onOpen(n.id)}
            onMouseEnter={() => setHover(n.id)}
            onMouseLeave={() => setHover(null)}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={radius(n)}
              fill={hover === n.id ? "#2563eb" : "#3b82f6"}
              fillOpacity={n.in_graph ? 0.85 : 0.35}
              stroke="#1d4ed8"
              strokeWidth={hover === n.id ? 2 : 1}
            />
            {n.weighted_score != null && (
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="white"
              >
                {n.weighted_score.toFixed(1)}
              </text>
            )}
            <text
              x={n.x}
              y={n.y + radius(n) + 14}
              textAnchor="middle"
              fontSize={11}
              fill="#525252"
            >
              {n.title.length > 18 ? n.title.slice(0, 18) + "…" : n.title}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
