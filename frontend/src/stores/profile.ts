import { create } from "zustand";
import { api } from "@/lib/api";

export interface Profile {
  id: number;
  email: string;
  name: string;
  identity: string;
  discipline: string;
  sub_discipline: string;
  citation_style: string;
  language_pref: string;
}

interface ProfileStore {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  fetchProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  profile: null,
  loading: false,
  error: null,
  fetchProfile: async () => {
    set({ loading: true, error: null });
    try {
      const profile = await api<Profile>("/api/profile");
      set({ profile, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  updateProfile: async (patch) => {
    const profile = await api<Profile>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    set({ profile });
  },
}));
