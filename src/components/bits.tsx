import { Fragment, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { DriftStrip } from "@/components/drift-strip";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { age, driftCells, monogram, type StatusName } from "@/lib/home";
import type { Group } from "@/lib/projects";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

/** Relative times tick every minute (DESIGN.md § Layout), and a Session turns quiet on this clock. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** A Status as the Graph draws it – busy in the mark, waiting in the ink, quiet hollow – with its word. */
export const STATUS_DOT: Record<StatusName, string> = {
  Busy: "bg-mark",
  Waiting: "bg-foreground",
  Quiet: "shadow-[inset_0_0_0_1.5px_var(--ud-muted)]",
};

/** A Session at work or waiting on you is what Home must not let slip by, so its Status is a Badge
 * and its card comes first in its section. A quiet one keeps the dot and the word. */
// Geist's subtle Badge: blue's tint mixed into the surface, opaque (DESIGN.md § Colour).
export const LIVE_BADGE: Partial<Record<StatusName, string>> = {
  Busy: "bg-[color-mix(in_oklab,var(--ud-accent)_12%,var(--ud-surface))] text-accent-text",
  Waiting: "bg-alpha-200 text-foreground",
};

export function When({ iso, now }: { iso: string; now: Date }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString("en-GB")} className="type-label-13 whitespace-nowrap text-muted-foreground tabular-nums">
      {age(iso, now)}
    </time>
  );
}

export function Diff({ project }: { project: Project }) {
  const repo = project.repo;
  if (!repo) return null;
  const parts = [`${repo.changed} ${repo.changed === 1 ? "file" : "files"}`];
  // An untracked file has no line count (repo.rs), so a diff of nothing says nothing.
  if (repo.diff && repo.diff.insertions + repo.diff.deletions > 0) parts.push(`+${repo.diff.insertions} −${repo.diff.deletions}`);
  if (repo.unpushed) parts.push(`${repo.unpushed} unpushed`);
  return <span className="truncate type-label-13-mono text-text-2 tabular-nums">{parts.join(" · ")}</span>;
}

/** The default branch is where work happens unless said otherwise, so only another one is shown. */
export const DEFAULT_BRANCHES = ["main", "master"];

/** The Project's Drift strip with its active days written beside it. */
export function Activity({ project, now }: { project: Project; now: Date }) {
  const days = project.activeDays.length;
  return (
    <div className="flex items-center gap-3">
      <DriftStrip cells={driftCells(project.activeDays, now)} className="grow" />
      <span className="shrink-0 type-label-13 text-muted-foreground tabular-nums">
        {days} active {days === 1 ? "day" : "days"}
      </span>
    </div>
  );
}

/** Geist's Description: a label over its value, inside a `<dl>`. */
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt className="type-label-12 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 type-label-14">{children}</dd>
    </div>
  );
}

/** Geist's subtle Badge (DESIGN.md § Components): `md` for a group, `sm` for the Focus marker. The
 * caller gives the tint and the word's colour. A Badge labels; it is never a button. */
