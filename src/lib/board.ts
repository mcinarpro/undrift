import { age, focusRows, looseEnds, section, status, type FocusPart, type Section, type StatusName } from "@/lib/home";
import { group, type Group } from "@/lib/projects";
import type { Issue, Project, Session } from "@/types";

// The Board (GLOSSARY.md § Board, DESIGN.md § Layout): what Home draws, worked out from the
// bridge's Projects on the window's own clock – a Lane per Project in Focus, three columns a Note
// moves through, the other Projects on the Shelf, and Up Next above it all.

export type Column = "ready" | "today" | "doing";
export const COLUMNS: Column[] = ["ready", "today", "doing"];

/** One column of one Lane, the Lane named by its Project's path. */
export type Cell = { lane: string; column: Column };
export const cellKey = (c: Cell) => `${c.column}:${c.lane}`;

/** How many Lanes the Board holds: Focus's four (config.rs `MAX_FOCUS`), so the bridge refuses a
 * fifth and the Board can say so before the drop. */
export const MAX_LANES = 4;

/** Which pad a Lane's Notes are torn from, by Focus order. */
export type Pad = 1 | 2 | 3 | 4;

/** What a drag can land on: a Cell, the Board itself (for a folder from the Shelf), the Shelf (for
 * a Lane's tape), or nothing. */
export type Target = Cell | "board" | "shelf" | null;

/** Where the pointer took hold of a dragged folder or tape, and its size, so the copy that follows
 * the pointer across the Board's and the Shelf's edges sits exactly where the original was. */
export type Grip = { dx: number; dy: number; width: number };

/** What is being dragged: a Note, with the Cell it left; a folder from the Shelf; or a Lane by its tape. */
export type Dragging = { kind: "note"; url: string; lane: string; column: Column } | { kind: "project"; item: ShelfItem; grip: Grip } | { kind: "lane"; lane: Lane; grip: Grip };

/** The Board's drag, handed to each Note, tape and folder: where it begins, the Target under the
 * pointer as it moves, and the Target it ends on. */
export type BoardDrag = { begin: (d: Dragging, e: PointerEvent) => void; move: (e: PointerEvent) => void; end: (e: PointerEvent) => Target };

const time = (iso: string) => new Date(iso).getTime();
/** A moment to sort by, a missing one last. */
const at = (iso: string | null) => (iso ? time(iso) : Number.MAX_SAFE_INTEGER);

/** Where a Note sits: in flight where it was just dropped, else Doing once Started, Today once
 * pulled, Ready otherwise – a blocked Issue stays in Ready, greyed. */
export function columnOf(issue: Issue, flight?: Record<string, Column>): Column {
  return flight?.[issue.url] ?? (issue.startedAt ? "doing" : issue.todaySince ? "today" : "ready");
}

/** A Session on the Board: an open one with its Status, or the earlier one a Loose End was left
 * in, which can be Resumed. */
export type Card = {
  id: string;
  /** From the transcript; null for an open Session that has not written one yet. */
  title: string | null;
  lastPrompt: string | null;
  lastActivity: string | null;
  /** How long it has been in its Status, or since it was left. */
  since: string | null;
  /** Null for an earlier Session. */
  status: StatusName | null;
  /** *in a terminal* or *on the desktop*; null for an earlier Session. */
  where: string | null;
  /** The section the Loose End was left in; null when the Session left nothing behind. */
  leftOff: Section | null;
};

export type Lane = {
  project: Project;
  pad: Pad;
  focus: FocusPart;
  /** The Issues ready to Start, newest first, then the blocked ones. */
  ready: Issue[];
  /** The Issues pulled into Today, the first pulled first. */
  today: Issue[];
  /** The Issues Started from Undrift, the first Started first. */
  doing: Issue[];
  /** The open Sessions, the ones waiting on you first, then the Loose End's earlier Session. */
  cards: Card[];
};

const STATUS_RANK: Record<StatusName, number> = { Waiting: 0, Busy: 1, Quiet: 2 };

function cardsOf(project: Project, now: Date): Card[] {
  const left = project.looseEnd ? (project.sessions[0] ?? null) : null;
  const cards: Card[] = project.openSessions
    .map((open) => {
      const session = project.sessions.find((s) => s.id === open.id);
      return {
        id: open.id,
        title: session?.title ?? null,
        lastPrompt: session?.lastPrompt ?? null,
        lastActivity: session?.lastActivity ?? null,
        since: open.statusSince,
        status: status(open, now),
        where: open.entrypoint === "cli" ? "in a terminal" : "on the desktop",
        leftOff: left && left.id === open.id ? section(left.lastActivity, now) : null,
      };
    })
    .sort((a, b) => STATUS_RANK[a.status!] - STATUS_RANK[b.status!] || at(a.since) - at(b.since));
  if (left && !project.openSessions.some((o) => o.id === left.id)) {
    cards.push({
      id: left.id,
      title: left.title,
      lastPrompt: left.lastPrompt,
      lastActivity: left.lastActivity,
      since: left.lastActivity,
      status: null,
      where: null,
      leftOff: section(left.lastActivity, now),
    });
  }
  return cards;
}

/** The Lanes in Focus order. Two checkouts of one repository share its Issues, so each Issue is
 * on one Lane, the first that has it – as Ready to Start listed them. */
