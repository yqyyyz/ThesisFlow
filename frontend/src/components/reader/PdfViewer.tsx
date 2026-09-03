"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SelectionRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SelectionInfo {
  text: string;
  page: number;
  x: number;
  y: number;
  chunkKey?: string;
  rects?: SelectionRect[];
}

export interface HighlightBox {
  id: number;
  page: number;
  bbox: { page: number; x0: number; y0: number; x1: number; y1: number };
  rects?: SelectionRect[];
  quote?: string;
  color: string;
  title: string;
}

interface PdfViewerProps {
  url: string;
  highlights: HighlightBox[];
  onSelect: (sel: SelectionInfo | null) => void;
  onHighlightClick?: (id: number) => void;
}

const SCALE = 1.3;
const DEBUG_TEXTLAYER =
  typeof window !== "undefined" && window.location.search.includes("debugtl");

export default function PdfViewer({ url, highlights, onSelect }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pdfRef = useRef<{ getPage: (n: number) => Promise<unknown> } | null>(null);
  const renderedPages = useRef<Set<number>>(new Set());
  const highlightsRef = useRef<HighlightBox[]>(highlights);
  highlightsRef.current = highlights;

  const drawHighlights = useCallback((holder: HTMLElement, pageNum: number) => {
    let layer = holder.querySelector(".tf-highlights") as HTMLElement | null;
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "tf-highlights";
      layer.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:2;";
      holder.appendChild(layer);
    }
    layer.innerHTML = "";
    const boxes = highlightsRef.current.filter((h) => h.page === pageNum);
    for (const h of boxes) {
      const rects =
        h.rects && h.rects.length > 0
          ? h.rects
          : [{ x0: h.bbox.x0, y0: h.bbox.y0, x1: h.bbox.x1, y1: h.bbox.y1 }];
      for (const r of rects) {
        const div = document.createElement("div");
        div.style.cssText = `position:absolute;border-radius:2px;opacity:0.32;background:${h.color};border:1px solid ${h.color};`;
        div.style.left = `${r.x0 * SCALE}px`;
        div.style.top = `${r.y0 * SCALE}px`;
        div.style.width = `${Math.max((r.x1 - r.x0) * SCALE, 2)}px`;
        div.style.height = `${Math.max((r.y1 - r.y0) * SCALE, 2)}px`;
        div.title = h.title;
        layer.appendChild(div);
      }
    }
  }, []);

  const renderPage = useCallback(
    async (holder: HTMLElement, pageNum: number) => {
      if (renderedPages.current.has(pageNum)) {
        drawHighlights(holder, pageNum);
        return;
      }
      const pdf = pdfRef.current;
      if (!pdf) return;
      try {
        const page = (await pdf.getPage(pageNum)) as {
          getViewport: (o: { scale: number }) => {
            width: number;
            height: number;
            transform: number[];
          };
          render: (o: {
            canvas: HTMLCanvasElement;
            viewport: { width: number; height: number };
            transform?: number[];
          }) => { promise: Promise<void> };
          getTextContent: () => Promise<{ items: unknown[] }>;
        };
        const viewport = page.getViewport({ scale: SCALE });
        holder.style.width = `${Math.floor(viewport.width)}px`;
        holder.style.height = `${Math.floor(viewport.height)}px`;

        const canvas = holder.querySelector("canvas") as HTMLCanvasElement;
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        await page
          .render({
            canvas,
            viewport,
            transform:
              outputScale !== 1
                ? [outputScale, 0, 0, outputScale, 0, 0]
                : [1, 0, 0, 1, 0, 0],
          })
          .promise;

        try {
          const pdfjsLib = await import("pdfjs-dist");
          const content = await page.getTextContent();
          let layer = holder.querySelector(".tf-text-layer") as HTMLElement | null;
          if (layer) layer.remove();
          layer = document.createElement("div");
          layer.className = "tf-text-layer";
          layer.style.cssText = `position:absolute;left:0;top:0;width:${viewport.width}px;height:${viewport.height}px;overflow:hidden;z-index:1;`;
          let spanCount = 0;
          for (const rawItem of content.items) {
            const item = rawItem as {
              str?: string;
              transform?: number[];
              width?: number;
              height?: number;
            };
            if (!item.str || !item.transform) continue;
            if (!item.str.trim() && (item.width || 0) < 2) continue;
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const fontHeight = Math.hypot(tx[2], tx[3]) || 12;
            const span = document.createElement("span");
            span.textContent = item.str;
            span.style.position = "absolute";
            span.style.left = `${tx[4]}px`;
            span.style.top = `${tx[5] - fontHeight * 0.85}px`;
            span.style.fontSize = `${fontHeight}px`;
            span.style.whiteSpace = "pre";
            span.style.color = "transparent";
            span.style.cursor = "text";
            span.style.transformOrigin = "0% 0%";
            if (DEBUG_TEXTLAYER) {
              span.style.color = "rgba(255,0,0,0.4)";
              span.style.outline = "1px solid rgba(255,0,0,0.25)";
            }
            layer.appendChild(span);
            spanCount += 1;
          }
          holder.appendChild(layer);
          console.info(
            `[PdfViewer] p${pageNum} 文本层：${spanCount} spans`
          );
          if (spanCount === 0) {
            console.warn(`[PdfViewer] p${pageNum} 无文本层（可能是扫描版）`);
          }
        } catch (tlErr) {
          console.error(`[PdfViewer] p${pageNum} 文本层渲染失败:`, tlErr);
        }

        renderedPages.current.add(pageNum);
        drawHighlights(holder, pageNum);
      } catch (err) {
        console.error(`[PdfViewer] p${pageNum} 渲染失败:`, err);
        renderedPages.current.delete(pageNum);
      }
    },
    [drawHighlights]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    container
      .querySelectorAll(".tf-page")
      .forEach((el) => el.remove());
    renderedPages.current.clear();

    let observer: IntersectionObserver | null = null;
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        if (cancelled) return;
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjsLib.getDocument({ url }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        for (let n = 1; n <= pdf.numPages; n++) {
          const holder = document.createElement("div");
          holder.className = "tf-page relative mx-auto my-3 shadow-md";
          holder.dataset.pageno = String(n);
          holder.style.background = "white";
          holder.style.minHeight = "400px";
          const canvas = document.createElement("canvas");
          canvas.style.display = "block";
          holder.appendChild(canvas);
          const pageLabel = document.createElement("div");
          pageLabel.style.cssText =
            "position:absolute;bottom:4px;right:8px;font-size:10px;color:#9ca3af;user-select:none;";
          pageLabel.textContent = String(n);
          holder.appendChild(pageLabel);
          container.appendChild(holder);
          try {
            const page = await pdf.getPage(n);
            const vp = page.getViewport({ scale: SCALE });
            holder.style.height = `${Math.floor(vp.height)}px`;
            holder.style.width = `${Math.floor(vp.width)}px`;
          } catch {
            /* 占位，懒渲染时重试 */
          }
        }
        setPageCount(pdf.numPages);
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                const pageNum = Number((entry.target as HTMLElement).dataset.pageno);
                renderPage(entry.target as HTMLElement, pageNum);
              }
            }
          },
          { root: container, rootMargin: "900px" }
        );
        container
          .querySelectorAll(".tf-page")
          .forEach((el) => observer!.observe(el));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [url, renderPage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll(".tf-page").forEach((el) => {
      const pageNum = Number((el as HTMLElement).dataset.pageno);
      drawHighlights(el as HTMLElement, pageNum);
    });
  }, [highlights, pageCount, drawHighlights]);

  const handleMouseUp = useCallback(() => {
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
    let pageNum = 0;
    let holder: HTMLElement | null = null;
    while (node) {
      if (node instanceof HTMLElement && node.dataset.pageno) {
        pageNum = Number(node.dataset.pageno);
        holder = node;
        break;
      }
      node = node.parentNode;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    let rects: SelectionRect[] | undefined;
    if (holder) {
      const h = holder.getBoundingClientRect();
      rects = Array.from(range.getClientRects())
        .filter((r) => r.width > 1.5 && r.height > 1.5)
        .map((r) => ({
          x0: (r.left - h.left) / SCALE,
          y0: (r.top - h.top) / SCALE,
          x1: (r.right - h.left) / SCALE,
          y1: (r.bottom - h.top) / SCALE,
        }))
        .filter(
          (r) => r.x1 > 0 && r.y1 > 0 && r.x0 < h.width / SCALE && r.y0 < h.height / SCALE
        );
    }

    onSelect({
      text: text.slice(0, 1500),
      page: pageNum,
      x: rect.left + rect.width / 2,
      y: rect.top,
      rects,
    });
  }, [onSelect]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        PDF 加载失败：{error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto bg-neutral-200"
      onMouseUp={handleMouseUp}
    >
      <style>{`
        .tf-text-layer ::selection {
          background: rgba(37, 99, 235, 0.35);
        }
      `}</style>
      {pageCount === 0 && !error && (
        <div className="flex h-40 items-center justify-center text-sm text-neutral-400">
          PDF 加载中…
        </div>
      )}
    </div>
  );
}
