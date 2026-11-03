import { AreaSwatch, Empty, FocusBadge, GroupDot, ProjectAvatar, Segmented, useNow, When } from "@/components/bits";
import { DriftStrip } from "@/components/drift-strip";
import { Icon } from "@/components/icon";
import { driftCells } from "@/lib/home";
import { areaFilters, filterKey, group, matches, ordered } from "@/lib/projects";
import { useStore } from "@/store";
import type { Project } from "@/types";

// Projects (DESIGN.md § Layout): every Project as Vercel's project card, filtered by Area. A card
// opens the Project's page.

function ProjectCard({ project, now }: { project: Project; now: Date }) {
  const openProject = useStore((s) => s.openProject);
  const repo = project.repo;
  return (
    // A material is a shadow, which hides the base focus ring, so the card draws the double ring
    // itself; a hovered card lays a line-strong ring over the edge and keeps the drop.
    <button
      type="button"
      onClick={() => openProject(project.path)}
      className="flex min-w-0 flex-col gap-3 rounded-md p-4 text-left material-small transition-shadow duration-150 hover:shadow-[0_0_0_1px_var(--ud-line-strong),var(--ud-shadow-small)] focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]"
    >
      <span className="flex w-full min-w-0 items-center gap-3">
        <ProjectAvatar name={project.name} color={project.area?.color} />
        <span className="flex min-w-0 grow flex-col">
          <span className="truncate type-heading-14">{project.name}</span>
          <span className="truncate type-label-13-mono text-muted-foreground">{project.shortPath}</span>
        </span>
        {project.focusSince && <FocusBadge />}
        <GroupDot name={project.name} group={group(project, now)} />
      </span>
      <span className="flex w-full min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5 type-label-13 text-text-2">
          <Icon name="commit" size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{repo ? (repo.headSubject ?? "No commit yet") : "Not a git repository"}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 type-label-13 text-muted-foreground">
          {repo && (
            <>
              <Icon name="branch" size={14} className="shrink-0" />
              <span className="truncate font-mono">{repo.branch}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          {project.lastActivity ? <When iso={project.lastActivity} now={now} /> : <span>No Activity</span>}
          {repo && repo.changed > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap tabular-nums">{repo.changed} uncommitted</span>
            </>
          )}
        </span>
      </span>
      <DriftStrip cells={driftCells(project.activeDays, now)} className="w-full" />
    </button>
  );
}

export function Projects() {
  const projects = useStore((s) => s.projects);
  const { areaFilter, setAreaFilter } = useStore();
  const now = useNow();
  const options = projects ? areaFilters(projects) : [];
  // A filter on an Area that has since emptied falls back to All, so the page never shows nothing
  // with no way to tell why.
  const current = options.find((o) => filterKey(o.filter) === filterKey(areaFilter)) ?? options[0];
  const shown = projects && current ? ordered(projects.filter((p) => matches(p, current.filter)), now) : [];

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="type-heading-24">Projects</h1>
          {projects && (
            <p className="type-copy-14 text-text-2">
              {projects.length} {projects.length === 1 ? "Project" : "Projects"}, the Drifting ones first.
            </p>
          )}
        </div>
        {options.length > 2 && current && (
          <Segmented
            legend="Area"
            name="area"
            value={filterKey(current.filter)}
            options={options.map((o) => ({
              value: filterKey(o.filter),
              label: (
                <>
                  {o.filter.kind !== "all" && <AreaSwatch color={o.color} className="size-2.5" />}
                  {o.label}
                  <span className="text-muted-foreground tabular-nums">{o.count}</span>
                </>
              ),
            }))}
            onChange={(key) => setAreaFilter(options.find((o) => filterKey(o.filter) === key)!.filter)}
          />
        )}
      </header>
      {/* Until the bridge's first list, the page holds only its title. */}
      {projects &&
        (shown.length === 0 ? (
          <div className="rounded-xl material-small">
            <Empty icon={<Icon name="projects" size={20} />} title="No Projects yet.">
              A git checkout under ~/workspace, or any folder a Session ran in, becomes a Project.
            </Empty>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((p) => (
              <ProjectCard key={p.path} project={p} now={now} />
            ))}
          </div>
        ))}
    </div>
  );
}
