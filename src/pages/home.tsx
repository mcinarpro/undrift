import { useState, type ReactNode } from "react";
import { Action } from "@/components/action";
import { Activity, AreaName, AreaSwatch, DEFAULT_BRANCHES, Diff, Empty, LIVE_BADGE, ProjectAvatar, STATUS_DOT, useNow, When } from "@/components/bits";
import { Icon } from "@/components/icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fileLines, figures, issuesByProject, looseEnds, status, touchedLast, type LooseEnd, type OpenPart, type Part, type Section as SectionName } from "@/lib/home";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { Issue, Project } from "@/types";

// Home (ADR 0001, DESIGN.md § Layout): the Loose Ends by age as a grid of cards, each led by what
// the Session was doing, then the Issues ready to Start, a card per Project. The grid fills the
// full width, where rows left a hole between their parts.

// Two columns, three from a 1536 px window: a fourth left most sections with a hole on the right,
// and the prompts need the width to read.
const GRID = "grid grid-cols-2 gap-4 2xl:grid-cols-3";
// Geist's material at 12 px, the radius of DESIGN.md's Panels: at 6 px the grid read as boxes.
const TILE = "flex min-w-0 flex-col gap-3 rounded-xl p-4 material-small";

// Rows inside one card are separated by the edge colour on their top side.
const ROW = "items-center gap-6 px-4 py-3 not-first:shadow-[0_-1px_0_0_var(--ud-line)]";

/** The Project a Loose End belongs to, and the Status of its Session when one is open. */
function LooseEndTop({ le, now }: { le: LooseEnd; now: Date }) {
  const { project, open } = le;
  const st = open && status(open, now);
  return (
    <header className="flex min-w-0 items-center gap-2">
      <ProjectAvatar name={project.name} color={project.area?.color} size={24} />
      <span className="truncate type-label-14 font-medium">{project.name}</span>
      <AreaName project={project} />
      {st && (
        <span
          className={cn(
            "ml-auto flex shrink-0 items-center gap-1.5",
            LIVE_BADGE[st] ? cn("h-6 rounded-full px-2.5 text-xs font-medium", LIVE_BADGE[st]) : "type-label-13 text-text-2",
          )}
        >
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[st])} />
          {st}
        </span>
      )}
    </header>
  );
}

