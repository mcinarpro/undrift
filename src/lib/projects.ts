import { dayKey, status, type StatusName } from "@/lib/home";
import type { OpenSession, Project, Repo, Session } from "@/types";

// What the Projects page, a Project page and the Graph show, worked out from the bridge's Projects
// on the window's own clock (GLOSSARY.md § Group, § Drift, § Focus).

export type Group = "In Motion" | "Drifting" | "Parked";

const DAY = 86_400_000;
const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

/** Whole local days from the day of `iso` to today: 0 for today, 1 for yesterday. Rounded, so a
 * day that a change of clock made 23 or 25 hours long still counts as one. */
export function daysAgo(iso: string, now: Date): number {
  const then = new Date(iso);
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

/** GLOSSARY.md § Group: In Motion with Activity today or an open Session, Drifting 1 to 30 days
 * after its last Activity, Parked after that or with none at all. */
export function group(p: Project, now: Date): Group {
  if (p.openSessions.length > 0) return "In Motion";
  if (!p.lastActivity) return "Parked";
  const days = daysAgo(p.lastActivity, now);
  if (days <= 0) return "In Motion";
  return days <= 30 ? "Drifting" : "Parked";
}

/** The Drift as a value: the days since the last Activity. */
export function drift(p: Project, now: Date): string {
  if (!p.lastActivity) return "No Activity";
  const days = daysAgo(p.lastActivity, now);
  if (days <= 0) return "Today";
  return days === 1 ? "1 day" : `${days} days`;
}

const ORDER: Record<Group, number> = { Drifting: 0, "In Motion": 1, Parked: 2 };

/** GLOSSARY.md § Drifting: the Drifting Projects first, the one with the most active days in the
 * last 30 at the top, since the streak you broke matters more than the oldest silence. In Motion
 * follows, then Parked, each the latest Activity first. */
export function ordered(projects: Project[], now: Date): Project[] {
  return projects
    .map((p) => ({ p, g: group(p, now) }))
    .sort(
      (a, b) =>
        ORDER[a.g] - ORDER[b.g] ||
        (a.g === "Drifting" ? b.p.activeDays.length - a.p.activeDays.length : 0) ||
        time(b.p.lastActivity) - time(a.p.lastActivity),
    )
    .map(({ p }) => p);
}

/** What the Projects page lists: every Project, the Unsorted ones, or one Area's by its name. */
export type AreaFilter = { kind: "all" } | { kind: "unsorted" } | { kind: "area"; name: string };

/** A filter as the value of its radio. */
export const filterKey = (f: AreaFilter) => (f.kind === "area" ? `area:${f.name}` : f.kind);

export function matches(p: Project, f: AreaFilter): boolean {
  if (f.kind === "all") return true;
  if (f.kind === "unsorted") return !p.area;
  return p.area?.name === f.name;
}

export type FilterOption = { filter: AreaFilter; label: string; color?: string; count: number };

/** All, then every Area that holds a Project in its rank, then Unsorted when a Project has no Area:
 * an Area exists only while it holds a Project (GLOSSARY.md § Area), so none is ever empty. The
 * choices come from every Project, so the rail keeps its rows while the group filter changes; each
 * count covers only the Projects `within` keeps, so it says what choosing it would show. */
export function areaFilters(projects: Project[], within: (p: Project) => boolean = () => true): FilterOption[] {
  const areas = new Map<string, { rank: number; color: string }>();
  for (const p of projects) if (p.area && !areas.has(p.area.name)) areas.set(p.area.name, { rank: p.area.rank, color: p.area.color });
  const kept = projects.filter(within);
  const count = (f: AreaFilter) => kept.filter((p) => matches(p, f)).length;
  const unsorted: AreaFilter = { kind: "unsorted" };
  return [
    { filter: { kind: "all" }, label: "All", count: kept.length },
    ...[...areas.entries()]
      .sort((a, b) => a[1].rank - b[1].rank)
      .map(([name, a]): FilterOption => ({ filter: { kind: "area", name }, label: name, color: a.color, count: count({ kind: "area", name }) })),
    ...(projects.some((p) => !p.area) ? [{ filter: unsorted, label: "Unsorted", count: count(unsorted) }] : []),
  ];
}

/** The rail's first section: every Project, one group, the Loose Ends or the Focus – what a
 * Project is doing, beside the Area it is filed under. */
export type GroupFilter = { kind: "all" } | { kind: "group"; group: Group } | { kind: "looseEnds" } | { kind: "focus" };

/** A filter as a key to compare and store it by. */
export const groupKey = (f: GroupFilter) => (f.kind === "group" ? `group:${f.group}` : f.kind);

export function inGroup(p: Project, f: GroupFilter, now: Date): boolean {
  if (f.kind === "all") return true;
  if (f.kind === "group") return group(p, now) === f.group;
  if (f.kind === "looseEnds") return p.looseEnd;
  return p.focusSince !== null;
}

export type GroupOption = { filter: GroupFilter; label: string; count: number };

const GROUPS: Group[] = ["In Motion", "Drifting", "Parked"];

/** The three groups, then the Loose Ends and the Focus. They are always listed, an empty one at 0,
 * since a group that holds nothing is news; each count covers the Projects `within` keeps. */
export function groupFilters(projects: Project[], now: Date, within: (p: Project) => boolean): GroupOption[] {
  const kept = projects.filter(within);
  const option = (filter: GroupFilter, label: string): GroupOption => ({ filter, label, count: kept.filter((p) => inGroup(p, filter, now)).length });
  return [
    ...GROUPS.map((g) => option({ kind: "group", group: g }, g)),
    option({ kind: "looseEnds" }, "Loose Ends"),
    option({ kind: "focus" }, "Focus"),
  ];
}

/** How the Projects page orders its Projects. */
export type Sort = "drift" | "activity" | "name";

export const SORTS: { value: Sort; label: string }[] = [
  { value: "drift", label: "Drift" },
  { value: "activity", label: "Last Activity" },
  { value: "name", label: "Name" },
];

/** Drift is GLOSSARY.md's order; Last Activity the latest first, a Project without any last; Name
 * as a person reads it, so "app10" follows "app9". */
export function sorted(projects: Project[], sort: Sort, now: Date): Project[] {
  if (sort === "drift") return ordered(projects, now);
  if (sort === "activity") return [...projects].sort((a, b) => time(b.lastActivity) - time(a.lastActivity));
  return [...projects].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }));
}

