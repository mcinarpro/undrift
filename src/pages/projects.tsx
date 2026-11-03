import type { ReactNode } from "react";
import { openExternal } from "@/bridge";
import { Action } from "@/components/action";
import { AreaSwatch, Empty, FocusBadge, GROUP_DOT, GroupBadge, GroupDot, ProjectAvatar, Segmented, StatusMark, useNow, When } from "@/components/bits";
import { DriftStrip } from "@/components/drift-strip";
import { Icon } from "@/components/icon";
import { failed } from "@/components/toast";
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
import { driftCells } from "@/lib/home";
import {
  areaFilters,
  changes,
  filterKey,
  group,
  groupFilters,
  groupKey,
  inGroup,
  matches,
  openStatuses,
  sorted,
  SORTS,
  type AreaFilter,
  type GroupFilter,
  type Sort,
} from "@/lib/projects";
import { cn } from "@/lib/utils";
import { useStore, type View } from "@/store";
import type { Project } from "@/types";

// Projects (DESIGN.md § Layout): every Project as Vercel's project card or as a row, narrowed by a
// rail of filters with their counts. A card or a row opens the Project's page.

const ALL_AREAS: AreaFilter = { kind: "all" };
const ALL_GROUPS: GroupFilter = { kind: "all" };

const RING = "focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]";

// Geist's menu rows: 36 px, 6 px radius, 14 px text.
const MENU_ROW = "h-9 gap-2 rounded-md px-2 text-sm";
const MENU = "rounded-xl p-1 ring-0 shadow-(--ud-shadow-menu)";

/** One choice of the rail, on `alpha-200` while it is current, as the header's tabs are. A toggle:
 * choosing the current one again gives its section back to All. */
function RailItem({ current, marker, label, count, onClick }: { current: boolean; marker?: ReactNode; label: string; count: number; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={current}
        onClick={onClick}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md px-2.5 type-label-14 transition-colors duration-150",
          current ? "bg-alpha-200 text-foreground" : "text-text-2 hover:bg-alpha-100 hover:text-foreground",
        )}
      >
        {marker}
        <span className="grow truncate text-left">{label}</span>
        <span className="type-label-13 text-muted-foreground tabular-nums">{count}</span>
      </button>
    </li>
  );
}

function RailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-2.5 type-label-12 text-muted-foreground uppercase">{title}</h2>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}

/** Keeps the rows without a dot or a swatch in line with those that have one. */
const NO_MARKER = <span aria-hidden="true" className="size-2.5 shrink-0" />;

/** The page's own rail: All with the groups, the Loose Ends and the Focus, then the Areas. One
 * choice per section, and the two combine; each count says what choosing it would show. */
