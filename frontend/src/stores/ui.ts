import { create } from "zustand";

interface UIState {
  settingsOpen: boolean;
  newProjectOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  openNewProject: () => void;
  closeNewProject: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  settingsOpen: false,
  newProjectOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openNewProject: () => set({ newProjectOpen: true }),
  closeNewProject: () => set({ newProjectOpen: false }),
}));
