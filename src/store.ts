import { create } from "zustand";
import * as bridge from "@/bridge";
import { failed, toasts } from "@/components/toast";
import { savedTheme, setTheme, type ThemeChoice } from "@/lib/theme";
import type { NavUser, Project } from "@/types";

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
  /** Null until the bridge built its first list, so Home never flashes its Empty State. */
  projects: Project[] | null;
  go: (page: Page) => void;
  setFindOpen: (open: boolean) => void;
  setTheme: (theme: ThemeChoice) => void;
  quit: () => void;
  resume: (path: string, sessionId: string) => void;
  start: (path: string, issue: number) => void;
  letGo: (path: string, name: string) => void;
};

export const useStore = create<State>((set) => ({
  page: "home",
  findOpen: false,
  theme: savedTheme(),
  user: null,
  avatar: null,
  projects: null,
  go: (page) => set({ page, findOpen: false }),
  setFindOpen: (findOpen) => set({ findOpen }),
  setTheme: (theme) => {
    setTheme(theme);
    set({ theme });
  },
  quit: () => void bridge.quit().catch((e) => console.error("quit:", e)),
  resume: (path, sessionId) => void bridge.resume(path, sessionId).catch((e) => failed("resume the Session", e)),
  start: (path, issue) => void bridge.start(path, issue).catch((e) => failed("start the Issue", e)),
  // The Loose End leaves Home with the list the bridge sends back. Let Go takes one click, so the
  // toast says what it did and offers Undo for 5 s (DESIGN.md § Components, Toast).
  letGo: (path, name) =>
    void bridge
      .letGo(path)
      .then(() =>
        toasts.add({
          title: `Let go of ${name} until its next Activity.`,
          timeout: 5000,
          actionProps: {
            children: "Undo",
            onClick: () => void bridge.undoLetGo(path).catch((e) => failed(`bring ${name} back`, e)),
          },
        }),
      )
      .catch((e) => failed("let go of the Loose End", e)),
}));

bridge.watchProjects((projects) => useStore.setState({ projects })).catch((e) => console.error("projects:", e));
bridge.watchUser((user, avatar) => useStore.setState({ user, avatar })).catch((e) => console.error("nav user:", e));
