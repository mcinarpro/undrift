// The window's view of the bridge: mirrors the Serialize structs in src-tauri/src/bridge/
// (camelCase). A field changes on both sides in the same change.

/** A Session, from its transcript. */
export type Session = {
  id: string;
  /** The folder it ran in: Resume starts there. */
  cwd: string;
  title: string;
  lastPrompt: string | null;
  /** ISO timestamp of the Session's last turn. */
  lastActivity: string;
};

/** `done` finished its turn; the window tells waiting from quiet with `statusSince`. */
export type SessionStatus = "busy" | "done";

/** A Session a `claude` process runs right now. */
export type OpenSession = {
  id: string;
  cwd: string;
  status: SessionStatus;
  /** `cli` for a terminal, `claude-desktop` for the desktop app. */
  entrypoint: string;
  /** ISO timestamp of the last status change. */
  statusSince: string | null;
};

/** Lines added and removed in tracked files since the last commit. */
export type DiffStat = {
  insertions: number;
  deletions: number;
};

export type Repo = {
  branch: string;
  headAt: string | null;
  headSubject: string | null;
  /** Files changed, added or untracked since the last commit. */
  changed: number;
  /** Null on a repo with no commit yet. */
  diff: DiffStat | null;
  /** Commits ahead of the upstream; null when the branch has none. */
  unpushed: number | null;
  /** `owner/name` of the `origin` remote when it is on GitHub. */
  github: string | null;
};

/** An open Issue of a Project's GitHub repository. */
export type Issue = {
  number: number;
  title: string;
  labels: string[];
  /** ISO timestamp of its last update. */
  updatedAt: string;
  url: string;
};

/** The Area a Project is filed under. */
export type AreaRef = {
  name: string;
  color: string;
  /** Its place among the Areas, from 0. */
  rank: number;
};

export type Project = {
  /** Absolute path, the Project's identity. */
  path: string;
  /** The path with `~` for the home folder, for display. */
  shortPath: string;
  name: string;
  /** When it was put in Focus (ISO timestamp); null when it is not in Focus. */
  focusSince: string | null;
  /** The Area it is filed under; null when it is Unsorted. */
  area: AreaRef | null;
  repo: Repo | null;
  /** Local dates (YYYY-MM-DD) with Activity in the last 30 days, oldest first. */
  activeDays: string[];
  /** ISO timestamp of the last Activity, commit or Session turn. */
  lastActivity: string | null;
  openSessions: OpenSession[];
  /** Every Session with a transcript, newest first, open ones included: match them to
   * `openSessions` by id to list only the earlier ones. */
  sessions: Session[];
  /** Open Issues; empty when the Project has no GitHub remote. */
  issues: Issue[];
};
