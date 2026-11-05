import { Action } from "@/components/action";
import { Key } from "@/components/bits";
import { Badge, Caps, PostIt } from "@/components/planner";
import { cn } from "@/lib/utils";
import { BOARD, PROJECTS, SPRINT, type ProjectRow } from "@/mocks/day";
import { useStore } from "@/store";

function Avatar({ p, size = 28 }: { p: ProjectRow; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center font-semibold text-white"
      style={{ background: p.color, width: size, height: size, borderRadius: size / 4, fontSize: size < 30 ? 11 : 13 }}
    >
      {p.initials}
    </div>
  );
}

function Week({ days }: { days: number[] }) {
  return (
    <span className="flex gap-[3px]">
      {days.map((d, i) => (
        <i key={i} className={cn("size-3.5 rounded-[3px]", d ? "bg-mark" : "bg-alpha-400")} />
      ))}
    </span>
  );
}

// Every Project at a glance, grouped by what it asks: the Sprint, the ones behind their rhythm,
// the ones on it. A row opens the Project's page.
export function Projects() {
  const { project, openProject } = useStore();
  const open = PROJECTS.find((p) => p.id === project);
  if (open) return <ProjectPage p={open} />;

  const groups = ["Sprint", "Behind Their Rhythm", "On Rhythm"] as const;
  return (
    <div className="flex flex-col gap-[18px] px-8 py-7">
      <div className="flex items-end">
        <div className="grow">
          <h1 className="type-heading-24">Projects</h1>
          <p className="type-label-13 text-muted-foreground">
            {PROJECTS.length} projects · <strong className="font-medium text-foreground">Sprint: {SPRINT.project}</strong> · 2 behind their rhythm · 2 pull requests to review
          </p>
        </div>
        <Action variant="secondary" size="small">
          New Project
        </Action>
      </div>
      <section className="rounded-xl px-2 pt-3.5 pb-1 material-small">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left type-label-12 text-muted-foreground">
              {["Project", "Rhythm", "Last 7 days", "Last touch", "State", "Next"].map((h) => (
                <th key={h} className="px-3 pb-2 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <ProjectGroup key={g} title={g} rows={PROJECTS.filter((p) => p.group === g)} onOpen={openProject} />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ProjectGroup({ title, rows, onOpen }: { title: string; rows: ProjectRow[]; onOpen: (id: string) => void }) {
  return (
    <>
      <tr>
        <td colSpan={6} className="px-3 pt-[18px] pb-1.5">
          <Caps>{title}</Caps>
        </td>
      </tr>
      {rows.map((p) => (
        <tr key={p.id} onClick={() => onOpen(p.id)} className="cursor-pointer border-t border-border hover:bg-alpha-100">
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-3">
              <Avatar p={p} />
              <div>
                <div className="type-label-14 font-medium">{p.name}</div>
                <div className="type-label-12 text-muted-foreground">{p.kind}</div>
              </div>
            </div>
          </td>
          <td className="px-3 type-label-13 text-muted-foreground">{p.rhythm}</td>
          <td className="px-3">
            <Week days={p.week} />
          </td>
          <td className="px-3 text-[14px] text-text-2">{p.last}</td>
          <td className="px-3">{p.state && <Badge tone={p.state.tone}>{p.state.text}</Badge>}</td>
          <td className="max-w-[300px] truncate px-3 text-[14px] text-text-2">{p.next}</td>
        </tr>
      ))}
    </>
  );
}

/** A Project's page: its board in post-its, its Reprise card, git, and this machine's Sessions. */
function ProjectPage({ p }: { p: ProjectRow }) {
  const openProject = useStore((s) => s.openProject);
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-8 py-[22px]">
      <div>
        <p className="mb-2 type-label-12 text-muted-foreground">
          <button type="button" onClick={() => openProject(null)} className="hover:text-foreground">
            Projects
          </button>{" "}
          / <span className="text-foreground">{p.name}</span>
        </p>
        <div className="flex items-center gap-3">
          <Avatar p={p} size={44} />
          <div className="grow">
            <h1 className="type-heading-24">{p.name}</h1>
            <p className="type-label-13 text-muted-foreground">
              The family organizer – Tasks and Events for two adults · <span className="font-mono">mcinarpro/home-sweet-plan</span>
            </p>
          </div>
          <Action variant="secondary" size="small">
            Sprint ▾
          </Action>
          <Action variant="secondary" size="small">
            Open in: Undrift ▾
          </Action>
          <Action size="small">
            Resume <Key>↵</Key>
          </Action>
        </div>
      </div>
      <div className="grid min-h-0 grow grid-cols-[1fr_360px] gap-5">
        <section className="dotted grid min-h-0 grid-cols-4 overflow-hidden rounded-xl material-small">
          {(Object.keys(BOARD) as (keyof typeof BOARD)[]).map((col, i) => (
            <div key={col} className={cn("flex min-w-0 flex-col gap-3.5 p-3", i > 0 && "border-l border-dashed border-line-strong")}>
              <div className="text-[13px] font-medium">
                {col} <span className="font-normal text-muted-foreground">{col === "Done" ? 12 : BOARD[col].length}</span>
              </div>
              {BOARD[col].map((n) => (
                <PostIt key={n.id} note={n} faded={n.faded} className="min-h-[104px]" />
              ))}
            </div>
          ))}
        </section>
        <div className="flex flex-col gap-3.5">
          <section className="flex flex-col gap-3 rounded-xl p-[18px] material-small">
            <div className="flex items-center gap-2">
              <h2 className="type-label-14 font-medium">Reprise</h2>
              <span className="type-label-12 text-muted-foreground">yesterday · linux-desk</span>
            </div>
            <dl className="grid grid-cols-[70px_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-muted-foreground">Done</dt>
              <dd>#94 in review · Child model and migration</dd>
              <dt className="text-muted-foreground">Next</dt>
              <dd className="font-medium">Finish #98 – the Events list test is red</dd>
              <dt className="text-muted-foreground">Blocked</dt>
              <dd>—</dd>
            </dl>
          </section>
          <section className="grid grid-cols-2 gap-3 rounded-xl p-[18px] material-small">
            <div>
              <div className="type-label-12 text-muted-foreground">Branch</div>
              <div className="truncate font-mono text-[13px]">98-children-on-the-plan</div>
            </div>
            <div>
              <div className="type-label-12 text-muted-foreground">Changed · Unpushed</div>
              <div>5 · 2</div>
            </div>
            <div className="col-span-2 font-mono text-[13px]">
              <span className="text-muted-foreground">c81f0a2</span> feat(server): a Child in the Family (#98)
            </div>
          </section>
          <section className="flex flex-col gap-2.5 rounded-xl p-[18px] material-small">
            <h2 className="type-label-14 font-medium">Sessions on This Machine</h2>
            <SessionRow title="Children on the plan" sub="open · waiting on you" live action="Show" />
            <SessionRow title="Filter chips" sub="yesterday · 38 turns" action="Resume" />
          </section>
        </div>
      </div>
    </div>
  );
}

function SessionRow({ title, sub, live, action }: { title: string; sub: string; live?: boolean; action: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("size-2 rounded-full", live ? "bg-mark" : "shadow-[inset_0_0_0_1.5px_var(--ud-muted)]")} />
      <div className="grow">
        <div className="text-[13.5px]">{title}</div>
        <div className="type-label-12 text-muted-foreground">{sub}</div>
      </div>
      <Action variant="secondary" size="small">
        {action}
      </Action>
    </div>
  );
}