function Rail({ projects, area, grp, now }: { projects: Project[]; area: AreaFilter; grp: GroupFilter; now: Date }) {
  const setFilters = useStore((s) => s.setFilters);
  const groups = groupFilters(projects, now, (p) => matches(p, area));
  // The rail's All stands for both sections, so the Areas' own All is left out.
  const areas = areaFilters(projects, (p) => inGroup(p, grp, now)).slice(1);
  const pick = <T,>(current: T, chosen: T, key: (f: T) => string, all: T) => (key(current) === key(chosen) ? all : chosen);
  return (
    <nav aria-label="Filters" className="sticky top-0 flex max-h-[calc(100dvh-3rem)] w-60 shrink-0 flex-col gap-6 self-start overflow-y-auto py-8 pl-6">
      {/* All heads the first section rather than standing alone above it. */}
      <RailSection title="Groups">
        <RailItem
          current={area.kind === "all" && grp.kind === "all"}
          marker={NO_MARKER}
          label="All"
          count={projects.length}
          onClick={() => setFilters({ area: ALL_AREAS, group: ALL_GROUPS })}
        />
        {groups.map((o) => (
          <RailItem
            key={groupKey(o.filter)}
            current={groupKey(o.filter) === groupKey(grp)}
            marker={o.filter.kind === "group" ? <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", GROUP_DOT[o.filter.group])} /> : NO_MARKER}
            label={o.label}
            count={o.count}
            onClick={() => setFilters({ group: pick(grp, o.filter, groupKey, ALL_GROUPS) })}
          />
        ))}
      </RailSection>
      {areas.length > 0 && (
        <RailSection title="Areas">
          {areas.map((o) => (
            <RailItem
              key={filterKey(o.filter)}
              current={filterKey(o.filter) === filterKey(area)}
              marker={<AreaSwatch color={o.color} className="size-2.5" />}
              label={o.label}
              count={o.count}
              onClick={() => setFilters({ area: pick(area, o.filter, filterKey, ALL_AREAS) })}
            />
          ))}
        </RailSection>
      )}
    </nav>
  );
}

/** Sort, a secondary button that opens the three orders, the one in use ticked. */
function SortMenu({ sort, onChange }: { sort: Sort; onChange: (sort: Sort) => void }) {
  const label = SORTS.find((s) => s.value === sort)!.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Action variant="secondary" size="small" aria-label={`Sort by ${label}`} />}>
        <Icon name="sort" className="text-muted-foreground" />
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn("w-48", MENU)}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 pt-1.5 pb-1 type-label-12 font-normal text-muted-foreground">Sort By</DropdownMenuLabel>
          {/* The generated radio item draws the tick on the order in use. */}
          <DropdownMenuRadioGroup value={sort} onValueChange={(v: Sort) => onChange(v)}>
            {SORTS.map((s) => (
              <DropdownMenuRadioItem key={s.value} value={s.value} className={MENU_ROW}>
                {s.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Resume the last Session, open a new one, or open the repository on GitHub. What the Project
 * cannot do stays in the menu, greyed, so the menu keeps its shape from card to card. */
function ProjectMenu({ project }: { project: Project }) {
  const resume = useStore((s) => s.resume);
  const newSession = useStore((s) => s.newSession);
  const last = project.sessions[0];
  const github = project.repo?.github;
  return (
    <DropdownMenu>
      {/* Above the card's stretched button, so a click here never opens the Project page. */}
      <DropdownMenuTrigger
        aria-label={`More for ${project.name}`}
        className={cn("relative z-10 -my-1 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-150 hover:bg-alpha-200", RING)}
      >
        <Icon name="more" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn("w-48", MENU)}>
        <DropdownMenuItem disabled={!last} onClick={() => last && resume(project.path, last.id)} className={MENU_ROW}>
          <Icon name="resume" className="text-muted-foreground" />
          Resume
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => newSession(project.path)} className={MENU_ROW}>
          <Icon name="start" className="text-muted-foreground" />
          New Session
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuItem
          disabled={!github}
          onClick={() => github && openExternal(`https://github.com/${github}`).catch((e) => failed("open GitHub", e))}
          className={MENU_ROW}
        >
          <Icon name="profile" className="text-muted-foreground" />
          Open on GitHub
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const Sep = () => <span aria-hidden="true">·</span>;

function ProjectCard({ project, now }: { project: Project; now: Date }) {
  const openProject = useStore((s) => s.openProject);
  const repo = project.repo;
  const changed = changes(repo);
  const issues = project.issues.length;
  return (
    // The name's button stretches over the card, so the card opens the Project page while the menu
    // stays a button of its own. A material is a shadow, which hides the base focus ring, so the
    // card draws the double ring while that button has focus; a hovered card lays a line-strong
    // ring over the edge and keeps the drop.
    <article className="relative flex min-w-0 flex-col gap-3 rounded-md p-4 material-small transition-shadow duration-150 hover:shadow-[0_0_0_1px_var(--ud-line-strong),var(--ud-shadow-small)] has-[[data-open]:focus-visible]:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]">
      <header className="flex w-full min-w-0 items-center gap-3">
        <ProjectAvatar name={project.name} color={project.area?.color} />
        <div className="flex min-w-0 grow flex-col">
          <h2 className="flex min-w-0 type-heading-14">
            <button
              type="button"
              data-open
              onClick={() => openProject(project.path)}
              className="truncate text-left focus-visible:shadow-none after:absolute after:inset-0 after:rounded-md"
            >
              {project.name}
            </button>
          </h2>
          <span className="truncate type-label-13-mono text-muted-foreground">{project.shortPath}</span>
        </div>
        {project.focusSince && <FocusBadge />}
        {openStatuses(project, now).map((s) => (
          <StatusMark key={s.status} status={s.status} count={s.count} />
        ))}
        <GroupDot name={project.name} group={group(project, now)} />
        <ProjectMenu project={project} />
      </header>
      <div className="flex w-full min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5 type-label-13 text-text-2">
          <Icon name="commit" size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{repo ? (repo.headSubject ?? "No commit yet") : "Not a git repository"}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 type-label-13 text-muted-foreground">
          {repo && (
            <>
              <Icon name="branch" size={14} className="shrink-0" />
              <span className="truncate font-mono">{repo.branch}</span>
              <Sep />
            </>
          )}
          {project.lastActivity ? <When iso={project.lastActivity} now={now} /> : <span className="whitespace-nowrap">No Activity</span>}
          {changed && (
            <>
              <Sep />
              <span className="whitespace-nowrap font-mono tabular-nums">{changed}</span>
            </>
          )}
          {issues > 0 && (
            <>
              <Sep />
              <span className="whitespace-nowrap tabular-nums">
                {issues} {issues === 1 ? "Issue" : "Issues"}
              </span>
            </>
          )}
        </span>
      </div>
      <DriftStrip cells={driftCells(project.activeDays, now)} className="w-full" />
    </article>
  );
}

/** A row of the list view. Its cells sit on the list's columns through a subgrid, so they line up
 * from row to row whatever each one holds. */
function ProjectRow({ project, now }: { project: Project; now: Date }) {
  const openProject = useStore((s) => s.openProject);
  const repo = project.repo;
  const changed = changes(repo);
  return (
    <li className="col-span-full grid grid-cols-subgrid not-first:shadow-[0_-1px_0_0_var(--ud-line)] first:*:rounded-t-md last:*:rounded-b-md">
      <button
        type="button"
        onClick={() => openProject(project.path)}
        className="col-span-full grid grid-cols-subgrid items-center px-4 py-3 text-left transition-colors duration-150 hover:bg-alpha-100"
      >
        <span className="flex min-w-0 items-center gap-3">
          <ProjectAvatar name={project.name} color={project.area?.color} size={24} />
          <span className="max-w-3/5 shrink-0 truncate type-label-14 font-medium">{project.name}</span>
          <span className="truncate type-label-13-mono text-muted-foreground">{project.shortPath}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 type-label-13 text-text-2">
          <AreaSwatch color={project.area?.color} className="size-2.5" />
          <span className="truncate">{project.area?.name ?? "Unsorted"}</span>
        </span>
        <GroupBadge group={group(project, now)} />
        <span className="flex min-w-0 items-center gap-1.5 type-label-13-mono text-muted-foreground">
          {repo && (
            <>
              <Icon name="branch" size={14} className="shrink-0" />
              <span className="truncate">{repo.branch}</span>
            </>
          )}
        </span>
        <span className="text-right type-label-13-mono text-text-2 tabular-nums">{changed}</span>
        <span className="text-right">{project.lastActivity ? <When iso={project.lastActivity} now={now} /> : <span className="type-label-13 text-muted-foreground">No Activity</span>}</span>
      </button>
    </li>
  );
}

const SORT_NOTE: Record<Sort, string> = {
  drift: "the Drifting ones first",
  activity: "the latest Activity first",
  name: "by name",
};

const GROUP_WORDS: Record<GroupFilter["kind"], string> = {
  all: "",
  group: "",
  looseEnds: "is a Loose End",
  focus: "is in Focus",
};

/** What an empty choice means, in a sentence: *No Project in Mobile is drifting.* */
function nothing(area: AreaFilter, grp: GroupFilter): string {
  const who = area.kind === "area" ? `No Project in ${area.name}` : area.kind === "unsorted" ? "No Unsorted Project" : "No Project";
  const what = grp.kind === "group" ? `is ${grp.group.toLowerCase()}` : GROUP_WORDS[grp.kind];
  return `${who}${what ? ` ${what}` : ""}.`;
}

const VIEWS: { value: View; label: ReactNode; hint: string }[] = [
  {
    value: "grid",
    hint: "Grid",
    label: (
      <>
        <Icon name="grid" />
        <span className="sr-only">Grid</span>
      </>
    ),
  },
  {
    value: "list",
    hint: "List",
    label: (
      <>
        <Icon name="list" />
        <span className="sr-only">List</span>
      </>
    ),
  },
];

export function Projects() {
  const projects = useStore((s) => s.projects);
  const { areaFilter, groupFilter, sort, view, setFilters, setSort, setView } = useStore();
  const now = useNow();
  const all = projects ?? [];
  // An Area left without Projects leaves the rail, so its choice falls back to All: the page never
  // shows nothing with no row to tell why. A group's row stays at 0, so its choice stays too, and
  // the Empty State says what it holds.
  const grp = groupFilter;
  const area = areaFilters(all).some((o) => filterKey(o.filter) === filterKey(areaFilter)) ? areaFilter : ALL_AREAS;
  const shown = sorted(
    all.filter((p) => matches(p, area) && inGroup(p, grp, now)),
    sort,
    now,
  );
  const count = shown.length === all.length ? `${all.length}` : `${shown.length} of ${all.length}`;

  return (
    <div className="flex w-full">
      <Rail projects={all} area={area} grp={grp} now={now} />
      {/* The grid answers to the width left beside the rail, not the window's. */}
      <div className="@container flex min-w-0 grow flex-col gap-6 px-8 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="type-heading-24">Projects</h1>
            {projects && (
              <p className="type-copy-14 text-text-2 tabular-nums">
                {count} {all.length === 1 ? "Project" : "Projects"}, {SORT_NOTE[sort]}.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SortMenu sort={sort} onChange={setSort} />
            <Segmented legend="View" name="view" value={view} options={VIEWS} onChange={setView} icons />
          </div>
        </header>
        {/* Until the bridge's first list, the page holds only its title. */}
        {projects &&
          (all.length === 0 ? (
            <div className="rounded-xl material-small">
              <Empty icon={<Icon name="projects" size={20} />} title="No Projects yet.">
                A git checkout under ~/workspace, or any folder a Session ran in, becomes a Project.
              </Empty>
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-xl material-small">
              <Empty
                icon={<Icon name="projects" size={20} />}
                action={
                  <Action variant="secondary" size="small" onClick={() => setFilters({ area: ALL_AREAS, group: ALL_GROUPS })}>
                    Show All
                  </Action>
                }
              >
                {nothing(area, grp)}
              </Empty>
            </div>
          ) : view === "grid" ? (
            // Two across, three from 1120 px of page, four from 1472 px: a card keeps at least
            // 360 px, the room its header needs for a Focus marker and a Status beside the name.
            <div className="grid grid-cols-2 gap-4 @min-[70rem]:grid-cols-3 @min-[92rem]:grid-cols-4">
              {shown.map((p) => (
                <ProjectCard key={p.path} project={p} now={now} />
              ))}
            </div>
          ) : (
            <ul className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_auto_minmax(0,1fr)_auto_auto] gap-x-6 rounded-md material-small">
              {shown.map((p) => (
                <ProjectRow key={p.path} project={p} now={now} />
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
