import { useState, type ReactNode } from "react";
import { Action } from "@/components/action";
import { Activity, AreaName, AreaSwatch, DEFAULT_BRANCHES, Diff, Empty, Hint, LIVE_BADGE, ProjectAvatar, STATUS_DOT, useNow, When } from "@/components/bits";
import { Icon } from "@/components/icon";
import { Bar, useProjectsRead, useSkeleton } from "@/components/loading";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fileLines, figures, issuesByProject, looseEnds, needsYou, status, touchedLast, type LooseEnd, type NeedRow, type OpenPart, type Part, type Section as SectionName } from "@/lib/home";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { Issue, Project } from "@/types";

// Home (ADR 0001, DESIGN.md § Layout): the Loose Ends by age as a grid of cards, each led by what
// the Session was doing, then the Issues ready to Start, a card per Project. The grid fills the
// full width, where rows left a hole between their parts. From a 1280 px window the Issues move to a
// column on the right, under the Sessions that need you, so what to Start is on the first screen.

// Two columns, three from a 1536 px window: a fourth left most sections with a hole on the right,
// and the prompts need the width to read.
const GRID = "grid grid-cols-2 gap-4 2xl:grid-cols-3";
// Geist's material at 12 px, the radius of DESIGN.md's Panels: at 6 px the grid read as boxes.
// The card is a group, so what it holds can answer the pointer over the card as a whole.
const TILE = "group/card flex min-w-0 flex-col gap-3 rounded-xl p-4 material-small";

// Rows inside one card are separated by the edge colour on their top side.
const ROW = "items-center gap-6 px-4 py-3 not-first:shadow-[0_-1px_0_0_var(--ud-line)]";

/** A Project's name that opens its page, as a link reads: underlined under the pointer. A card
 * keeps its own buttons, so the name is the way in rather than the whole card. */
function ProjectLink({ project, as: Tag = "span" }: { project: Project; as?: "span" | "h3" }) {
  const openProject = useStore((s) => s.openProject);
  return (
    <Tag className="min-w-0 truncate type-label-14 font-medium">
      <button type="button" onClick={() => openProject(project.path)} className="max-w-full truncate rounded-sm text-left underline-offset-4 hover:underline">
        {project.name}
      </button>
    </Tag>
  );
}

/** Open Project in one click, at the end of a card's header: an arrow out of the card, named in its
 * Hint, for whoever does not think to click the name. It is always there, so the keyboard and a
 * first look find it, but faint – `muted` at half – until the pointer is over the card, so a page
 * of cards stays calm. */
function OpenProject({ project }: { project: Project }) {
  const openProject = useStore((s) => s.openProject);
  return (
    <Hint label="Open Project">
      <Action variant="tertiary" size="tiny" aria-label={`Open ${project.name}`} onClick={() => openProject(project.path)} className="shrink-0 text-muted-foreground/50 group-hover/card:text-foreground">
        <Icon name="open" />
      </Action>
    </Hint>
  );
}

/** The Project a Loose End belongs to, the Status of its Session when one is open, and Open Project. */
function LooseEndTop({ le, now }: { le: LooseEnd; now: Date }) {
  const { project, open } = le;
  const st = open && status(open, now);
  return (
    <header className="flex min-w-0 items-center gap-2">
      <ProjectAvatar name={project.name} color={project.area?.color} size={24} />
      <ProjectLink project={project} />
      <AreaName project={project} />
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {st && (
          <span
            className={cn(
              "flex items-center gap-1.5",
              LIVE_BADGE[st] ? cn("h-6 rounded-full px-2.5 text-xs font-medium", LIVE_BADGE[st]) : "type-label-13 text-text-2",
            )}
          >
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[st])} />
            {st}
          </span>
        )}
        <OpenProject project={project} />
      </span>
    </header>
  );
}

/** Resume, primary only on the big tile so one button leads the page, then Open Project and Let Go
 * in a `⋯` menu. */
