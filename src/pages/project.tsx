import { useState, type ReactNode } from "react";
import { openExternal } from "@/bridge";
import { Action, SplitAction } from "@/components/action";
import { Activity, AreaName, AreaSwatch, Badge, Diff, Field, Gauge, GroupBadge, Hint, ProjectAvatar, StatusMark, useNow, When } from "@/components/bits";
import { Icon } from "@/components/icon";
import { Bar, useSkeleton } from "@/components/loading";
import { failed } from "@/components/toast";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { fileLines, status } from "@/lib/home";
import { AREA_COLORS, areaFilters, drift, earlierSessions, filterKey, focusDrift, group, lastSession, openRows, recentSessions, type AreaColor, type OpenRow } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { Project as ProjectData } from "@/types";

// A Project page (DESIGN.md § Layout), shaped like Vercel's Project Overview: a header with who the
// Project is and its actions, then Where You Left Off answers "what was done here, and what is
// left?", then the Sessions open, the Issues, the Earlier Sessions, Git and Focus.

/** The page's breadcrumb, Area / Project: the Area leads back to Projects filtered by it. */
function ProjectBreadcrumb({ project }: { project: ProjectData }) {
  const setAreaFilter = useStore((s) => s.setAreaFilter);
  const area = project.area;
  return (
    // -ml-2 takes back the Area's padding, so its words line up with the title below.
    <Breadcrumb aria-label="Breadcrumb" className="-ml-2 min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1 type-label-14">
        <BreadcrumbItem className="min-w-0">
          {/* A page here, not a URL: the Area is a button that sets the Projects filter. */}
          <BreadcrumbLink
            render={<button type="button" onClick={() => setAreaFilter(area ? { kind: "area", name: area.name } : { kind: "unsorted" })} />}
            className="flex h-8 min-w-0 items-center rounded-md px-2 text-text-2 duration-150 hover:bg-alpha-100 hover:text-foreground"
          >
            <span className="truncate">{area?.name ?? "Unsorted"}</span>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {/* Vercel's slash rather than the generated chevron. */}
        <BreadcrumbSeparator>/</BreadcrumbSeparator>
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="truncate px-2 font-medium">{project.name}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** A Panel: its title over a 12 px card. */
function Panel({ title, count, children, className }: { title: string; count?: number; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3", className)}>
      <h2 className="flex items-center gap-2 type-label-14 font-medium">
        {title}
        {count !== undefined && <span className="type-label-13 text-muted-foreground tabular-nums">{count}</span>}
      </h2>
      <div className="flex min-w-0 flex-col rounded-xl material-small">{children}</div>
    </section>
  );
}

// Rows inside one card are separated by the edge colour on their top side.
const ROW = "flex min-w-0 items-center gap-3 px-4 py-3 not-first:shadow-[0_-1px_0_0_var(--ud-line)]";

/** What a card says when it has nothing to list. */
function None({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 type-label-13 text-muted-foreground">{children}</p>;
}

function WhereYouLeftOff({ project, now }: { project: ProjectData; now: Date }) {
  const gitPhase = useSkeleton(!useStore((s) => s.read.git));
  const last = lastSession(project);
  const st = last?.open && status(last.open, now);
  const left = project.repo && (project.repo.changed > 0 || (project.repo.unpushed ?? 0) > 0);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-label-14 font-medium">Where You Left Off</h2>
      <div className="flex flex-col gap-6 rounded-xl p-6 material-small">
        <Activity project={project} now={now} />
        <dl className="grid grid-cols-3 gap-x-6 gap-y-4">
          <Field label="Drift">
            <GroupBadge group={group(project, now)} />
            <span className="type-label-13-mono text-text-2 tabular-nums">{drift(project, now)}</span>
          </Field>
          <Field label="Last Activity">{project.lastActivity ? <When iso={project.lastActivity} now={now} /> : <span className="text-muted-foreground">None</span>}</Field>
          <Field label="Area">
            <AreaName project={project} />
          </Field>
          <Field label="Last Session" className="col-span-2">
            {last ? <span className="truncate">{last.session.title}</span> : <span className="text-muted-foreground">No Session yet</span>}
            {st && <StatusMark status={st} />}
          </Field>
          <Field label="Changes">
            {gitPhase !== "ready" ? (
              gitPhase === "skeleton" && <Bar className="h-4 w-24" />
            ) : !project.repo ? (
              <span className="text-muted-foreground">Not a git repository</span>
            ) : left ? (
              <Diff project={project} />
            ) : (
              <span className="text-muted-foreground">Nothing left behind</span>
            )}
          </Field>
          {last?.session.lastPrompt && (
            <Field label="Last Prompt" className="col-span-3">
              <span className="line-clamp-3 type-copy-14 text-text-2">“{last.session.lastPrompt}”</span>
            </Field>
          )}
        </dl>
      </div>
    </section>
  );
}

// Menu rows take Geist's 36 px height and 6 px radius, the same as the other menus, so a row is
// as easy a target here as anywhere in the window.
const MENU_ROW = "h-9 gap-2 rounded-md px-2 text-sm";

/** Resume the last Session, the page's only primary button; its menu starts a new Session or
 * resumes one of the week's earlier ones. With no Session yet, New Session takes its place. */
function ResumeAction({ project, now }: { project: ProjectData; now: Date }) {
  const resume = useStore((s) => s.resume);
  const newSession = useStore((s) => s.newSession);
  const last = lastSession(project)?.session;
  if (!last) {
    return (
      <Action variant="primary" size="medium" onClick={() => newSession(project.path)}>
        <Icon name="start" /> New Session
      </Action>
    );
  }
  const recent = recentSessions(project, now);
  return (
    <SplitAction
      onClick={() => resume(project.path, last.id)}
      menuLabel="More Sessions"
      menu={
        <>
          <DropdownMenuItem onClick={() => newSession(project.path)} className={MENU_ROW}>
            <Icon name="start" className="text-muted-foreground" />
            New Session
          </DropdownMenuItem>
          {recent.length > 0 && (
            <>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 pt-1.5 pb-1 type-label-12 font-normal text-muted-foreground">Last 7 Days</DropdownMenuLabel>
                {recent.map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => resume(project.path, s.id)} className={MENU_ROW} aria-label={`Resume ${s.title}`}>
                    <Icon name="resume" className="text-muted-foreground" />
                    <span className="grow truncate">{s.title}</span>
                    <When iso={s.lastActivity} now={now} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}
        </>
      }
    >
      <Icon name="resume" /> Resume
    </SplitAction>
  );
}

/** The Area as a Badge beside the title – its swatch and its name, Unsorted in the Parked grey –
 * and the menu that files the Project (GLOSSARY.md § Area): every Area there is, Unsorted, then
 * New Area…. The radio's values are the rail's filter keys, so a name is never mistaken for a kind. */
function AreaBadge({ project }: { project: ProjectData }) {
  const projects = useStore((s) => s.projects) ?? [];
  const setArea = useStore((s) => s.setArea);
  const [creating, setCreating] = useState(false);
  const areas = areaFilters(projects).filter((o) => o.filter.kind === "area");
  const current = filterKey(project.area ? { kind: "area", name: project.area.name } : { kind: "unsorted" });
  const choose = (key: string) => {
    const chosen = areas.find((o) => filterKey(o.filter) === key);
    setArea(project.path, chosen?.color ? { name: chosen.label, color: chosen.color } : null);
  };
  return (
    <>
      <DropdownMenu>
        {/* A Geist select: the chevron shows on hover, and the trigger draws the double ring itself. */}
        <DropdownMenuTrigger
          aria-label={`Area: ${project.area?.name ?? "Unsorted"}`}
          className="group rounded-full transition-shadow duration-150 focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]"
        >
          <Badge className="bg-secondary text-text-2 group-hover:bg-alpha-200">
            <AreaSwatch color={project.area?.color} className="size-2" />
            {project.area?.name ?? "Unsorted"}
            <Icon name="chevron" className="-mr-1 size-3 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-aria-expanded:opacity-100" />
          </Badge>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 rounded-xl p-1 ring-0 shadow-(--ud-shadow-menu)">
          <DropdownMenuRadioGroup value={current} onValueChange={choose}>
            {areas.map((o) => (
              <DropdownMenuRadioItem key={o.label} value={filterKey(o.filter)} className={MENU_ROW}>
                <AreaSwatch color={o.color} className="size-2.5" />
                {o.label}
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuRadioItem value="unsorted" className={MENU_ROW}>
              <AreaSwatch color={undefined} className="size-2.5" />
              Unsorted
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem onClick={() => setCreating(true)} className={MENU_ROW}>
            New Area…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewAreaDialog open={creating} onOpenChange={setCreating} onCreate={(name, color) => setArea(project.path, { name, color })} />
    </>
  );
}

/** New Area…: a name and a colour from the Area palette, on Geist's modal material as Find is. A
 * name already in use files the Project under that Area – the bridge finds it by name. */
function NewAreaDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; onCreate: (name: string, color: AreaColor) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<AreaColor>(AREA_COLORS[0]);
  const ready = name.trim().length > 0;
  const create = () => {
    if (!ready) return;
    onCreate(name.trim(), color);
    onOpenChange(false);
    setName("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-5 rounded-xl bg-card p-5 ring-0 shadow-(--ud-shadow-modal) sm:max-w-sm">
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="type-heading-16">New Area</DialogTitle>
          <DialogDescription className="type-copy-14 text-text-2">A theme to file Projects under. It exists while it holds one.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Area name" className="h-9 edge border-0 bg-card px-3 focus-visible:ring-0 focus-visible:shadow-[0_0_0_1px_var(--ud-line),0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]" />
          <div role="radiogroup" aria-label="Colour" className="flex gap-1">
            {AREA_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                className={cn("flex size-8 items-center justify-center rounded-md transition-colors duration-150 hover:bg-alpha-100", color === c && "bg-alpha-200")}
              >
                <AreaSwatch color={c} className="size-3.5" />
              </button>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Action variant="secondary" size="medium" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Action>
            <Action variant="primary" size="medium" type="submit" disabled={!ready}>
              Create
            </Action>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The page header, as on Vercel's Project Overview: who the Project is and what runs on it on the
 * left, its actions on the right. The name truncates before anything else gives way, so the
 * actions never wrap under it. */
function ProjectHeader({ project, rows, now }: { project: ProjectData; rows: OpenRow[]; now: Date }) {
  const repo = project.repo;
  const phase = useGitHubPhase(project);
  return (
    <header className="flex min-w-0 flex-col gap-1">
      <ProjectBreadcrumb project={project} />
      <div className="flex min-w-0 items-center gap-3">
        <ProjectAvatar name={project.name} color={project.area?.color} />
        <h1 className="min-w-0 truncate type-heading-24">{project.name}</h1>
        <AreaBadge project={project} />
        {/* The most pressing Status leads, so two Sessions open wear Busy's colour when one is busy. */}
        {rows.length > 0 && <StatusMark status={rows[0].status} label={rows.length > 1 ? `${rows.length} Sessions open` : undefined} />}
        <div className="ml-auto flex shrink-0 items-center gap-2 pl-3">
          <ResumeAction project={project} now={now} />
          {repo?.github && (
            <Action variant="secondary" size="medium" onClick={() => openExternal(`https://github.com/${repo.github}`).catch((e) => failed("open GitHub", e))}>
              <Icon name="profile" /> Open on GitHub
            </Action>
          )}
        </div>
      </div>
      {/* The description comes with the Issues, from `gh`; its line is held until then. */}
      {phase === "skeleton" && repo?.github && !repo.description && <Bar className="my-0.5 h-4 w-96 max-w-full" />}
      {repo?.description && <p className="max-w-3xl type-copy-14 text-text-2">{repo.description}</p>}
    </header>
  );
}

/** Every open Session, one row each. No button: a Session already runs in its own window, and
 * Undrift observes it, never drives it. */
function SessionsOpen({ rows, now }: { rows: OpenRow[]; now: Date }) {
  if (rows.length === 0) return null;
  return (
    <Panel title="Sessions Open" count={rows.length}>
      {rows.map((r) => (
        <div key={r.open.id} className={ROW}>
          <span className={cn("grow truncate type-label-14", !r.title && "text-muted-foreground")}>{r.title ?? "No title yet"}</span>
          <StatusMark status={r.status} />
          {r.open.statusSince && <When iso={r.open.statusSince} now={now} />}
          <span className="type-label-13 text-muted-foreground">{r.where}</span>
        </div>
      ))}
    </Panel>
  );
}

/** Rows in Skeletons, in a card whose content is not read yet; blank for the first 200 ms, at the
 * height of one row, so the card neither flashes nor jumps. */
function RowsSkeleton({ phase }: { phase: "blank" | "skeleton" }) {
  if (phase === "blank") return <div aria-hidden="true" className="h-11" />;
  return [0, 1, 2].map((i) => (
    <div key={i} aria-hidden="true" className={ROW}>
      <Bar className="h-4 w-8" />
      <Bar className="h-4 grow" />
    </div>
  ));
}

/** Whether a Project's Issues and description are known: git says whether it is on GitHub, then
 * `gh` says what is there. A Project off GitHub has none to wait for. */
function useGitHubPhase(project: ProjectData) {
  const read = useStore((s) => s.read);
  return useSkeleton(!read.git || (!!project.repo?.github && !read.github));
}

function Issues({ project, now }: { project: ProjectData; now: Date }) {
  const start = useStore((s) => s.start);
  const phase = useGitHubPhase(project);
  const issues = [...project.issues].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return (
    <Panel title="Issues" count={phase === "ready" ? issues.length : undefined}>
      {phase !== "ready" ? (
        <RowsSkeleton phase={phase} />
      ) : issues.length === 0 ? (
        <None>{project.repo?.github ? "No open Issue." : "No GitHub repository, so no Issues."}</None>
      ) : (
        issues.map((issue) => (
          // The row lights up as a whole and its Start has no frame, so the titles read first.
          <div key={issue.url} className={cn(ROW, "py-2 transition-colors duration-150 hover:bg-alpha-100")}>
            <span className="type-label-13-mono text-muted-foreground tabular-nums">#{issue.number}</span>
            <span className="grow truncate type-label-14">{issue.title}</span>
            <When iso={issue.updatedAt} now={now} />
            {issue.blockedBy > 0 ? (
              // Listed, since it is the Project's, but not offered: its blockers come first.
              <Hint label={`Blocked by ${issue.blockedBy} open ${issue.blockedBy === 1 ? "Issue" : "Issues"}`}>
                <span className="px-2 type-label-13 text-muted-foreground">Blocked</span>
              </Hint>
            ) : (
              <Action variant="tertiary" size="small" onClick={() => start(project.path, issue.number)} aria-label={`Start #${issue.number}`}>
                <Icon name="start" /> Start
              </Action>
            )}
          </div>
        ))
      )}
    </Panel>
  );
}

function EarlierSessions({ project, now }: { project: ProjectData; now: Date }) {
  const resume = useStore((s) => s.resume);
  const sessions = earlierSessions(project);
  return (
    <Panel title="Earlier Sessions" count={sessions.length}>
      {sessions.length === 0 ? (
        <None>No earlier Session.</None>
      ) : (
        sessions.map((s) => (
          <div key={s.id} className={ROW}>
            <span className="flex min-w-0 grow flex-col">
              <span className="truncate type-label-14">{s.title}</span>
              {s.lastPrompt && <span className="truncate type-copy-13 text-text-2">“{s.lastPrompt}”</span>}
            </span>
            <When iso={s.lastActivity} now={now} />
            <Action variant="secondary" size="small" onClick={() => resume(project.path, s.id)} aria-label={`Resume ${s.title}`}>
              <Icon name="resume" /> Resume
            </Action>
          </div>
        ))
      )}
    </Panel>
  );
}

/** A list inside the Git card: its title and count, then its rows. */
function GitList({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 px-4 py-3 not-first:shadow-[0_-1px_0_0_var(--ud-line)]">
      <h3 className="flex items-center gap-2 type-label-13 font-medium">
        {title}
        <span className="text-muted-foreground tabular-nums">{count}</span>
      </h3>
      {children}
    </div>
  );
}

/** What was done and what is left, in git's words: the commits not pushed by subject, newest
 * first, and the files changed by name – never their contents (AGENTS.md § Privacy contract). */
function Git({ project, now }: { project: ProjectData; now: Date }) {
  const repo = project.repo;
  const phase = useSkeleton(!useStore((s) => s.read.git));
  if (phase !== "ready") {
    return (
      <Panel title="Git">
        <RowsSkeleton phase={phase} />
      </Panel>
    );
  }
  if (!repo) {
    return (
      <Panel title="Git">
        <None>Not a git repository.</None>
      </Panel>
    );
  }
  const more = repo.changed - repo.files.length;
  const moreCommits = (repo.unpushed ?? 0) - repo.commits.length;
  return (
    <Panel title="Git">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4">
        <Field label="Branch">
          <Icon name="branch" size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate type-label-13-mono">{repo.branch}</span>
        </Field>
        <Field label="Repository">
          {repo.github ? (
            <button
              type="button"
              onClick={() => void openExternal(`https://github.com/${repo.github}`)}
              className="flex min-w-0 items-center gap-1.5 rounded-sm type-label-13-mono text-accent-text hover:underline focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]"
            >
              <span className="truncate">{repo.github}</span>
              <Icon name="profile" size={14} className="shrink-0" />
            </button>
          ) : (
            <span className="text-muted-foreground">Not on GitHub</span>
          )}
        </Field>
        <Field label="Last Commit" className="col-span-2">
          {repo.headSubject !== null && repo.headAt ? (
            <>
              <span className="truncate">{repo.headSubject}</span>
              <When iso={repo.headAt} now={now} />
            </>
          ) : (
            <span className="text-muted-foreground">No commit yet</span>
          )}
        </Field>
      </dl>
      <div className="flex min-w-0 flex-col shadow-[0_-1px_0_0_var(--ud-line)]">
        <GitList title="Commits Not Pushed" count={repo.unpushed ?? 0}>
          {repo.unpushed === null ? (
            <p className="type-label-13 text-muted-foreground">No remote to push to.</p>
          ) : repo.commits.length === 0 ? (
            <p className="type-label-13 text-muted-foreground">Everything is pushed.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {repo.commits.map((subject, i) => (
                <li key={i} className="flex min-w-0 items-center gap-2 type-label-13 text-text-2">
                  <Icon name="commit" size={14} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{subject || "No message"}</span>
                </li>
              ))}
              {moreCommits > 0 && <li className="type-label-13 text-muted-foreground tabular-nums">{moreCommits} more</li>}
            </ul>
          )}
        </GitList>
        <GitList title="Changed Files" count={repo.changed}>
          {repo.files.length === 0 ? (
            <p className="type-label-13 text-muted-foreground">Nothing left uncommitted.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {repo.files.map((f) => (
                <li key={f.path} className="flex min-w-0 items-center gap-3 type-label-13-mono">
                  <span className="grow truncate text-text-2">{f.path}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{fileLines(f)}</span>
                </li>
              ))}
              {more > 0 && <li className="type-label-13 text-muted-foreground tabular-nums">{more} more</li>}
            </ul>
          )}
        </GitList>
      </div>
    </Panel>
  );
}

/** Focus, read-only: the Drift from the intention – the days since choosing, and how many of them
 * had Activity (GLOSSARY.md § Focus). Focus is chosen in config.json for now. */
function Focus({ project, now }: { project: ProjectData; now: Date }) {
  const f = focusDrift(project, now);
  return (
    <Panel title="Focus">
      {!f || !project.focusSince ? (
        <None>Not in Focus. Focus is chosen in config.json for now.</None>
      ) : (
        <div className="flex items-center gap-4 px-4 py-4">
          <Gauge value={f.active} max={f.days} label={`${f.active} of ${f.days} days with Activity`} />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="type-label-14">
              <strong>{f.active}</strong> of {f.days} {f.days === 1 ? "day" : "days"} had Activity
              {f.capped && " in the last 30"}
            </p>
            <p className="type-label-13 text-muted-foreground">
              In Focus since {new Date(project.focusSince).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function Project({ project }: { project: ProjectData }) {
  const now = useNow();
  const rows = openRows(project, now);
  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <ProjectHeader project={project} rows={rows} now={now} />
      <WhereYouLeftOff project={project} now={now} />
      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-8">
          <SessionsOpen rows={rows} now={now} />
          <Issues project={project} now={now} />
          <EarlierSessions project={project} now={now} />
        </div>
        <div className="flex min-w-0 flex-col gap-8">
          <Git project={project} now={now} />
          <Focus project={project} now={now} />
        </div>
      </div>
    </div>
  );
}