/** Resume, primary only on the big tile so one button leads the page, and Let Go in a `⋯` menu. */
function LooseEndActions({ le, primary }: { le: LooseEnd; primary: boolean }) {
  const { resume, letGo } = useStore();
  const { project, session } = le;
  return (
    <div className="flex items-center gap-2">
      <Action variant={primary ? "primary" : "secondary"} size="small" onClick={() => resume(project.path, session.id)}>
        <Icon name="resume" /> Resume
      </Action>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More for ${project.name}`}
          className="flex size-8 items-center justify-center rounded-md transition-colors duration-150 hover:bg-alpha-200 focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]"
        >
          <Icon name="more" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 rounded-xl p-1 ring-0 shadow-(--ud-shadow-menu)">
          <DropdownMenuItem onClick={() => letGo(project.path, project.name)} className="h-9 gap-2 rounded-md px-2 text-sm">
            Let Go
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function LooseEndCard({ le, now }: { le: LooseEnd; now: Date }) {
  const { project, session } = le;
  const branch = project.repo?.branch;
  return (
    <article className={TILE}>
      <LooseEndTop le={le} now={now} />
      {/* What you were doing leads the card; the Project and the numbers only frame it. */}
      <div className="flex flex-col gap-1">
        <h3 className="line-clamp-2 type-heading-16">{session.title}</h3>
        {session.lastPrompt && <p className="line-clamp-2 type-copy-14 text-text-2">“{session.lastPrompt}”</p>}
      </div>
      <Activity project={project} now={now} />
      <div className="mt-auto flex flex-col gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Diff project={project} />
          {branch && !DEFAULT_BRANCHES.includes(branch) && (
            <span className="flex min-w-0 items-center gap-1.5 type-label-13-mono text-muted-foreground">
              <Icon name="branch" size={14} className="shrink-0" />
              <span className="truncate">{branch}</span>
            </span>
          )}
          <span className="ml-auto shrink-0">
            <When iso={session.lastActivity} now={now} />
          </span>
        </div>
        <LooseEndActions le={le} primary={false} />
      </div>
    </article>
  );
}

/** Files the big tile lists before "N more". */
const HERO_FILES = 5;

/** The Loose End to pick up first, as the band's 2×2 tile (DESIGN.md § Layout). Its size says it
 * matters most, so it carries what a small card has no room for: the files left changed and the
 * last commit, which answer "what was done" before Resume. */
function Hero({ le, section, now }: { le: LooseEnd; section: SectionName; now: Date }) {
  const { project, session } = le;
  const repo = project.repo;
  const files = repo?.files ?? [];
  const more = (repo?.changed ?? 0) - Math.min(files.length, HERO_FILES);
  const issues = project.issues.length;
  return (
    <article className={cn(TILE, "col-span-2 row-span-2 gap-4 p-6")}>
      <LooseEndTop le={le} now={now} />
      <div className="flex flex-col gap-2">
        <p className="type-label-13 text-muted-foreground">
          {section} · <When iso={session.lastActivity} now={now} />
        </p>
        <h2 className="line-clamp-2 type-heading-24">{session.title}</h2>
        {session.lastPrompt && <p className="line-clamp-3 type-copy-14 text-text-2">“{session.lastPrompt}”</p>}
      </div>
      <Activity project={project} now={now} />
      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <ul className="flex flex-col gap-1">
            {files.slice(0, HERO_FILES).map((f) => (
              <li key={f.path} className="flex min-w-0 items-center gap-3 type-label-13-mono">
                <span className="grow truncate text-text-2">{f.path}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {fileLines(f)}
                </span>
              </li>
            ))}
          </ul>
          <p className="truncate type-label-13 text-muted-foreground">
            {more > 0 && `${more} more · `}
            {repo?.headSubject && <>Last commit: <span className="text-text-2">{repo.headSubject}</span></>}
          </p>
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-3">
        <LooseEndActions le={le} primary />
        <span className="flex min-w-0 items-center gap-3 type-label-13 text-muted-foreground tabular-nums">
          <Diff project={project} />
          {issues > 0 && <span className="shrink-0">{issues} {issues === 1 ? "Issue" : "Issues"}</span>}
        </span>
      </div>
    </article>
  );
}

/** A figure beside the big tile: the number large, what it counts under it, then where it comes
 * from. A large standalone number keeps proportional figures; the column of parts aligns with
 * tabular ones (dataviz § Figures). */
function FigureTile({ label, total, children }: { label: string; total: number; children: ReactNode }) {
  return (
    <section className={cn(TILE, "gap-4")}>
      <div className="flex flex-col gap-1">
        <span className="type-heading-32">{total.toLocaleString("en-GB")}</span>
        <h2 className="type-label-13 text-muted-foreground">{label}</h2>
      </div>
      <div className="mt-auto">{children}</div>
    </section>
  );
}

/** Ranked horizontal bars, one hue, largest first (dataviz: parts compared with each other). Each
 * part is named and counted in text beside its bar, so the bar is decoration for sighted readers. */
function Parts({ parts }: { parts: Part[] }) {
  const max = Math.max(...parts.map((p) => p.value), 1);
  return (
    <ul className="flex flex-col gap-2">
      {parts.map((p) => (
        <li key={p.label} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3">
          <span className="flex min-w-0 items-center gap-1.5 type-label-13 text-text-2">
            {p.color !== undefined && <AreaSwatch color={p.color ?? undefined} className="size-2" />}
            <span className="truncate">{p.label}</span>
          </span>
          {/* A 6 px bar from the left baseline, its data end rounded 4 px (dataviz § Marks). */}
          <span aria-hidden="true" className="h-1.5">
            <span className="block h-full rounded-r-[4px] bg-mark" style={{ width: `${(p.value / max) * 100}%` }} />
          </span>
          <span className="type-label-13 text-text-2 tabular-nums">{p.value.toLocaleString("en-GB")}</span>
        </li>
      ))}
    </ul>
  );
}

/** The Sessions open now, each with its Status as the cards show it. */
function OpenSessions({ open }: { open: OpenPart[] }) {
  if (open.length === 0) return <p className="type-label-13 text-muted-foreground">No Session runs right now.</p>;
  const shown = open.slice(0, 4);
  return (
    <ul className="flex flex-col gap-2">
      {shown.map((o, i) => (
        <li key={i} className="flex min-w-0 items-center gap-1.5 type-label-13">
          <AreaSwatch color={o.color} className="size-2" />
          <span className="grow truncate text-text-2">{o.label}</span>
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[o.status])} />
          <span className="text-text-2">{o.status}</span>
        </li>
      ))}
      {open.length > shown.length && <li className="type-label-13 text-muted-foreground">{open.length - shown.length} more</li>}
    </ul>
  );
}

/** A section of cards: its name and count above a grid that fills the width. */
function Section({ title, count, aside, children }: { title: string; count: number; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 type-label-14 font-medium">
          {title}
          <span className="type-label-13 text-muted-foreground tabular-nums">{count}</span>
        </h2>
        {aside}
      </div>
      <div className={GRID}>{children}</div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-label-14 font-medium">{title}</h2>
      <div className="rounded-xl material-small">{children}</div>
    </section>
  );
}

/** Issues a Project card shows before Show All: enough to pick the next one, few enough that the
 * Issues stay under the Loose Ends. */
const ISSUES_PER_CARD = 3;

function ProjectIssues({ project, issues, all }: { project: Project; issues: Issue[]; all: boolean }) {
  const { start } = useStore();
  const shown = all ? issues : issues.slice(0, ISSUES_PER_CARD);
  return (
    <article className={TILE}>
      <header className="flex min-w-0 items-center gap-2">
        <ProjectAvatar name={project.name} color={project.area?.color} size={24} />
        <h3 className="truncate type-label-14 font-medium">{project.name}</h3>
        <span className="type-label-13 text-muted-foreground tabular-nums">{issues.length}</span>
      </header>
      <ul className="flex flex-col gap-1">
        {shown.map((issue) => (
          // The row lights up as a whole and its Start has no frame, so the titles read first.
          <li key={issue.url} className="-mx-2 flex min-w-0 items-center gap-2 rounded-md px-2 transition-colors duration-150 hover:bg-alpha-100">
            <span className="type-label-13-mono text-muted-foreground tabular-nums">#{issue.number}</span>
            <span className="grow truncate type-label-14">{issue.title}</span>
            <Action variant="tertiary" size="small" onClick={() => start(project.path, issue.number)} aria-label={`Start #${issue.number} in ${project.name}`}>
              <Icon name="start" /> Start
            </Action>
          </li>
        ))}
      </ul>
      {shown.length < issues.length && <p className="mt-auto type-label-13 text-muted-foreground tabular-nums">{issues.length - shown.length} more</p>}
    </article>
  );
}

