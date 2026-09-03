import { create } from "zustand";

export interface DocCitationMeta {
  label: string | null;
  title: string | null;
}

interface CitationMetaState {
  byDoc: Record<number, DocCitationMeta>;
  setDocs: (
    docs: {
      id: number;
      authors?: string[] | null;
      year?: number | null;
      title?: string | null;
    }[]
  ) => void;
  labelFor: (docId: number) => string | null;
}

const hasCJK = (s: string) => /[\u4e00-\u9fff]/.test(s);

const surnameOf = (full: string) => {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || full;
};

function formatLabel(authors: string[] | null, year: number | null): string | null {
  const list = (authors || []).map((a) => String(a).trim()).filter(Boolean);
  if (list.length === 0 && year == null) return null;
  let name = "";
  if (list.length >= 3) {
    name = surnameOf(list[0]) + (hasCJK(list[0]) ? "等" : " et al.");
  } else if (list.length === 2) {
    name = surnameOf(list[0]) + (hasCJK(list[0]) ? "、" + surnameOf(list[1]) : " & " + surnameOf(list[1]));
  } else if (list.length === 1) {
    name = surnameOf(list[0]);
  }
  return year ? `${name}, ${year}` : name;
}

export const useCitationMetaStore = create<CitationMetaState>((set, get) => ({
  byDoc: {},
  setDocs: (docs) => {
    const next: Record<number, DocCitationMeta> = { ...get().byDoc };
    for (const d of docs) {
      if (!d || d.id == null) continue;
      next[d.id] = {
        label: formatLabel(d.authors ?? null, d.year ?? null),
        title: d.title ?? null,
      };
    }
    set({ byDoc: next });
  },
  labelFor: (docId: number) => get().byDoc[docId]?.label ?? null,
}));

export const citationLabelPattern = /\[(\d+):(\d+)\]/g;

export function renderCitationLabels(
  text: string,
  byDoc: Record<number, DocCitationMeta>
): string {
  return text.replace(citationLabelPattern, (_m, docId) => {
    const label = byDoc[Number(docId)]?.label;
    return label ? `（${label}）` : _m;
  });
}
