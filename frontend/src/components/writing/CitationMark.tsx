"use client";

import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useParams, useRouter } from "next/navigation";
import { useCitationMetaStore } from "@/stores/citationMeta";

function CitationView({ node }: NodeViewProps) {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const meta = useCitationMetaStore((s) => s.byDoc[Number(node.attrs.docId)]);
  const label = meta?.label || null;
  const text = label ? `（${label}）` : `[${node.attrs.docId}:${node.attrs.chunkSeq}]`;
  return (
    <sup
      data-citation={node.attrs.chunkKey}
      data-status={node.attrs.status}
      title={meta?.title ? `点击查看《${meta.title}》对应原文` : "点击跳转到文献精读页定位原文"}
      className="citation-mark"
      onClick={() => {
        const pid = params?.projectId || "1";
        router.push(
          `/projects/${pid}/documents?doc=${encodeURIComponent(node.attrs.docId)}&chunk=${encodeURIComponent(node.attrs.chunkKey)}`
        );
      }}
    >
      {text}
    </sup>
  );
}

export const CitationMark = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      chunkKey: { default: "" },
      docId: { default: 0 },
      chunkSeq: { default: 0 },
      status: { default: "normal" },
    };
  },

  parseHTML() {
    return [{ tag: "sup[data-citation]" }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CitationView);
  },
});

export default CitationMark;