function LooseEndActions({ le, primary }: { le: LooseEnd; primary: boolean }) {
  const { resume, letGo, openProject } = useStore();
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
          <DropdownMenuItem onClick={() => openProject(project.path)} className="h-9 gap-2 rounded-md px-2 text-sm">
            Open Project
          </DropdownMenuItem>
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
    // A container, so its parts fit the tile's own width: beside a right column a tile is narrower
    // than the window alone would say.
    <section className={cn(TILE, "@container gap-4")}>
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
        // In a narrow tile the names give up width before the bars do, or a bar shrinks to a dot.
        <li key={p.label} className="grid grid-cols-[minmax(0,4.5rem)_minmax(0,1fr)_auto] items-center gap-2 @min-[14rem]:grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] @min-[14rem]:gap-3">
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
function Section({ title, count, aside, grid = GRID, children }: { title: string; count: number; aside?: ReactNode; grid?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 type-label-14 font-medium">
          {title}
          <span className="type-label-13 text-muted-foreground tabular-nums">{count}</span>
        </h2>
        {aside}
      </div>
      <div className={grid}>{children}</div>
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
 * Issues never outweigh the Loose Ends. */
const ISSUES_PER_CARD = 3;

function ProjectIssues({ project, issues, all }: { project: Project; issues: Issue[]; all: boolean }) {
  const { start } = useStore();
  const shown = all ? issues : issues.slice(0, ISSUES_PER_CARD);
  return (
    <article className={TILE}>
      <header className="flex min-w-0 items-center gap-2">
        <ProjectAvatar name={project.name} color={project.area?.color} size={24} />
        <ProjectLink project={project} as="h3" />
        <span className="type-label-13 text-muted-foreground tabular-nums">{issues.length}</span>
        <span className="ml-auto flex">
          <OpenProject project={project} />
        </span>
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

// Two across under the Loose Ends, as the sections are; one in the right column, 360 px wide.
const ISSUES_GRID = "grid grid-cols-2 gap-4 xl:grid-cols-1";

function ReadyToStart({ groups }: { groups: { project: Project; issues: Issue[] }[] }) {
  const [all, setAll] = useState(false);
  if (groups.length === 0) return null;
  const total = groups.reduce((n, g) => n + g.issues.length, 0);
  const hiding = groups.some((g) => g.issues.length > ISSUES_PER_CARD);
  return (
    <Section
      title="Ready to Start"
      count={total}
      grid={ISSUES_GRID}
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

/** One open Session in Needs You: its Project, its title and since when it is in its Status. The
 * whole row opens the Project page, which lists the Session with where it runs. It has no Resume:
 * the Session already runs, and a second `claude` on it would fight the first. */
function NeedItem({ row, now }: { row: NeedRow; now: Date }) {
  const openProject = useStore((s) => s.openProject);
  const { project, open, title } = row;
  return (
    <li>
      <button
        type="button"
        onClick={() => openProject(project.path)}
        className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-alpha-100"
      >
        <ProjectAvatar name={project.name} color={project.area?.color} size={24} />
        <span className="flex min-w-0 grow flex-col">
          <span className="truncate type-label-13 text-muted-foreground">{project.name}</span>
          <span className={cn("truncate type-label-14", !title && "text-muted-foreground")}>{title ?? "No title yet"}</span>
        </span>
        {open.statusSince && <When iso={open.statusSince} now={now} />}
      </button>
    </li>
  );
}

/** The Sessions of one Status under a quieter label than the block's own. */
function NeedGroup({ label, rows, now }: { label: string; rows: NeedRow[]; now: Date }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="flex items-center gap-2 px-2 pt-1 type-label-12 text-muted-foreground">
        {label}
        <span className="tabular-nums">{rows.length}</span>
      </h3>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <NeedItem key={r.open.id} row={r} now={now} />
        ))}
      </ul>
    </div>
  );
}

/** The open Sessions waiting on you across every Project, then, under quieter labels, the ones at
 * work and the ones gone quiet in the last day – a Session left overnight is quiet by the morning.
 * A Session in a Project with nothing left uncommitted is no Loose End, so without this block it
 * would only be counted in the Sessions Open tile. Under 1280 px Home keeps one column and the
 * Sessions Open tile alone. */
function NeedsYou({ waiting, busy, quiet, now }: { waiting: NeedRow[]; busy: NeedRow[]; quiet: NeedRow[]; now: Date }) {
  if (waiting.length + busy.length + quiet.length === 0) return null;
  return (
    <section className="hidden flex-col gap-3 xl:flex">
      <h2 className="flex items-center gap-2 type-label-14 font-medium">
        Needs You
        {waiting.length > 0 && <span className="type-label-13 text-muted-foreground tabular-nums">{waiting.length}</span>}
      </h2>
      <div className="flex flex-col gap-2 rounded-xl p-2 material-small">
        {waiting.length > 0 ? (
          <ul className="flex flex-col">
            {waiting.map((r) => (
              <NeedItem key={r.open.id} row={r} now={now} />
            ))}
          </ul>
        ) : (
          <p className="p-2 type-label-13 text-muted-foreground">No Session waits on you.</p>
        )}
        <NeedGroup label="Busy" rows={busy} now={now} />
        <NeedGroup label="Quiet" rows={quiet} now={now} />
      </div>
    </section>
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
                <ProjectLink project={project} />
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

/** Home in Skeletons while the Loose Ends are read: the band – the big tile and the four figures –
 * then a section of cards, so the page keeps its shape when they come in. */
function HomeSkeleton() {
  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <div className={cn(TILE, "col-span-2 row-span-2 gap-4 p-6")}>
          <Bar className="h-6 w-1/3" />
          <Bar className="h-8 w-3/4" />
          <Bar className="h-4 w-2/3" />
          <Bar className="mt-auto h-8 w-24" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn(TILE, "gap-4")}>
            <Bar className="h-8 w-16" />
            <Bar className="h-3 w-24" />
            <Bar className="mt-auto h-12 w-full" />
          </div>
        ))}
      </div>
      <section className="flex flex-col gap-3">
        <Bar className="h-4 w-24" />
        <div className={GRID}>
          {[0, 1].map((i) => (
            <div key={i} className={TILE}>
              <Bar className="h-6 w-1/2" />
              <Bar className="h-5 w-3/4" />
              <Bar className="h-4 w-full" />
              <Bar className="h-8 w-24" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/** Ready to Start in Skeletons while `gh` has not answered: its name, then two cards of rows, in
 * the place the Issues will take. Never *nothing*, since no card is not the same as not read. */
function ReadyToStartSkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-label-14 font-medium">Ready to Start</h2>
      <div className={ISSUES_GRID}>
        {[0, 1].map((i) => (
          <div key={i} className={TILE}>
            <div className="flex items-center gap-2">
              <Bar className="size-6" />
              <Bar className="h-4 w-28" />
            </div>
            {[0, 1, 2].map((j) => (
              <Bar key={j} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Home() {
  const githubRead = useStore((s) => s.read.github);
  // Home greets the account by its first name; without one it keeps its own.
  const firstName = useStore((s) => s.user?.name.split(" ")[0]);
  const now = useNow();
  // The Loose Ends need the transcripts and git; Ready to Start needs GitHub as well. Until then
  // each shows its Skeletons, so Home never says *Nothing left half-done.* before it knows.
  const { phase: loosePhase, projects } = useProjectsRead();
  const issuesPhase = useSkeleton(loosePhase !== "ready" || !githubRead);
  const groups = projects ? looseEnds(projects, now) : [];
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const night = groups.find((g) => g.section === "Last Night")?.items.length ?? 0;
  // The first Loose End – live first, then the newest section – becomes the big tile, and leaves
  // its section; a section it empties is not drawn.
  const hero = groups[0]?.items[0];
  const rest = groups.map((g) => ({ ...g, items: g.items.filter((le) => le !== hero) })).filter((g) => g.items.length > 0);
  const fig = projects && figures(groups, projects, now);
  const issues = projects && issuesPhase === "ready" ? issuesByProject(projects) : [];
  const needs = projects ? needsYou(projects, now) : { waiting: [], busy: [], quiet: [] };
  const needed = needs.waiting.length + needs.busy.length + needs.quiet.length > 0;
  const issuesShown = issues.length > 0 || issuesPhase === "skeleton";
  // The right column is drawn only with something in it, so an empty one takes no width; under
  // 1280 px it holds only Ready to Start, since Needs You shows from there.
  const hasRightColumn = issuesShown || needed;

  return (
    // One column under 1280 px, where the right column falls under the Loose Ends as Ready to Start
    // always has. From there it takes 360 px and stays in view while the Loose Ends scroll;
    // `items-start` keeps it to its own height, or it would fill the row and have nowhere to stick.
    <div className={cn("grid w-full grid-cols-1 items-start gap-8 px-8 py-8", hasRightColumn && "xl:grid-cols-[minmax(0,1fr)_360px]")}>
      <div className="flex min-w-0 flex-col gap-8">
        {/* The column keeps 32 px between its parts; the greeting sits closer to what it introduces. */}
        <header className="-mb-4 flex flex-col gap-1">
          <h1 className="type-heading-24">{firstName ? `Hello, ${firstName}` : "Home"}</h1>
          {projects && total > 0 && (
            <p className="type-copy-14 text-text-2">
              {total} Loose {total === 1 ? "End" : "Ends"}
              {night > 0 && ` – ${night} from last night`}.
            </p>
          )}
        </header>
        {loosePhase === "skeleton" && <HomeSkeleton />}
        {projects &&
          (!hero || !fig ? (
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
          ))}
      </div>
      {hasRightColumn && (
        // Under 1280 px a column holding only a hidden Needs You would still add the grid's gap.
        // From there it is no taller than the window under the header, and scrolls on its own, so
        // its last card stays in reach while the Loose Ends scroll. Its 4 px of padding, taken back
        // by the margin, keep the cards' edges from being clipped by the scroll box.
        <aside
          className={cn(
            "flex min-w-0 flex-col gap-8 xl:sticky xl:top-7 xl:-m-1 xl:max-h-[calc(100dvh-6.5rem)] xl:overflow-y-auto xl:p-1",
            !issuesShown && "max-xl:hidden",
          )}
        >
          <NeedsYou waiting={needs.waiting} busy={needs.busy} quiet={needs.quiet} now={now} />
          {issuesPhase === "skeleton" ? <ReadyToStartSkeleton /> : <ReadyToStart groups={issues} />}
        </aside>
      )}
    </div>
  );
}
