import { create } from "zustand";
import * as bridge from "@/bridge";
import { savedTheme, setTheme, type ThemeChoice } from "@/lib/theme";
import type { NavUser } from "@/types";

/** The pages the sidebar leads to; #3 and #4 fill them. */
export type Page = "home" | "projects" | "graph" | "settings";

type State = {
  page: Page;
  findOpen: boolean;
  theme: ThemeChoice;
  /** Null until the bridge answers, or for good when `gh` is signed out. */
  user: NavUser | null;
  /** A Blob URL of the cached avatar; null shows the initial instead. */
  avatar: string | null;
  go: (page: Page) => void;
  setFindOpen: (open: boolean) => void;
  setTheme: (theme: ThemeChoice) => void;
  quit: () => void;
};

export const useStore = create<State>((set) => ({
  page: "home",
  findOpen: false,
  theme: savedTheme(),
  user: null,
  avatar: null,
  go: (page) => set({ page, findOpen: false }),
  setFindOpen: (findOpen) => set({ findOpen }),
  setTheme: (theme) => {
    setTheme(theme);
    set({ theme });
  },
  quit: () => void bridge.quit().catch((e) => console.error("quit:", e)),
}));

bridge.watchUser((user, avatar) => useStore.setState({ user, avatar })).catch((e) => console.error("nav user:", e));