function ReadyToStart({ projects }: { projects: Project[] }) {
  const [all, setAll] = useState(false);
  const groups = issuesByProject(projects);
  if (groups.length === 0) return null;
  const total = groups.reduce((n, g) => n + g.issues.length, 0);
  const hiding = groups.some((g) => g.issues.length > ISSUES_PER_CARD);
  return (
    <Section
      title="Ready to Start"
      count={total}
      aside={
        hiding && (
          <Action variant="tertiary" size="small" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? "Show Fewer" : `Show All ${total}`}
          </Action>
        )
      }
    >
      {groups.map((g) => (
        <ProjectIssues key={g.project.path} project={g.project} issues={g.issues} all={all} />
      ))}
    </Section>
  );
}

/** Nothing is left: say so, then offer the Projects touched last. */
function NothingLeft({ projects, now }: { projects: Project[]; now: Date }) {
  const { resume } = useStore();
  const recent = touchedLast(projects);
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl material-small">
        <Empty icon={<Icon name="commit" size={20} />} title="Nothing left half-done.">
          Every change a Session left behind is committed and pushed, or let go of.
        </Empty>
      </div>
      {recent.length > 0 && (
        <Card title="Touched Last">
          {recent.map(({ project, session }) => (
            <div key={project.path} className={cn("grid grid-cols-[minmax(0,1fr)_auto_110px_auto]", ROW)}>
              <span className="flex min-w-0 items-center gap-3">
                <ProjectAvatar name={project.name} color={project.area?.color} size={28} />
                <span className="truncate type-label-14 font-medium">{project.name}</span>
              </span>
              <AreaName project={project} />
              <When iso={session.lastActivity} now={now} />
              <Action variant="secondary" size="small" onClick={() => resume(project.path, session.id)}>
                <Icon name="resume" /> Resume
              </Action>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export function Home() {
  const projects = useStore((s) => s.projects);
  const now = useNow();
  const groups = projects ? looseEnds(projects, now) : [];
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const night = groups.find((g) => g.section === "Last Night")?.items.length ?? 0;
  // The first Loose End – live first, then the newest section – becomes the big tile, and leaves
  // its section; a section it empties is not drawn.
  const hero = groups[0]?.items[0];
  const rest = groups.map((g) => ({ ...g, items: g.items.filter((le) => le !== hero) })).filter((g) => g.items.length > 0);
  const fig = projects && figures(groups, projects, now);

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="type-heading-24">Home</h1>
        {projects && total > 0 && (
          <p className="type-copy-14 text-text-2">
            {total} Loose {total === 1 ? "End" : "Ends"}
            {night > 0 && ` – ${night} from last night`}.
          </p>
        )}
      </header>
      {/* Until the bridge's first list, the page holds only its title. */}
      {projects && (
        <>
          {!hero || !fig ? (
            <NothingLeft projects={projects} now={now} />
          ) : (
            <>
              <div className="grid grid-cols-4 gap-4">
                <Hero le={hero} section={groups[0].section} now={now} />
                <FigureTile label="Loose Ends" total={fig.looseEnds.total}>
                  <Parts parts={fig.looseEnds.parts} />
                </FigureTile>
                <FigureTile label="Lines Not Committed" total={fig.lines.total}>
                  <Parts parts={fig.lines.parts} />
                </FigureTile>
                <FigureTile label="Commits Not Pushed" total={fig.unpushed.total}>
                  <Parts parts={fig.unpushed.parts} />
                </FigureTile>
                <FigureTile label="Sessions Open" total={fig.open.length}>
                  <OpenSessions open={fig.open} />
                </FigureTile>
              </div>
              {rest.map((g) => (
                <Section key={g.section} title={g.section} count={g.items.length}>
                  {g.items.map((le) => (
                    <LooseEndCard key={le.project.path} le={le} now={now} />
                  ))}
                </Section>
              ))}
            </>
          )}
          <ReadyToStart projects={projects} />
        </>
      )}
    </div>
  );
}
