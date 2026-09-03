"use client";

export interface MindChild {
  label: string;
  detail: string;
  related_doc_ids: number[];
  is_gap: boolean;
}

export interface MindBranch {
  label: string;
  children: MindChild[];
}

export interface MindGraph {
  root: string;
  branches: MindBranch[];
}

export interface MindSelection {
  label: string;
  detail?: string;
  related_doc_ids?: number[];
  is_gap?: boolean;
  level: "root" | "branch" | "leaf";
}

const ROW_H = 62;
const X_ROOT = 20;
const X_BRANCH = 250;
const X_LEAF = 520;
const NODE_W = 200;

interface Placed {
  label: string;
  x: number;
  y: number;
  w: number;
  gap: boolean;
  level: "root" | "branch" | "leaf";
  detail?: string;
  related_doc_ids?: number[];
  parentX?: number;
  parentY?: number;
}

export default function MindMap({
  graph,
  onSelect,
  selected,
}: {
  graph: MindGraph;
  onSelect: (sel: MindSelection) => void;
  selected: MindSelection | null;
}) {
  const placed: Placed[] = [];
  let cursorY = 40;

  for (const b of graph.branches) {
    const childYs: number[] = [];
    for (const c of b.children || []) {
      childYs.push(cursorY);
      cursorY += ROW_H;
    }
    const branchY =
      childYs.length > 0
        ? childYs.reduce((a, v) => a + v, 0) / childYs.length
        : cursorY;
    if (childYs.length === 0) cursorY += ROW_H;

    placed.push({
      label: b.label,
      x: X_BRANCH,
      y: branchY,
      w: 190,
      gap: false,
      level: "branch",
      parentX: X_ROOT + 170,
      parentY: -1,
    });
    (b.children || []).forEach((c, i) => {
      placed.push({
        label: c.label,
        x: X_LEAF,
        y: childYs[i],
        w: 230,
        gap: c.is_gap,
        level: "leaf",
        detail: c.detail,
        related_doc_ids: c.related_doc_ids,
        parentX: X_BRANCH + 190,
        parentY: branchY,
      });
    });
  }

  const totalH = cursorY + 30;
  const rootY = totalH / 2 - 20;
  placed.forEach(
    (p) => p.level !== "root" && p.level === "branch" && (p.parentY = rootY + 22)
  );
  placed.unshift({
    label: graph.root,
    x: X_ROOT,
    y: rootY,
    w: 170,
    gap: false,
    level: "root",
  });

  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

  const colorOf = (p: Placed) => {
    if (p.level === "root") return { fill: "#1e3a8a", stroke: "#1e3a8a", text: "#ffffff" };
    if (p.gap) return { fill: "#fffbeb", stroke: "#f59e0b", text: "#92400e" };
    if (p.level === "branch") return { fill: "#eff6ff", stroke: "#3b82f6", text: "#1e40af" };
    return { fill: "#ffffff", stroke: "#d1d5db", text: "#374151" };
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <svg width={X_LEAF + 260} height={Math.max(totalH, 200)} className="block">
        {placed.map((p, i) =>
          p.parentX !== undefined && p.parentY !== undefined && p.parentY >= 0 ? (
            <path
              key={`e${i}`}
              d={`M ${p.parentX} ${p.parentY} C ${p.parentX + 40} ${p.parentY}, ${p.x - 40} ${p.y + 16}, ${p.x} ${p.y + 16}`}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth={1.5}
            />
          ) : null
        )}
        {placed.map((p, i) => {
          const c = colorOf(p);
          const isSelected = selected && selected.label === p.label && selected.level === p.level;
          return (
            <g
              key={i}
              className="cursor-pointer"
              onClick={() =>
                onSelect({
                  label: p.label,
                  detail: p.detail,
                  related_doc_ids: p.related_doc_ids,
                  is_gap: p.gap,
                  level: p.level,
                })
              }
            >
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height={34}
                rx={p.level === "root" ? 17 : 8}
                fill={c.fill}
                stroke={isSelected ? "#2563eb" : c.stroke}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />
              <text
                x={p.x + 12}
                y={p.y + 21}
                fontSize={p.level === "root" ? 13 : 12}
                fontWeight={p.level === "root" || p.level === "branch" ? 700 : 500}
                fill={c.text}
              >
                {truncate(p.label, p.w / 12)}
              </text>
              {p.gap && (
                <g>
                  <rect
                    x={p.x + p.w - 58}
                    y={p.y - 9}
                    width={56}
                    height={18}
                    rx={9}
                    fill="#f59e0b"
                  />
                  <text x={p.x + p.w - 52} y={p.y + 4} fontSize={10} fill="white" fontWeight={600}>
                    研究缺口
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
