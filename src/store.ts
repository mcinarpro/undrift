import { create } from "zustand";
import * as bridge from "@/bridge";
import { failed, toasts } from "@/components/toast";
import { SORTS, type AreaFilter, type GroupFilter, type Sort } from "@/lib/projects";
import { savedTheme, setTheme, type ThemeChoice } from "@/lib/theme";
import type { NavUser, Project, Read } from "@/types";

/** The pages the header leads to. */
export type Page = "home" | "projects" | "graph" | "settings";

/** How the Projects page lays its Projects out. */
export type View = "grid" | "list";

// The sort and the view are a way of reading the page, so they survive a restart as the theme
// does; the filters answer a passing question, so they last only while the window runs.
function saved<T extends string>(key: string, values: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return values.find((x) => x === v) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable; the choice still holds for this run.
  }
}

type State = {
  page: Page;
  /** The path of the Project whose page is open; a Project page belongs to Projects, so it is
   * only shown while `page` is `projects`. */
  project: string | null;
  /** Kept here rather than in the page, so coming back from a Project page keeps the filters. */
  areaFilter: AreaFilter;
  groupFilter: GroupFilter;
  sort: Sort;
  view: View;
  findOpen: boolean;
  theme: ThemeChoice;
  /** Null until the cache or `gh` answers, and while `gh` has never seen an account: a `gh` that
   * fails later keeps the cached one. */
  user: NavUser | null;
  /** Whether `user` is an answer – from the cache or from `gh` – so a null one means signed out. */
  userKnown: boolean;
  /** A Blob URL of the cached avatar; null shows the initial instead. */
  avatar: string | null;
  /** Null until the bridge built its first list, so Home never flashes its Empty State. */
  projects: Project[] | null;
  /** Which passes `projects` holds; a page waits for those it reads before saying there is nothing. */
  read: Read;
  go: (page: Page) => void;
  openProject: (path: string) => void;
  setAreaFilter: (filter: AreaFilter) => void;
  /** The rail's choices, in either section or both; the page stays where it is. */
  setFilters: (filters: { area?: AreaFilter; group?: GroupFilter }) => void;
  setSort: (sort: Sort) => void;
  setView: (view: View) => void;
  setFindOpen: (open: boolean) => void;
  setTheme: (theme: ThemeChoice) => void;
  quit: () => void;
  resume: (path: string, sessionId: string) => void;
  newSession: (path: string) => void;
  start: (path: string, issue: number) => void;
  letGo: (path: string, name: string) => void;
};

export const useStore = create<State>((set) => ({
  page: "home",
  project: null,
  areaFilter: { kind: "all" },
  groupFilter: { kind: "all" },
  sort: saved("projects.sort", SORTS.map((s) => s.value), "drift"),
  view: saved<View>("projects.view", ["grid", "list"], "grid"),
  findOpen: false,
  theme: savedTheme(),
  user: null,
  userKnown: false,
  avatar: null,
  projects: null,
  read: { sessions: false, git: false, github: false },
  go: (page) => set({ page, project: null, findOpen: false }),
  openProject: (path) => set({ page: "projects", project: path, findOpen: false }),
  // The breadcrumb's Area leads back to the Projects page filtered by it. The group filter goes
  // back to All, so the Area shows whole and the Project just left is among its cards.
  setAreaFilter: (areaFilter) => set({ page: "projects", project: null, areaFilter, groupFilter: { kind: "all" } }),
  setFilters: ({ area, group }) => set((s) => ({ areaFilter: area ?? s.areaFilter, groupFilter: group ?? s.groupFilter })),
  setSort: (sort) => {
    save("projects.sort", sort);
    set({ sort });
  },
  setView: (view) => {
    save("projects.view", view);
    set({ view });
  },
  setFindOpen: (findOpen) => set({ findOpen }),
  setTheme: (theme) => {
    setTheme(theme);
    set({ theme });
  },
  quit: () => void bridge.quit().catch((e) => console.error("quit:", e)),
  resume: (path, sessionId) => void bridge.resume(path, sessionId).catch((e) => failed("resume the Session", e)),
  newSession: (path) => void bridge.newSession(path).catch((e) => failed("open a new Session", e)),
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

// A Project that left the list – hidden, or its folder gone – closes its page for good, so it
// cannot reopen by surprise if it comes back on a later refresh.
bridge.watchProjects(({ projects, read }) =>
  useStore.setState((s) => ({ projects, read, project: s.project && projects.some((p) => p.path === s.project) ? s.project : null })),
).catch((e) => console.error("projects:", e));
// `gh` that cannot answer – signed out or offline – keeps the cached account, as before it was asked.
bridge.watchUser((user, avatar) => useStore.setState(user ? { user, avatar, userKnown: true } : { userKnown: true })).catch((e) => console.error("nav user:", e));
