"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CitationMark from "./CitationMark";

export interface ContinueHandlers {
  onToken: (text: string) => void;
  onCitation: (chunkKey: string) => void;
  onVerify: (data: unknown) => void;
  onDone: (data: { length: number }) => void;
}

interface EditorPanelProps {
  initialContent: Record<string, unknown> | null;
  onUpdate: (json: Record<string, unknown>) => void;
  onSelection: (text: string | null) => void;
  editorRef: React.MutableRefObject<Editor | null>;
  onSlashContinue: () => void;
}

export default function EditorPanel({
  initialContent,
  onUpdate,
  onSelection,
  editorRef,
  onSlashContinue,
}: EditorPanelProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "开始撰写，或使用 /续写 让 AI 基于大纲与文献生成正文…",
      }),
      CitationMark,
    ],
    content:
      initialContent && Object.keys(initialContent).length > 0
        ? (initialContent as never)
        : { type: "doc", content: [] },
    onUpdate: ({ editor: e }) => {
      onUpdate(e.getJSON() as Record<string, unknown>);
      const sel = e.state.selection;
      if (!sel.empty) {
        onSelection(e.state.doc.textBetween(sel.from, sel.to, " ") || null);
      } else {
        onSelection(null);
      }
    },
    immediatelyRender: false,
  });

  if (editor) editorRef.current = editor;

  return (
    <div className="h-full overflow-y-auto">
      <style>{`
        .citation-mark {
          cursor: pointer;
          color: #2563eb;
          font-size: 0.75em;
          font-weight: 600;
          padding: 0 1px;
        }
        .citation-mark[data-status="weak"] { color: #d97706; background: #fef3c7; border-radius: 2px; }
        .citation-mark[data-status="invalid"] { color: #dc2626; background: #fee2e2; border-radius: 2px; text-decoration: line-through; }
        .ProseMirror { min-height: 60vh; outline: none; padding: 2rem 2.5rem; font-size: 15px; line-height: 1.9; }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left; color: #9ca3af; pointer-events: none; height: 0;
        }
        .ProseMirror h1 { font-size: 1.5rem; font-weight: 700; margin: 1.2rem 0 0.6rem; }
        .ProseMirror h2 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.5rem; }
        .ProseMirror blockquote { border-left: 3px solid #d1d5db; padding-left: 1rem; color: #6b7280; }
      `}</style>
      <div
        onKeyDownCapture={(e) => {
          if (e.key === "Enter" && editor) {
            const { from } = editor.state.selection;
            const lineText = editor.state.doc.textBetween(
              Math.max(0, from - 20),
              from,
              " "
            );
            if (lineText.trimEnd().endsWith("/续写")) {
              e.preventDefault();
              editor.commands.deleteRange({ from: from - 3, to: from });
              onSlashContinue();
            }
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