export function lanes(projects: Project[], now: Date, flight?: Record<string, Column>): Lane[] {
  const seen = new Set<string>();
  const newest = (a: Issue, b: Issue) => time(b.updatedAt) - time(a.updatedAt);
  return focusRows(projects, now).map((focus, i) => {
    const { project } = focus;
    const issues = project.issues.filter((issue) => !seen.has(issue.url) && seen.add(issue.url));
    const column = (c: Column) => issues.filter((issue) => columnOf(issue, flight) === c);
    return {
      project,
      pad: ((i % MAX_LANES) + 1) as Pad,
      focus,
      ready: column("ready").sort((a, b) => Number(a.blockedBy > 0) - Number(b.blockedBy > 0) || newest(a, b)),
      today: column("today").sort((a, b) => at(a.todaySince) - at(b.todaySince)),
      doing: column("doing").sort((a, b) => at(a.startedAt) - at(b.startedAt)),
      cards: cardsOf(project, now),
    };
  });
}

/** The one mark a Shelf item wears: a Session waiting on you, a busy one, a Loose End, or its group. */
export type ShelfMark = { kind: "waiting"; since: string | null } | { kind: "busy" } | { kind: "leftOff"; since: string } | { kind: "group"; group: Group };
export type ShelfItem = { project: Project; mark: ShelfMark };

const GROUP_RANK: Record<Group, number> = { "In Motion": 3, Drifting: 4, Parked: 5 };

function markOf(project: Project, now: Date): ShelfMark {
  const open = project.openSessions.map((o) => ({ status: status(o, now), since: o.statusSince }));
  const waiting = open.filter((o) => o.status === "Waiting").sort((a, b) => at(a.since) - at(b.since))[0];
  if (waiting) return { kind: "waiting", since: waiting.since };
  if (open.some((o) => o.status === "Busy")) return { kind: "busy" };
  const left = project.looseEnd ? project.sessions[0] : undefined;
  if (left) return { kind: "leftOff", since: left.lastActivity };
  return { kind: "group", group: group(project, now) };
}

/** Which Shelf item comes before another: the one that needs you sooner. */
function rank(m: ShelfMark): number {
  return m.kind === "waiting" ? 0 : m.kind === "busy" ? 1 : m.kind === "leftOff" ? 2 : GROUP_RANK[m.group];
}

/** The Projects not in Focus, the ones that need you first: a Session waiting on you (the longest
 * first), a busy one, a Loose End (the newest first), then In Motion, Drifting and Parked. */
export function shelf(projects: Project[], now: Date): ShelfItem[] {
  return projects
    .filter((p) => !p.focusSince)
    .map((project) => ({ project, mark: markOf(project, now) }))
    .sort((a, b) => {
      const r = rank(a.mark) - rank(b.mark);
      if (r !== 0) return r;
      if (a.mark.kind === "waiting" && b.mark.kind === "waiting") return at(a.mark.since) - at(b.mark.since);
      if (a.mark.kind === "leftOff" && b.mark.kind === "leftOff") return time(b.mark.since) - time(a.mark.since);
      return at(b.project.lastActivity) - at(a.project.lastActivity) || a.project.name.localeCompare(b.project.name);
    });
}

/** The one thing to pick up (GLOSSARY.md § Up Next): the newest Loose End whose Session is not
 * open – an open one runs in its own window, and a second `claude --resume` on it would fight it –
 * else the first Note pulled into Today, else the first Note ready on the Project in Focus that
 * drifted most, else nothing. */
export type UpNext = { kind: "resume"; project: Project; session: Session; why: string } | { kind: "start"; project: Project; issue: Issue; why: string } | null;

export function upNext(projects: Project[], now: Date): UpNext {
  // The sections rank a Loose End by its diff; Up Next wants the one left last, whatever its size.
  const left = looseEnds(projects, now)
    .flatMap((g) => g.items.map((le) => ({ ...le, section: g.section })))
    .filter((le) => !le.open)
    .sort((a, b) => time(b.session.lastActivity) - time(a.session.lastActivity))[0];
  if (left) {
    const repo = left.project.repo;
    const when = left.section === "Last Night" ? "Left last night" : `Left ${age(left.session.lastActivity, now)}`;
    const files = repo ? ` · ${repo.changed} ${repo.changed === 1 ? "file" : "files"}${repo.unpushed ? ` · ${repo.unpushed} unpushed` : ""}` : "";
    return { kind: "resume", project: left.project, session: left.session, why: when + files };
  }
  const all = lanes(projects, now);
  const today = all.flatMap((l) => l.today.map((issue) => ({ project: l.project, issue }))).sort((a, b) => at(a.issue.todaySince) - at(b.issue.todaySince))[0];
  if (today) return { kind: "start", ...today, why: `Pulled into Today ${age(today.issue.todaySince!, now)}` };
  const drifted = [...all].sort((a, b) => a.focus.active / a.focus.days - b.focus.active / b.focus.days);
  for (const l of drifted) {
    const issue = l.ready.find((i) => i.blockedBy === 0);
    if (issue)
      return { kind: "start", project: l.project, issue, why: `The Project in Focus that drifted most · ${l.focus.active} of ${l.focus.days} ${l.focus.days === 1 ? "day" : "days"} with Activity` };
  }
  return null;
}

/** A Note's tilt in degrees, 1 to 3 either way, from its number: the same Note always leans the
 * same way, and no state is kept for it. */
export const tilt = (n: number) => (1 + (n % 3)) * (n % 2 ? 1 : -1);
