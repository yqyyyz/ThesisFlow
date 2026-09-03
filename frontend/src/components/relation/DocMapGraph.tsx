"use client";

import { useMemo, useState } from "react";

export interface DocNode {
  id: number;
  title: string;
  venue: string | null;
  year: number | null;
  weighted_score: number | null;
  summary: string;
}

export interface DocCluster {
  id: number;
  label: string;
  summary: string;
  doc_ids: number[];
}

export interface DocEdge {
  source: number;
  target: number;
  relation: string;
  label: string;
}

export interface DocMapData {
  narrative: string;
  clusters: DocCluster[];
  edges: DocEdge[];
  nodes: DocNode[];
}

const CLUSTER_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];
const RELATION_LABELS: Record<string, string> = {
  extends: "扩展",
  supports: "支持",
  contrasts: "对照",
  background: "背景",
  same_topic: "同主题",
};

interface SimNode {
  id: number;
  title: string;
  score: number;
  clusterIdx: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function simulate(nodes: DocNode[], clusters: DocCluster[], edges: DocEdge[], W: number, H: number) {
  const clusterOf = new Map<number, number>();
  clusters.forEach((c, i) => c.doc_ids.forEach((d) => clusterOf.set(d, i)));
  const sim: SimNode[] = nodes.map((n, i) => {
    const ci = clusterOf.get(n.id) ?? 0;
    const angle = (2 * Math.PI * ci) / Math.max(clusters.length, 1) + (i % 3) * 0.5;
    return {
      id: n.id,
      title: n.title,
      score: n.weighted_score ?? 3,
      clusterIdx: ci,
      x: W / 2 + Math.cos(angle) * W * 0.28 + (i % 5) * 12,
      y: H / 2 + Math.sin(angle) * H * 0.28 + (i % 4) * 12,
      vx: 0,
      vy: 0,
    };
  });
  const idx = new Map(sim.map((n, i) => [n.id, i]));

  for (let iter = 0; iter < 350; iter++) {
    const centroids = clusters.map(() => ({ x: 0, y: 0, n: 0 }));
    for (const s of sim) {
      centroids[s.clusterIdx].x += s.x;
      centroids[s.clusterIdx].y += s.y;
      centroids[s.clusterIdx].n += 1;
    }
    centroids.forEach((c) => {
      if (c.n > 0) {
        c.x /= c.n;
        c.y /= c.n;
      }
    });

    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        let dx = sim[i].x - sim[j].x;
        let dy = sim[i].y - sim[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) d2 = 1;
        const d = Math.sqrt(d2);
        const f = 26000 / d2;
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
      const f = (d - 170) * 0.02;
      sim[a].vx += (dx / d) * f;
      sim[a].vy += (dy / d) * f;
      sim[b].vx -= (dx / d) * f;
      sim[b].vy -= (dy / d) * f;
    }
    for (const s of sim) {
      const c = centroids[s.clusterIdx];
      if (c.n > 0) {
        s.vx += (c.x - s.x) * 0.035;
        s.vy += (c.y - s.y) * 0.035;
      }
      s.vx += (W / 2 - s.x) * 0.002;
      s.vy += (H / 2 - s.y) * 0.002;
      s.vx *= 0.8;
      s.vy *= 0.8;
      s.x += s.vx;
      s.y += s.vy;
      s.x = Math.max(70, Math.min(W - 70, s.x));
      s.y = Math.max(55, Math.min(H - 55, s.y));
    }
  }
  return sim;
}

export default function DocMapGraph({
  data,
  onOpenDoc,
}: {
  data: DocMapData;
  onOpenDoc: (id: number) => void;
}) {
  const W = 760;
  const H = 560;
  const [hover, setHover] = useState<number | null>(null);
  const sim = useMemo(
    () => simulate(data.nodes, data.clusters, data.edges, W, H),
    [data]
  );
  const idx = new Map(sim.map((n) => [n.id, n]));
  const colorOf = (clusterIdx: number) =>
    CLUSTER_COLORS[clusterIdx % CLUSTER_COLORS.length];
  const clusterOf = useMemo(() => {
    const m = new Map<number, number>();
    data.clusters.forEach((c, i) => c.doc_ids.forEach((d) => m.set(d, i)));
    return m;
  }, [data]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-neutral-200 bg-white">
      {data.edges.map((e, i) => {
        const a = idx.get(e.source);
        const b = idx.get(e.target);
        if (!a || !b) return null;
        const active = hover !== null && (e.source === hover || e.target === hover);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        return (
          <g key={i}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={active ? "#2563eb" : "#cbd5e1"}
              strokeWidth={active ? 2 : 1.2}
              strokeDasharray={e.relation === "contrasts" ? "5 3" : undefined}
            />
            <rect
              x={mx - 26}
              y={my - 9}
              width={52}
              height={16}
              rx={8}
              fill="white"
              stroke={active ? "#2563eb" : "#e5e7eb"}
            />
            <text x={mx} y={my + 3} textAnchor="middle" fontSize={9.5} fill={active ? "#2563eb" : "#64748b"}>
              {(RELATION_LABELS[e.relation] || e.relation) + (e.label ? `·${e.label.slice(0, 4)}` : "")}
            </text>
          </g>
        );
      })}
      {data.clusters.map((c, i) => {
        const members = c.doc_ids.map((d) => idx.get(d)).filter(Boolean) as SimNode[];
        if (members.length === 0) return null;
        const cx = members.reduce((a, v) => a + v.x, 0) / members.length;
        const cy = members.reduce((a, v) => a + v.y, 0) / members.length;
        return (
          <text
            key={c.id}
            x={cx}
            y={cy - Math.max(...members.map((m) => Math.abs(m.y - cy))) - 22}
            textAnchor="middle"
            fontSize={12}
            fontWeight={700}
            fill={colorOf(i)}
          >
            ── {c.label} ──
          </text>
        );
      })}
      {sim.map((n) => {
        const ci = clusterOf.get(n.id) ?? 0;
        const color = colorOf(ci);
        const r = 13 + (n.score - 1) * 3.2;
        const isH = hover === n.id;
        return (
          <g
            key={n.id}
            className="cursor-pointer"
            onClick={() => onOpenDoc(n.id)}
            onMouseEnter={() => setHover(n.id)}
            onMouseLeave={() => setHover(null)}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={r}
              fill={color}
              fillOpacity={isH ? 0.95 : 0.75}
              stroke={isH ? "#1e293b" : color}
              strokeWidth={isH ? 2.4 : 1}
            />
            <text x={n.x} y={n.y + 3.5} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="white">
              {n.score.toFixed(1)}
            </text>
            <text x={n.x} y={n.y + r + 13} textAnchor="middle" fontSize={10.5} fill="#475569">
              {n.title.length > 16 ? n.title.slice(0, 16) + "…" : n.title}
            </text>
            {isH && (
              <text x={n.x} y={n.y + r + 26} textAnchor="middle" fontSize={9.5} fill="#94a3b8">
                点击进入精读
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
