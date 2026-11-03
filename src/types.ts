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

/** A changed file by name and line counts, never its contents. Untracked and binary files have
 * no line counts. */
export type FileChange = {
  path: string;
  insertions: number | null;
  deletions: number | null;
  /** A file git does not know yet; the only one called *new*. */
  untracked: boolean;
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
  /** The subjects of those commits, newest first, at most 50. */
  commits: string[];
  /** `owner/name` of the `origin` remote when it is on GitHub. */
  github: string | null;
  /** The GitHub repository's description, read with `gh`; null without one. */
  description: string | null;
  /** The changed files, the most changed lines first, at most 50. */
  files: FileChange[];
};

/** An open Issue of a Project's GitHub repository. */
export type Issue = {
  number: number;
  title: string;
  labels: string[];
  /** ISO timestamp of its last update. */
  updatedAt: string;
  url: string;
  /** The open Issues blocking it, as GitHub's dependencies say: ready to Start at 0. */
  blockedBy: number;
};

/** Reads First: the size of what a Session loads at start, and the files counted. */
export type ReadsFirst = {
  bytes: number;
  /** Paths relative to the Project; a skill says that only its frontmatter is counted. */
  files: string[];
};

export type Project = {
  /** Absolute path, the Project's identity. */
  path: string;
  /** The path with `~` for the home folder, for display. */
  shortPath: string;
  name: string;
  /** When it was put in Focus (ISO timestamp); null when it is not in Focus. */
  focusSince: string | null;
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
  /** Whether Home lists it as a Loose End, Let Go already applied. */
  looseEnd: boolean;
  /** What every Session reads before its first prompt; null when the folder has nothing. */
  readsFirst: ReadsFirst | null;
};

/** Which of the bridge's passes the list holds. Until one is in, what it reads is not known, which
 * is not the same as nothing: no Loose End, no git repository, no open Issue. */
export type Read = {
  /** The transcripts: the Sessions and the folders they ran in. */
  sessions: boolean;
  /** git in every Project folder: the Loose Ends and `repo`. */
  git: boolean;
  /** `gh` for every GitHub repository: `issues` and the description. */
  github: boolean;
};

/** What the bridge sends: the Projects, and which passes they hold. */
/** The bridge's list; `answered` is true on the one that answers a Refresh, once every pass is in. */
export type Snapshot = { projects: Project[]; read: Read; answered: boolean };

/** The cached NavUser, and whether `gh api user` already answered: an answer that went out before
 * the window listened still tells it to stop waiting. */
export type NavUserNow = { user: NavUser | null; answered: boolean };

/** The GitHub account `gh` is signed in to, shown as the avatar at the end of the header. */
export type NavUser = {
  login: string;
  /** The profile's name, or the login when the profile has none. */
  name: string;
  profileUrl: string;
};
