"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { SelectionInfo, HighlightBox } from "./PdfViewer";

interface ChunkItem {
  chunk_key: string;
  content: string;
  section_title: string | null;
  typed_label: string;
}

interface ContentResp {
  kind: string;
  title: string | null;
  sections: { title: string; paragraphs: string[] }[];
}

function renderWithHighlights(content: string, quotes: string[]) {
  const normalized = (s: string) => s.replace(/\s+/g, "");
  let result: (string | { mark: string })[] = [content];
  for (const q of quotes) {
    if (!q) continue;
    const nq = normalized(q);
    if (nq.length < 4) continue;
    const next: (string | { mark: string })[] = [];
    for (const part of result) {
      if (typeof part !== "string") {
        next.push(part);
        continue;
      }
      const np = normalized(part);
      const idx = np.indexOf(nq);
      if (idx === -1) {
        next.push(part);
        continue;
      }
      let realStart = 0;
      let count = 0;
      for (let i = 0; i < part.length; i++) {
        if (!/\s/.test(part[i])) {
          if (count === idx) {
            realStart = i;
            break;
          }
          count++;
        }
      }
      let realEnd = part.length;
      count = 0;
      for (let i = 0; i < part.length; i++) {
        if (!/\s/.test(part[i])) {
          count++;
          if (count === idx + nq.length) {
            realEnd = i + 1;
            break;
          }
        }
      }
      if (realStart > 0) next.push(part.slice(0, realStart));
      next.push({ mark: part.slice(realStart, realEnd) });
      if (realEnd < part.length) next.push(part.slice(realEnd));
    }
    result = next;
  }
  return result;
}

export default function DocTextView({
  docId,
  highlights,
  onSelect,
}: {
  docId: number;
  highlights: HighlightBox[];
  onSelect: (sel: SelectionInfo | null) => void;
}) {
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [content, setContent] = useState<ContentResp | null>(null);

  useEffect(() => {
    api<ChunkItem[]>(`/api/documents/${docId}/chunks`)
      .then(setChunks)
      .catch(() => {});
    api<ContentResp>(`/api/documents/${docId}/content`)
      .then(setContent)
      .catch(() => {});
  }, [docId]);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      onSelect(null);
      return;
    }
    const text = selection.toString().trim();
    if (text.length < 2) {
      onSelect(null);
      return;
    }
    let node: Node | null = selection.anchorNode;
    let chunkKey = "";
    while (node) {
      if (node instanceof HTMLElement && node.dataset.chunkkey) {
        chunkKey = node.dataset.chunkkey;
        break;
      }
      node = node.parentNode;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    onSelect({
      text: text.slice(0, 1500),
      page: 0,
      x: rect.left + rect.width / 2,
      y: rect.top,
      chunkKey,
    });
  };

  const grouped = useMemo(() => {
    const gs: { section: string; items: ChunkItem[] }[] = [];
    for (const c of chunks) {
      const sec = c.section_title || "（未分节）";
      const last = gs[gs.length - 1];
      if (last && last.section === sec) last.items.push(c);
      else gs.push({ section: sec, items: [c] });
    }
    return gs;
  }, [chunks]);

  const annotationQuotes = useMemo(
    () =>
      highlights
        .map((h) => h.quote || "")
        .filter((t) => t.length >= 4),
    [highlights]
  );

  if (!content && chunks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-200 text-sm text-neutral-400">
        文档加载中…
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-neutral-200" onMouseUp={handleMouseUp}>
      <div className="mx-auto my-4 max-w-3xl rounded-lg bg-white px-10 py-8 shadow-md">
        {content?.title && (
          <h1 className="mb-6 text-xl font-bold text-neutral-900">{content.title}</h1>
        )}
        <div className="mb-4 rounded bg-neutral-50 px-3 py-2 text-[11px] text-neutral-400">
          文档结构视图（Word/Markdown 解析）· 直接划选文字即可打标、划线或备注
        </div>
        {grouped.map((g, i) => (
          <div key={i} className="mb-6">
            {g.section !== "（未分节）" && (
              <h2 className="mb-3 border-b border-neutral-100 pb-1.5 text-base font-bold text-neutral-800">
                {g.section}
              </h2>
            )}
            {g.items.map((c) => {
              const rendered = renderWithHighlights(c.content, annotationQuotes);
              return (
                <div
                  key={c.chunk_key}
                  data-chunkkey={c.chunk_key}
                  className="mb-3 text-sm leading-relaxed text-neutral-700"
                >
                  {rendered.map((part, pi) =>
                    typeof part === "string" ? (
                      <span key={pi}>{part}</span>
                    ) : (
                      <mark
                        key={pi}
                        className="rounded-sm bg-yellow-200/80 px-0.5"
                      >
                        {part.mark}
                      </mark>
                    )
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