/** GLOSSARY.md § Focus: the days since the Project was put in Focus, today included, and how many
 * of them had Activity. The bridge sends 30 days of Activity, so an older Focus is measured over
 * the last 30, and `capped` says so. */
export function focusDrift(p: Project, now: Date): { days: number; active: number; capped: boolean } | null {
  if (!p.focusSince) return null;
  const since = daysAgo(p.focusSince, now) + 1;
  const days = Math.min(Math.max(since, 1), 30);
  const from = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)));
  return { days, active: p.activeDays.filter((d) => d >= from).length, capped: since > 30 };
}

const STATUSES: StatusName[] = ["Busy", "Waiting", "Quiet"];

/** The Project's open Sessions counted by Status, the ones at work or waiting on you first. */
export function openStatuses(p: Project, now: Date): { status: StatusName; count: number }[] {
  return STATUSES.map((s) => ({ status: s, count: p.openSessions.filter((o) => status(o, now) === s).length })).filter((s) => s.count > 0);
}

/** The work not committed in one short value: `+n −n`, or the files changed when no tracked line
 * did – an untracked or a binary file has no line count – and null when nothing changed. */
export function changes(repo: Repo | null): string | null {
  if (!repo || repo.changed === 0) return null;
  const d = repo.diff;
  if (d && d.insertions + d.deletions > 0) return `+${d.insertions} −${d.deletions}`;
  return `${repo.changed} ${repo.changed === 1 ? "file" : "files"}`;
}

/** The Session the Project was left in, and its process when it still runs. */
export function lastSession(p: Project): { session: Session; open: OpenSession | null } | null {
  const session = p.sessions[0];
  if (!session) return null;
  return { session, open: p.openSessions.find((o) => o.id === session.id) ?? null };
}

/** The Sessions before the last one that no process runs any more: the last one leads the page
 * with its own Resume, and an open one is resumed from its own terminal. */
export function earlierSessions(p: Project): Session[] {
  const open = new Set(p.openSessions.map((o) => o.id));
  return p.sessions.slice(1).filter((s) => !open.has(s.id));
}
