import { focusDrift } from "@/lib/projects";
import type { FileChange, OpenSession, Project, Session } from "@/types";

// What Home reads from the bridge's Projects – the Loose Ends, Focus, the Sessions that need you –
// on the window's own clock; the Board itself is worked out in lib/board.ts from these. The
// bridge decides which Projects are Loose Ends (GLOSSARY.md § Loose End).

export type Section = "Last Night" | "This Week" | "Older";
const SECTIONS: Section[] = ["Last Night", "This Week", "Older"];

/** A Loose End with the Session it was left in, and that Session's process when it still runs. */
export type LooseEnd = { project: Project; session: Session; open: OpenSession | null };

export type StatusName = "Busy" | "Waiting" | "Quiet";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Timestamps come with different offsets, so they are compared as instants, never as text.
const time = (iso: string) => new Date(iso).getTime();

/** Last Night is since 18:00 the day before (DESIGN.md § Layout), This Week the seven days before. */
export function section(iso: string, now: Date): Section {
  const evening = new Date(now);
  evening.setDate(now.getDate() - 1);
  evening.setHours(18, 0, 0, 0);
  const t = time(iso);
  if (t >= evening.getTime()) return "Last Night";
  return now.getTime() - t < 7 * DAY ? "This Week" : "Older";
}

/** The lines changed in a Project, which order the Loose Ends within a section. */
const lines = (p: Project) => (p.repo?.diff ? p.repo.diff.insertions + p.repo.diff.deletions : 0);

/** 0 for a Loose End whose Session is busy or waiting, so it comes first in its section. */
const live = (le: LooseEnd, now: Date) => (le.open && status(le.open, now) !== "Quiet" ? 0 : 1);

/** The Loose Ends by section, newest section first; within one, a Session busy or waiting first,
 * then the biggest diff. */
export function looseEnds(projects: Project[], now: Date): { section: Section; items: LooseEnd[] }[] {
  const items: LooseEnd[] = projects.flatMap((project) => {
    const session = project.sessions[0];
    if (!project.looseEnd || !session) return [];
    const open = project.openSessions.find((s) => s.id === session.id) ?? null;
    return [{ project, session, open }];
  });
  return SECTIONS.map((s) => ({
    section: s,
    items: items
      .filter((le) => section(le.session.lastActivity, now) === s)
      .sort((a, b) => live(a, now) - live(b, now) || lines(b.project) - lines(a.project) || time(b.session.lastActivity) - time(a.session.lastActivity)),
  })).filter((g) => g.items.length > 0);
}

/** A Project in Focus as the Focus tile lists it: the days since it was chosen, and how many of
 * them had Activity (GLOSSARY.md § Focus). */
export type FocusPart = { project: Project; days: number; active: number };

/** The Projects in Focus in the order chosen, each with its Drift from that intention. */
export function focusRows(projects: Project[], now: Date): FocusPart[] {
  return projects
    .filter((p) => p.focusSince)
    .sort((a, b) => time(a.focusSince!) - time(b.focusSince!))
    .flatMap((p) => {
      const f = focusDrift(p, now);
      return f ? [{ project: p, days: f.days, active: f.active }] : [];
    });
}

/** The counts the greeting's line carries beside the Loose Ends: the commits not pushed across
 * the Loose Ends' Projects, and the Sessions open across every Project. */
export function headline(projects: Project[], groups: { section: Section; items: LooseEnd[] }[]): { unpushed: number; open: number } {
  return {
    unpushed: groups.flatMap((g) => g.items).reduce((n, le) => n + (le.project.repo?.unpushed ?? 0), 0),
    open: projects.reduce((n, p) => n + p.openSessions.length, 0),
  };
}

/** An open Session as Needs You lists it: its Project, its title from the transcript – none
 * until the Session writes one – and its process. */
export type NeedRow = { project: Project; open: OpenSession; title: string | null };

/** The title of a Project's Session from its transcript; null until the Session writes one. */
export const sessionTitle = (p: Project, id: string) => p.sessions.find((s) => s.id === id)?.title ?? null;

/** How long a quiet Session stays in Needs You: a Session left overnight has gone quiet by the
 * morning, and it is the one Home exists for (ADR 0001). Past a day it no longer waits on anything. */
const QUIET_KEPT = DAY;

/** The open Sessions across every Project that Home's right column lists: those waiting on you,
 * then those at work, then those gone quiet in the last day, each the longest in its Status first. */
export function needsYou(projects: Project[], now: Date): { waiting: NeedRow[]; busy: NeedRow[]; quiet: NeedRow[] } {
  const rows = projects.flatMap((project) => project.openSessions.map((open) => ({ project, open, title: sessionTitle(project, open.id) })));
  // A Session with no status change on record has no age to rank it by, so it goes last.
  const since = (r: NeedRow) => (r.open.statusSince ? time(r.open.statusSince) : Number.MAX_SAFE_INTEGER);
  const longest = (a: NeedRow, b: NeedRow) => since(a) - since(b);
  const inStatus = (s: StatusName) => rows.filter((r) => status(r.open, now) === s);
  return {
    waiting: inStatus("Waiting").sort(longest),
    busy: inStatus("Busy").sort(longest),
    quiet: inStatus("Quiet")
      .filter((r) => r.open.statusSince && now.getTime() - time(r.open.statusSince) < QUIET_KEPT)
      .sort(longest),
  };
}

/** GLOSSARY.md § Status: waiting for 10 minutes after a turn ends, quiet after that. */
export function status(open: OpenSession, now: Date): StatusName {
  if (open.status === "busy") return "Busy";
  const since = open.statusSince ? time(open.statusSince) : 0;
  return now.getTime() - since < 10 * MINUTE ? "Waiting" : "Quiet";
}

/** A local day as the bridge writes it, YYYY-MM-DD. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The Drift strip's 30 cells, oldest first: whether each local day up to today had Activity. */
export function driftCells(activeDays: string[], now: Date): boolean[] {
  const days = new Set(activeDays);
  return Array.from({ length: 30 }, (_, i) => days.has(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (29 - i)))));
}

/** Geist's relative time: Just now, 5 min. ago, 3 h ago, 2 days ago, then the date. */
export function age(iso: string, now: Date): string {
  const ms = now.getTime() - time(iso);
  if (ms < MINUTE) return "Just now";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min. ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  const days = Math.floor(ms / DAY);
  if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** How long something has been so – *7 h*, *3 days* – the relative time without its *ago*, for
 * a Status that still holds: *Waiting · 7 h*. */
export const elapsed = (iso: string, now: Date) => age(iso, now).replace(/ ago$/, "");

/** A changed file's lines as a list shows them: `+n −n`, *new* for an untracked file, *binary*
 * for a tracked one git cannot count. */
export function fileLines(f: FileChange): string {
  if (f.untracked) return "new";
  return f.insertions === null ? "binary" : `+${f.insertions} −${f.deletions}`;
}

/** A Project's initials: the first letter of its first two words. */
export function monogram(name: string): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
