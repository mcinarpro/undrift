import { create } from "zustand";
import * as bridge from "@/bridge";
import { savedTheme, setTheme, type ThemeChoice } from "@/lib/theme";
import { TASKS, type Task } from "@/mocks/day";
import type { NavUser } from "@/types";

/** The pages the header leads to (docs/v2.md). */
export type Page = "today" | "week" | "projects" | "sessions" | "settings";

/** Today's moments: the morning plan, the day, a block in focus, the evening shut down. */
export type TodayView = "plan" | "day" | "focus" | "shutdown";

type State = {
  page: Page;
  today: TodayView;
  /** The terminal docked under Today's tasks. */
  dock: boolean;
  /** A Project page, opened from Projects; null shows the list. */
  project: string | null;
  /** Mock tasks until the bridge reads the day; checking one only changes this list. */
  tasks: Task[];
  findOpen: boolean;
  theme: ThemeChoice;
  /** Null until the bridge answers, or for good when `gh` is signed out. */
  user: NavUser | null;
  /** A Blob URL of the cached avatar; null shows the initial instead. */
  avatar: string | null;
  go: (page: Page) => void;
  setToday: (view: TodayView) => void;
  setDock: (open: boolean) => void;
  openProject: (id: string | null) => void;
  toggleTask: (id: string) => void;
  setFindOpen: (open: boolean) => void;
  setTheme: (theme: ThemeChoice) => void;
  quit: () => void;
};

export const useStore = create<State>((set) => ({
  page: "today",
  today: "day",
  dock: false,
  project: null,
  tasks: TASKS,
  findOpen: false,
  theme: savedTheme(),
  user: null,
  avatar: null,
  // A tab always opens its page's first state: Today its day, Projects its list.
  go: (page) => set({ page, findOpen: false, project: null, ...(page === "today" ? { today: "day" as const } : {}) }),
  setToday: (today) => set({ page: "today", today }),
  setDock: (dock) => set({ dock }),
  openProject: (project) => set({ page: "projects", project }),
  toggleTask: (id) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),
  setFindOpen: (findOpen) => set({ findOpen }),
  setTheme: (theme) => {
    setTheme(theme);
    set({ theme });
  },
  quit: () => void bridge.quit().catch((e) => console.error("quit:", e)),
}));

bridge.watchUser((user, avatar) => useStore.setState({ user, avatar })).catch((e) => console.error("nav user:", e));
