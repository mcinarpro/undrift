import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { NavUser, Project } from "@/types";

// The window's only door to the Rust bridge (src-tauri/src/lib.rs commands, bridge/mod.rs events).
// In a plain browser there is no bridge: a sample user stands in and the window actions do nothing.

export const inTauri = "__TAURI_INTERNALS__" in window;

const SAMPLE_USER: NavUser = { login: "mcinarpro", name: "Mehmet Cinar", profileUrl: "https://github.com/mcinarpro" };

let avatarUrl: string | null = null;

/** The cached avatar as a Blob URL, null when the bridge has none yet. The previous URL is freed. */
async function avatar(): Promise<string | null> {
  const bytes = await invoke<ArrayBuffer>("nav_user_avatar");
  if (avatarUrl) URL.revokeObjectURL(avatarUrl);
  avatarUrl = bytes.byteLength > 0 ? URL.createObjectURL(new Blob([bytes])) : null;
  return avatarUrl;
}

/** Calls `onUser` with the cached NavUser, then again once `gh api user` answered. */
export async function watchUser(onUser: (user: NavUser, avatar: string | null) => void): Promise<void> {
  if (!inTauri) {
    onUser(SAMPLE_USER, null);
    return;
  }
  await listen<NavUser>("user", async (e) => onUser(e.payload, await avatar()));
  const cached = await invoke<NavUser | null>("nav_user");
  if (cached) onUser(cached, await avatar());
}

/** Calls `onProjects` with the bridge's list once it has one, then on every change. In a plain
 * browser the list is empty, so Home shows its Empty State. */
export async function watchProjects(onProjects: (projects: Project[]) => void): Promise<void> {
  if (!inTauri) {
    onProjects([]);
    return;
  }
  await listen<Project[]>("projects", (e) => onProjects(e.payload));
  const now = await invoke<Project[] | null>("projects_now");
  if (now) onProjects(now);
}

// The bridge checks the Project, Session and Issue against its own list before opening anything.
export const resume = (path: string, id: string) => (inTauri ? invoke<void>("resume", { path, id }) : Promise.resolve());
export const newSession = (path: string) => (inTauri ? invoke<void>("new_session", { path }) : Promise.resolve());
export const start = (path: string, number: number) => (inTauri ? invoke<void>("start", { path, number }) : Promise.resolve());
export const letGo = (path: string) => (inTauri ? invoke<void>("let_go", { path }) : Promise.resolve());
export const undoLetGo = (path: string) => (inTauri ? invoke<void>("undo_let_go", { path }) : Promise.resolve());

export const quit = () => (inTauri ? invoke<void>("quit") : Promise.resolve());

/** The system browser, not a webview window. */
export const openExternal = (url: string) => (inTauri ? openUrl(url) : Promise.resolve(void window.open(url, "_blank")));

export const minimizeWindow = () => getCurrentWindow().minimize();
export const toggleMaximizeWindow = () => getCurrentWindow().toggleMaximize();
/** The bridge turns a close into a hide, so the tray keeps watching. */
export const closeWindow = () => getCurrentWindow().close();