export function Badge({ size = "md", className, children }: { size?: "md" | "sm"; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full whitespace-nowrap",
        size === "md" ? "h-6 px-2.5 type-label-12 font-medium" : "h-5 px-2 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A Session's Status: a Badge when it is busy or waiting on you, the dot and the word when quiet.
 * Several Sessions in one Status are counted: *2 Sessions busy*. A `label` says something else in
 * the same mark, as a Project page's *2 Sessions open*, worn in the Status of the most pressing. */
export function StatusMark({ status, count = 1, label }: { status: StatusName; count?: number; label?: string }) {
  const dot = <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} />;
  const text = label ?? (count > 1 ? `${count} Sessions ${status.toLowerCase()}` : status);
  return LIVE_BADGE[status] ? (
    <Badge className={cn(LIVE_BADGE[status], "tabular-nums")}>
      {dot}
      {text}
    </Badge>
  ) : (
    <span className="flex shrink-0 items-center gap-1.5 type-label-13 text-text-2 tabular-nums">
      {dot}
      {text}
    </span>
  );
}

// Each tint is mixed into the surface and opaque, so a hovered row cannot drop the word under
// 4.5:1 (DESIGN.md § Colour).
const GROUP_BADGE: Record<Group, string> = {
  "In Motion": "bg-[color-mix(in_oklab,var(--ud-accent)_12%,var(--ud-surface))] text-accent-text",
  Drifting: "bg-[color-mix(in_oklab,var(--ud-drifting)_15%,var(--ud-surface))] text-drifting-text",
  Parked: "bg-alpha-200 text-text-2",
};

/** The group where it is the point: a Project page's Drift. */
export function GroupBadge({ group }: { group: Group }) {
  return <Badge className={GROUP_BADGE[group]}>{group}</Badge>;
}

/** The Focus marker on a Project card. */
export function FocusBadge() {
  return <Badge size="sm" className="bg-[color-mix(in_oklab,var(--ud-accent)_10%,var(--ud-surface))] text-accent-text">Focus</Badge>;
}

export const GROUP_DOT: Record<Group, string> = { "In Motion": "bg-mark", Drifting: "bg-drifting", Parked: "bg-parked" };

/** A group dot alone in a row, given the Project's name, so it says "undrift is drifting" on hover
 * and to screen readers. */
export function GroupDot({ name, group }: { name: string; group: Group }) {
  const label = `${name} is ${group.toLowerCase()}`;
  return <span role="img" aria-label={label} title={label} className={cn("size-2.5 shrink-0 rounded-full", GROUP_DOT[group])} />;
}

/** Geist's small Gauge (DESIGN.md § Components): the value arc in `accent` and the track in
 * `cell-off`, from the top and clockwise, with a gap of 9% of the circle where they meet. The
 * value is written inside it, and a change eases over 1 s. */
export function Gauge({ value, max, label, size = 40 }: { value: number; max: number; label: string; size?: number }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  // A round cap reaches half a stroke past each end of an arc, so the gap gives it room. A full or
  // empty gauge has one arc and no gap.
  const gap = f > 0 && f < 1 ? 0.09 * c + stroke : 0;
  const arc = (start: number, length: number) => ({
    strokeDasharray: `${Math.max(length, 0)} ${c}`,
    strokeDashoffset: -start,
  });
  const motion = "motion-safe:transition-[stroke-dasharray,stroke-dashoffset] motion-safe:duration-1000";
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={label}
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg aria-hidden="true" width={size} height={size} className="absolute inset-0 -rotate-90">
        {f < 1 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className={cn("stroke-cell-off", motion)} style={arc(f * c + gap / 2, (1 - f) * c - gap)} />
        )}
        {f > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className={cn("stroke-mark", motion)} style={arc(gap / 2, f * c - gap)} />
        )}
      </svg>
      <span aria-hidden="true" className="type-label-12 font-medium tabular-nums">
        {value}
      </span>
    </span>
  );
}

/** Geist's Keyboard Input: 20 px, 12 px Geist Sans, `surface` with `text-2` inside an `alpha-400` edge. */
export function Key({ children }: { children: ReactNode }) {
  return <Kbd className="rounded-sm bg-card text-text-2 shadow-[0_0_0_1px_var(--ud-alpha-400)]">{children}</Kbd>;
}

/** A Project's avatar: its initials on a raised square, as Vercel shows a framework icon. */
export function ProjectAvatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="flex shrink-0 items-center justify-center rounded-md bg-secondary font-semibold text-text-2 edge"
    >
      {monogram(name)}
    </span>
  );
}

/** Geist's Switch (DESIGN.md § Components): native radios in a fieldset, so the group is one tab
 * stop and the arrow keys move the choice. The hidden radio hides its own focus ring, so the label
 * draws the double ring while the radio inside it has keyboard focus. `icons` is Geist's icon
 * Switch: square options, each label an icon with its name for screen readers, and a `hint` that
 * names it on hover and on focus. */
export function Segmented<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  icons = false,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: ReactNode; hint?: string }[];
  onChange: (value: T) => void;
  icons?: boolean;
}) {
  return (
    <fieldset className="flex h-9 max-w-full items-center gap-0.5 overflow-x-auto rounded-md bg-card p-1 edge">
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => {
        const option = (
          <label
            className={cn(
              "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm px-2.5 type-label-14 font-medium transition-colors duration-150 has-[:focus-visible]:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]",
              icons && "w-7 justify-center px-0",
              o.value === value ? "bg-alpha-200 text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        );
        return o.hint ? (
          <Hint key={o.value} label={o.hint}>
            {option}
          </Hint>
        ) : (
          <Fragment key={o.value}>{option}</Fragment>
        );
      })}
    </fieldset>
  );
}

/** Geist's Tooltip (DESIGN.md § Components): names an icon-only control on hover and on focus. It
 * adds to the control's own name for screen readers and never stands in for it. The child becomes
 * the trigger, so it keeps its own element and props. */
export function Hint({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent className="rounded-lg px-2 py-1.5 text-[13px]/[1.3] text-balance">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Geist's Empty State, informational kind: an icon in a box, maybe a title, one sentence, maybe an action. */
export function Empty({ icon, title, children, action }: { icon: ReactNode; title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-12 text-center">
      <span className="flex items-center justify-center rounded-lg p-2.5 text-text-2 edge">{icon}</span>
      <div className="flex flex-col items-center gap-2">
        {title && <h3 className="type-heading-16 text-balance">{title}</h3>}
        <p className="max-w-[340px] type-copy-14 text-balance text-text-2">{children}</p>
      </div>
      {action}
    </div>
  );
}
