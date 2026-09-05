"use client";

import { useCallback, useMemo, useState } from "react";

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
      s.x = Math.max(88, Math.min(W - 88, s.x));
      s.y = Math.max(60, Math.min(H - 62, s.y));
    }
  }
  const xs = sim.map((s) => s.x);
  const ys = sim.map((s) => s.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (maxX - minX > 1 && maxY - minY > 1) {
    for (const s of sim) {
      s.x = 70 + ((s.x - minX) * (W - 140)) / (maxX - minX);
      s.y = 70 + ((s.y - minY) * (H - 165)) / (maxY - minY);
    }
  }
  return sim;
}

const textWidth = (s: string, cjk: number, latin: number) =>
  [...s].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? cjk : latin), 0);

const titleWidth = (s: string) =>
  [...s].reduce((sum, ch) => {
    const code = ch.charCodeAt(0);
    if (code > 255) return sum + 10.5;
    if (/[A-Z0-9]/.test(ch)) return sum + 7.4;
    return sum + 5.9;
  }, 0);

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
  const idx = useMemo(() => new Map(sim.map((n) => [n.id, n])), [sim]);
  const colorOf = (clusterIdx: number) =>
    CLUSTER_COLORS[clusterIdx % CLUSTER_COLORS.length];
  const clusterOf = useMemo(() => {
    const m = new Map<number, number>();
    data.clusters.forEach((c, i) => c.doc_ids.forEach((d) => m.set(d, i)));
    return m;
  }, [data]);

  const radiusOf = useCallback((id: number) => {
    const n = idx.get(id);
    return 13 + ((n ? n.score : 3) - 1) * 3.2;
  }, [idx]);

  const titles = useMemo(() => {
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    const map = new Map<
      number,
      { dy: number; dx: number; visible: boolean; display: string; w: number; box: { x: number; y: number; w: number; h: number } }
    >();
    const sorted = [...sim].sort((a, b) => a.y - b.y);
    for (const n of sorted) {
      const r = radiusOf(n.id);
      const display = n.title.length > 12 ? n.title.slice(0, 12) + "…" : n.title;
      const w = Math.round(titleWidth(display) * 1.25) + 4;
      const base = n.y + r + 13;
      let chosen: { dx: number; dy: number } | null = null;
      outer: for (const dy of [0, 14, 28, -14]) {
        for (const dx of [0, -45, 45, -90, 90]) {
          const cx = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, n.x + dx));
          const y = base + dy;
          const box = { x: cx - w / 2, y: y - 9, w, h: 12 };
          const hitBox = boxes.some(
            (q) => box.x < q.x + q.w && q.x < box.x + box.w && box.y < q.y + q.h && q.y < box.y + box.h
          );
          if (hitBox) continue;
          const hitCircle = sim.some((m) => {
            const ddx = Math.max(Math.abs(m.x - cx) - w / 2, 0);
            const ddy = Math.max(Math.abs(m.y - y) - 6, 0);
            return ddx * ddx + ddy * ddy < radiusOf(m.id) * radiusOf(m.id);
          });
          if (hitCircle) continue;
          chosen = { dx: cx - n.x, dy };
          break outer;
        }
      }
      const dx = chosen?.dx ?? 0;
      const dy = chosen?.dy ?? 0;
      const cx = n.x + dx;
      const y = base + dy;
      const box = { x: cx - w / 2, y: y - 9, w, h: 12 };
      if (chosen) boxes.push(box);
      map.set(n.id, { dy, dx, visible: chosen !== null, display, w, box });
    }
    return { map, boxes };
  }, [sim, radiusOf]);

  interface ClusterLabel {
    id: number;
    x: number;
    y: number;
    w: number;
    text: string;
    color: string;
  }

  const clusterLabels = useMemo(() => {
    const obstacles: { x: number; y: number; w: number; h: number }[] = titles.boxes.map((b) => ({ ...b }));
    const labels = data.clusters
      .map((c, i) => {
        const members = c.doc_ids.map((d) => idx.get(d)).filter(Boolean) as SimNode[];
        if (members.length === 0) return null;
        const cx = members.reduce((a, v) => a + v.x, 0) / members.length;
        let topY = Infinity;
        let topR = 13;
        for (const m of members) {
          if (m.y < topY) {
            topY = m.y;
            topR = radiusOf(m.id);
          }
        }
        const labelY = Math.max(15, topY - topR - 14);
        const text = `── ${c.label} ──`;
        const w = textWidth(text, 12, 8) + 10;
        const x = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, cx));
        return {
          id: c.id,
          x,
          y: labelY,
          w,
          text,
          color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
        } as ClusterLabel;
      })
      .filter(Boolean) as ClusterLabel[];

    const avoid = (l: ClusterLabel) => {
      for (let iter = 0; iter < 14; iter++) {
        let moved = false;
        for (const n of sim) {
          const r = radiusOf(n.id);
          const dx = Math.max(Math.abs(n.x - l.x) - l.w / 2, 0);
          const dy = Math.max(Math.abs(n.y - l.y) - 7.5, 0);
          if (dx * dx + dy * dy < (r + 2) * (r + 2)) {
            const push = r + 2 - Math.hypot(dx, dy) + 2;
            const ny = Math.max(15, l.y - push);
            if (ny < l.y) {
              l.y = ny;
              moved = true;
            }
          }
        }
        for (const q of obstacles) {
          if (
            Math.abs(q.x + q.w / 2 - l.x) < (q.w + l.w) / 2 + 2 &&
            Math.abs(q.y + q.h / 2 - l.y) < (q.h + 15) / 2 + 2
          ) {
            const ny = Math.max(15, q.y - 15 / 2 - 4);
            if (ny < l.y) {
              l.y = ny;
              moved = true;
            }
          }
        }
        if (!moved) break;
      }
    };

    for (let round = 0; round < 2; round++) {
      for (const l of labels) avoid(l);
      const sorted = [...labels].sort((a, b) => a.y - b.y);
      for (let i = 1; i < sorted.length; i++) {
        for (let j = 0; j < i; j++) {
          const prev = sorted[j];
          const cur = sorted[i];
          if (
            Math.abs(prev.x - cur.x) < (prev.w + cur.w) / 2 + 4 &&
            cur.y - prev.y < 18
          ) {
            cur.y = Math.min(prev.y + 18, H - 30);
          }
        }
      }
    }
    return labels;
  }, [data, idx, radiusOf, sim, titles]);

  const plans = useMemo(() => {
    const pairGroups = new Map<string, number[]>();
    data.edges.forEach((e, i) => {
      const key = `${Math.min(e.source, e.target)}-${Math.max(e.source, e.target)}`;
      const arr = pairGroups.get(key) ?? [];
      arr.push(i);
      pairGroups.set(key, arr);
    });

    const placed: { x: number; y: number; w: number; hh: number }[] = [
      ...clusterLabels.map((l) => ({ x: l.x, y: l.y, w: l.w, hh: 9 })),
      ...titles.boxes.map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, hh: 8 })),
      ...sim.map((n) => {
        const r = radiusOf(n.id);
        return { x: n.x, y: n.y, w: r * 2, hh: r };
      }),
    ];

    return data.edges.map((e, i) => {
      const a = idx.get(e.source);
      const b = idx.get(e.target);
      if (!a || !b) return null;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const ux = dx / d;
      const uy = dy / d;
      const px = -uy;
      const py = ux;
      const ra = radiusOf(e.source);
      const rb = radiusOf(e.target);
      const ax = a.x + ux * (ra + 3);
      const ay = a.y + uy * (ra + 3);
      const bx = b.x - ux * (rb + 3);
      const by = b.y - uy * (rb + 3);

      const key = `${Math.min(e.source, e.target)}-${Math.max(e.source, e.target)}`;
      const pair = pairGroups.get(key)!;
      const rank = pair.indexOf(i);
      const off = (rank - (pair.length - 1) / 2) * 64;
      const cx = (ax + bx) / 2 + px * off;
      const cy = (ay + by) / 2 + py * off;

      const labelText = RELATION_LABELS[e.relation] || e.relation;
      const labelW = textWidth(labelText, 9.5, 5.5) + 10;

      const bez = (t: number) => {
        const mt = 1 - t;
        return {
          x: mt * mt * ax + 2 * mt * t * cx + t * t * bx,
          y: mt * mt * ay + 2 * mt * t * cy + t * t * by,
        };
      };
      const collides = (p: { x: number; y: number }) =>
        placed.some(
          (q) =>
            Math.abs(q.x - p.x) < (q.w + labelW) / 2 + 4 &&
            Math.abs(q.y - p.y) < q.hh + 10
        );

      let labelPos: { x: number; y: number } | null = null;
      let anchor: { x: number; y: number } | null = null;
      let bestScore = Infinity;
      let found = false;
      for (const t of [0.5, 0.32, 0.68, 0.16, 0.84]) {
        const base = bez(t);
        for (const o of [0, 16, -16, 32, -32, 48, -48, 64, -64, 80, -80]) {
          const p = {
            x: Math.max(labelW / 2 + 2, Math.min(W - labelW / 2 - 2, base.x + px * o)),
            y: Math.max(10, Math.min(H - 10, base.y + py * o)),
          };
          if (!collides(p)) {
            labelPos = p;
            anchor = base;
            found = true;
            break;
          }
          const score = placed.reduce((s, q) => {
            const ox = Math.max(0, (q.w + labelW) / 2 + 4 - Math.abs(q.x - p.x));
            const oy = Math.max(0, q.hh + 10 - Math.abs(q.y - p.y));
            return s + ox * oy;
          }, 0);
          if (score < bestScore) {
            bestScore = score;
            labelPos = p;
            anchor = base;
          }
        }
        if (found) break;
      }
      if (!labelPos) {
        const f = bez(0.5);
        labelPos = {
          x: Math.max(labelW / 2 + 2, Math.min(W - labelW / 2 - 2, f.x)),
          y: Math.max(10, Math.min(H - 10, f.y)),
        };
        anchor = labelPos;
      }
      const visible = found || bestScore === 0;
      if (visible) placed.push({ x: labelPos.x, y: labelPos.y, w: labelW, hh: 9 });

      return {
        edge: e,
        ax,
        ay,
        bx,
        by,
        cx,
        cy,
        labelText,
        labelW,
        labelPos,
        anchor,
        visible,
        path: `M ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`,
      };
    });
  }, [data, idx, radiusOf, clusterLabels, titles, sim]);

  const connected = useMemo(() => {
    if (hover === null) return null;
    const set = new Set<number>([hover]);
    data.edges.forEach((e) => {
      if (e.source === hover) set.add(e.target);
      if (e.target === hover) set.add(e.source);
    });
    return set;
  }, [hover, data]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-neutral-200 bg-white">
      {plans.map((pl, i) => {
        if (!pl) return null;
        const active =
          hover !== null && (pl.edge.source === hover || pl.edge.target === hover);
        const dim = hover !== null && !active;
        return (
          <path
            key={i}
            d={pl.path}
            fill="none"
            stroke={active ? "#2563eb" : dim ? "#e2e8f0" : "#94a3b8"}
            strokeWidth={active ? 2 : 1.5}
            strokeOpacity={dim ? 0.5 : 1}
            strokeDasharray={pl.edge.relation === "contrasts" ? "5 3" : undefined}
          />
        );
      })}
      {sim.map((n) => {
        const ci = clusterOf.get(n.id) ?? 0;
        const color = colorOf(ci);
        const r = radiusOf(n.id);
        const isH = hover === n.id;
        const dim = hover !== null && !isH && !connected?.has(n.id);
        const t = titles.map.get(n.id);
        return (
          <g
            key={n.id}
            className="cursor-pointer"
            onClick={() => onOpenDoc(n.id)}
            onMouseEnter={() => setHover(n.id)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{n.title}</title>
            <circle
              cx={n.x}
              cy={n.y}
              r={r}
              fill={color}
              fillOpacity={dim ? 0.25 : isH ? 0.95 : 0.75}
              stroke={isH ? "#1e293b" : color}
              strokeOpacity={dim ? 0.35 : 1}
              strokeWidth={isH ? 2.4 : 1}
            />
            <text
              x={n.x}
              y={n.y + 3.5}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight={700}
              fill="white"
              opacity={dim ? 0.25 : 1}
            >
              {n.score.toFixed(1)}
            </text>
            {t?.visible !== false && (
              <>
                {t && (Math.abs(t.dx) > 4 || Math.abs(t.dy) > 4) && (
                  <line
                    x1={n.x}
                    y1={n.y + r + 2}
                    x2={n.x + t.dx}
                    y2={n.y + r + 13 + t.dy - 5}
                    stroke="#cbd5e1"
                    strokeWidth={1}
                    opacity={dim ? 0.25 : 1}
                  />
                )}
                <text
                  x={n.x + (t?.dx ?? 0)}
                  y={n.y + r + 13 + (t?.dy ?? 0)}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill="#475569"
                  opacity={dim ? 0.25 : 1}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {t?.display ?? n.title}
                </text>
              </>
            )}
            {isH && (
              <text x={n.x} y={n.y + r + 26 + (t?.dy ?? 0)} textAnchor="middle" fontSize={9.5} fill="#94a3b8">
                点击进入精读
              </text>
            )}
          </g>
        );
      })}
      {clusterLabels.map((l) => (
        <g key={l.id}>
          <rect
            x={l.x - l.w / 2}
            y={l.y - 12}
            width={l.w}
            height={15}
            rx={7.5}
            fill="white"
            stroke={l.color}
            strokeOpacity={0.35}
          />
          <text
            x={l.x}
            y={l.y}
            textAnchor="middle"
            fontSize={12}
            fontWeight={700}
            fill={l.color}
          >
            {l.text}
          </text>
        </g>
      ))}
      {plans.map((pl, i) => {
        if (!pl || !pl.visible) return null;
        const active =
          hover !== null && (pl.edge.source === hover || pl.edge.target === hover);
        const dim = hover !== null && !active;
        const fullText =
          (RELATION_LABELS[pl.edge.relation] || pl.edge.relation) +
          (pl.edge.label ? ` · ${pl.edge.label}` : "");
        return (
          <g key={`label-${i}`} opacity={dim ? 0.35 : 1}>
            <title>{fullText}</title>
            {pl.anchor &&
              Math.hypot(pl.labelPos.x - pl.anchor.x, pl.labelPos.y - pl.anchor.y) > 8 && (
                <line
                  x1={pl.anchor.x}
                  y1={pl.anchor.y}
                  x2={pl.labelPos.x}
                  y2={pl.labelPos.y}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                />
              )}
            <rect
              x={pl.labelPos.x - pl.labelW / 2}
              y={pl.labelPos.y - 9}
              width={pl.labelW}
              height={16}
              rx={8}
              fill="white"
              stroke={active ? "#2563eb" : "#e5e7eb"}
            />
            <text
              x={pl.labelPos.x}
              y={pl.labelPos.y + 3}
              textAnchor="middle"
              fontSize={9.5}
              fill={active ? "#2563eb" : "#64748b"}
            >
              {pl.labelText}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
