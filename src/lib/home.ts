import { focusDrift } from "@/lib/projects";
import type { FileChange, Issue, OpenSession, Project, Session } from "@/types";

// What Home shows, worked out from the bridge's Projects. The bridge decides which Projects are
// Loose Ends (GLOSSARY.md § Loose End); the window decides how they read on its own clock.

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

/** One part of a figure: what it counts for, and how much. A Project's part carries its Area colour,
 * `null` when it is Unsorted; a section's carries none. */
export type Part = { label: string; value: number; color?: string | null };

/** A figure tile: its total, and the parts it splits into, largest first. */
export type Figure = { total: number; parts: Part[] };

/** Parts shown per figure: past four, the smallest fold into "Other" (dataviz: fold the tail,
 * never a fifth row the tile has no room for). Parts at zero draw nothing. */
const MAX_PARTS = 4;

function ranked(parts: Part[]): Figure {
  const sorted = parts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((n, p) => n + p.value, 0);
  if (sorted.length <= MAX_PARTS) return { total, parts: sorted };
  const kept = sorted.slice(0, MAX_PARTS - 1);
  const other = sorted.slice(MAX_PARTS - 1).reduce((n, p) => n + p.value, 0);
  return { total, parts: [...kept, { label: "Other", value: other }] };
}

/** An open Session as the Sessions Open tile lists it. */
export type OpenPart = { label: string; color?: string; status: StatusName };

/** A Project in Focus as the Focus tile lists it: the days since it was chosen, and how many of
 * them had Activity (GLOSSARY.md § Focus). */
export type FocusPart = { project: Project; days: number; active: number };

/** The figures beside the big tile, each split by where it comes from, so a number says where as
 * well as how many: the Loose Ends by section, the Focus in the order chosen, the commits left
 * by Project, and the Sessions open now with their Status, the ones at work or waiting first. */
export function figures(
  groups: { section: Section; items: LooseEnd[] }[],
  projects: Project[],
  now: Date,
): { looseEnds: Figure; focus: FocusPart[]; unpushed: Figure; open: OpenPart[] } {
  const items = groups.flatMap((g) => g.items);
  const byProject = (value: (p: Project) => number) =>
    ranked(items.map((le) => ({ label: le.project.name, value: value(le.project), color: le.project.area?.color ?? null })));
  const order: Record<StatusName, number> = { Busy: 0, Waiting: 1, Quiet: 2 };
  return {
    looseEnds: ranked(groups.map((g) => ({ label: g.section, value: g.items.length }))),
    focus: projects
      .filter((p) => p.focusSince)
      .sort((a, b) => time(a.focusSince!) - time(b.focusSince!))
      .flatMap((p) => {
        const f = focusDrift(p, now);
        return f ? [{ project: p, days: f.days, active: f.active }] : [];
      }),
    unpushed: byProject((p) => p.repo?.unpushed ?? 0),
    open: projects
      .flatMap((p) => p.openSessions.map((o) => ({ label: p.name, color: p.area?.color, status: status(o, now) })))
      .sort((a, b) => order[a.status] - order[b.status]),
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

/** Every Issue ready to Start grouped by its Project – an open Issue with no open blocker – each
 * Project's Issues the most recently updated first, the Projects ordered by their newest Issue.
 * Two checkouts of one repository share its Issues, so each Issue is listed once, with the first
 * Project that has it. */
export function issuesByProject(projects: Project[]): { project: Project; issues: Issue[] }[] {
  const seen = new Set<string>();
  return projects
    .map((project) => ({
      project,
      issues: project.issues
        .filter((i) => i.blockedBy === 0 && !seen.has(i.url) && seen.add(i.url))
        .sort((a, b) => time(b.updatedAt) - time(a.updatedAt)),
    }))
    .filter((g) => g.issues.length > 0)
    .sort((a, b) => time(b.issues[0].updatedAt) - time(a.issues[0].updatedAt));
}

/** The five Projects touched last that have a Session to Resume, for the Empty State. */
export function touchedLast(projects: Project[]): { project: Project; session: Session }[] {
  return projects
    .flatMap((project) => (project.sessions[0] ? [{ project, session: project.sessions[0] }] : []))
    .sort((a, b) => time(b.session.lastActivity) - time(a.session.lastActivity))
    .slice(0, 5);
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
