import { create } from "zustand";

export type DemoMode = "drafting" | "writing" | "review";

interface DemoState {
  demoActive: boolean;
  stage: number;
  expanded: boolean;
  pendingOpenDocTitle: string | null;
  pendingMode: DemoMode | null;
  enterDemo: () => void;
  exitDemo: () => void;
  setStage: (stage: number) => void;
  setExpanded: (v: boolean) => void;
  requestOpenDoc: (title: string) => void;
  consumeOpenDoc: () => string | null;
  requestMode: (mode: DemoMode) => void;
  consumeMode: () => DemoMode | null;
}

export const useDemoStore = create<DemoState>((set, get) => ({
  demoActive: false,
  stage: 1,
  expanded: true,
  pendingOpenDocTitle: null,
  pendingMode: null,
  enterDemo: () => set({ demoActive: true, stage: 1, expanded: true }),
  exitDemo: () => set({ demoActive: false, pendingOpenDocTitle: null, pendingMode: null }),
  setStage: (stage) => set({ stage }),
  setExpanded: (v) => set({ expanded: v }),
  requestOpenDoc: (title) => set({ pendingOpenDocTitle: title }),
  consumeOpenDoc: () => {
    const t = get().pendingOpenDocTitle;
    if (t) set({ pendingOpenDocTitle: null });
    return t;
  },
  requestMode: (mode) => set({ pendingMode: mode }),
  consumeMode: () => {
    const m = get().pendingMode;
    if (m) set({ pendingMode: null });
    return m;
  },
}));
