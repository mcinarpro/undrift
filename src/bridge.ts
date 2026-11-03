import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { NavUser, NavUserNow, Snapshot } from "@/types";

// The window's only door to the Rust bridge (src-tauri/src/lib.rs commands, bridge/mod.rs events).
// In a plain browser there is no bridge: a sample user stands in and the window actions do nothing.

export const inTauri = "__TAURI_INTERNALS__" in window;

const SAMPLE_USER: NavUser = { login: "mcinarpro", name: "Mehmet Cinar", profileUrl: "https://github.com/mcinarpro" };

// A development switch to watch the Skeletons, which a fast bridge hides: `VITE_SLOW_BRIDGE=5000
// bun tauri dev` holds back every list and the NavUser that many milliseconds. A build ignores it.
const SLOW = import.meta.env.DEV ? Number(import.meta.env.VITE_SLOW_BRIDGE ?? 0) : 0;
const later =
  <A extends unknown[]>(f: (...args: A) => void) =>
  (...args: A) =>
    SLOW > 0 ? void setTimeout(() => f(...args), SLOW) : f(...args);

let avatarUrl: string | null = null;

/** The cached avatar as a Blob URL, null when the bridge has none yet. The previous URL is freed. */
async function avatar(): Promise<string | null> {
  const bytes = await invoke<ArrayBuffer>("nav_user_avatar");
  if (avatarUrl) URL.revokeObjectURL(avatarUrl);
  avatarUrl = bytes.byteLength > 0 ? URL.createObjectURL(new Blob([bytes])) : null;
  return avatarUrl;
}

/** Calls `onUser` with the cached NavUser, then again once `gh api user` answered – with null when
 * it could not say who is signed in. */
export async function watchUser(onUser: (user: NavUser | null, avatar: string | null) => void): Promise<void> {
  onUser = later(onUser);
  if (!inTauri) {
    onUser(SAMPLE_USER, null);
    return;
  }
  await listen<NavUser | null>("user", async (e) => onUser(e.payload, e.payload && (await avatar())));
  const now = await invoke<NavUserNow>("nav_user");
  if (now.user || now.answered) onUser(now.user, now.user && (await avatar()));
}

/** Calls `onSnapshot` with the bridge's list once it has one, then on every change. In a plain
 * browser the list is empty and read, so Home shows its Empty State. */
export async function watchProjects(onSnapshot: (snapshot: Snapshot) => void): Promise<void> {
  onSnapshot = later(onSnapshot);
  if (!inTauri) {
    onSnapshot({ projects: [], read: { sessions: true, git: true, github: true } });
    return;
  }
  await listen<Snapshot>("projects", (e) => onSnapshot(e.payload));
  const now = await invoke<Snapshot | null>("projects_now");
  if (now) onSnapshot(now);
}

// The bridge checks the Project, Session and Issue against its own list before opening anything.
export const resume = (path: string, id: string) => (inTauri ? invoke<void>("resume", { path, id }) : Promise.resolve());
export const newSession = (path: string) => (inTauri ? invoke<void>("new_session", { path }) : Promise.resolve());
export const start = (path: string, number: number) => (inTauri ? invoke<void>("start", { path, number }) : Promise.resolve());
export const letGo = (path: string) => (inTauri ? invoke<void>("let_go", { path }) : Promise.resolve());
export const undoLetGo = (path: string) => (inTauri ? invoke<void>("undo_let_go", { path }) : Promise.resolve());
/** Puts the Project in Focus, or takes it out; the bridge refuses a fourth. */
export const setFocus = (path: string, on: boolean) => (inTauri ? invoke<void>("set_focus", { path, on }) : Promise.resolve());

export const quit = () => (inTauri ? invoke<void>("quit") : Promise.resolve());

/** The system browser, not a webview window. */
export const openExternal = (url: string) => (inTauri ? openUrl(url) : Promise.resolve(void window.open(url, "_blank")));

export const minimizeWindow = () => getCurrentWindow().minimize();
export const toggleMaximizeWindow = () => getCurrentWindow().toggleMaximize();
/** The bridge turns a close into a hide, so the tray keeps watching. */
export const closeWindow = () => getCurrentWindow().close();
