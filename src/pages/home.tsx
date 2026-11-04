import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { m, useMotionValue, type MotionValue } from "motion/react";
import { Action } from "@/components/action";
import { Empty, Gauge, GroupDot, Key, ProjectAvatar, STATUS_DOT, StatusMark, useNow } from "@/components/bits";
import { Icon } from "@/components/icon";
import { Bar, useProjectsRead, useSkeleton } from "@/components/loading";
import { Note, NoteGhost, SessionCard } from "@/components/note";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cellKey, COLUMNS, columnOf, lanes, MAX_LANES, shelf, upNext, type BoardDrag, type Column, type Dragging, type Grip, type Lane, type Pad, type ShelfItem as ShelfEntry, type Target, type UpNext } from "@/lib/board";
import { elapsed, headline, looseEnds, needsYou, type StatusName } from "@/lib/home";
import { openStatuses } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { Issue, Project } from "@/types";

// Home is the Board (ADR 0004, DESIGN.md § Layout): one line that names the thing to pick up, then
// a Lane per Project in Focus with its Issues as Notes in three columns – Ready, Today, Doing – and
// the other Projects on the Shelf beside it. The Board and the Shelf take the window's height and
// scroll on their own, so the Board stays a board. A Note moves forward by drag or by its menu; the
// bridge's next list confirms the move, and until then the Note is kept where it was dropped. A
// folder dragged onto the Board puts its Project in Focus; a tape dragged onto the Shelf takes it
// out.

/** The Lane's head, then the four columns: Today and Done are narrow, since one holds a Note or
 * two by design and the other only what has left, and Doing wide, since a Card is twice a Note. */
const LANE_GRID = "grid grid-cols-[216px_1.2fr_0.8fr_1.3fr_0.75fr]";

/** A cell's padding: room on top for a Card's pin and flag, which stand above its edge. With it a
 * Lane is under 200 px, so four fit a 1080 px window without the Board scrolling. */
const CELL = "px-3 pt-5 pb-3";

const HEADS: Record<Column, string> = { ready: "Ready", today: "Today", doing: "Doing", done: "Done" };

/** What an empty cell says while a Note it may take is lifted: the verb of the drop. Done takes
 * no drop, so its Ghost is never drawn. */
const GHOSTS: Record<Column, string> = {
  ready: "Put it back in Ready",
  today: "Pull it into Today",
  doing: "Start it in a terminal",
  done: "",
};

const SWATCH: Record<Pad, string> = { 1: "bg-pad-1", 2: "bg-pad-2", 3: "bg-pad-3", 4: "bg-pad-4" };

const MENU = "w-52 rounded-xl p-1 ring-0 shadow-(--ud-shadow-menu)";
const ITEM = "h-9 gap-2 rounded-md px-2 text-sm";
const MENU_TRIGGER = "flex size-8 items-center justify-center rounded-md transition-colors duration-150 hover:bg-alpha-200 focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]";

/** A Project's name that opens its page, as a link reads: underlined under the pointer. */
function ProjectLink({ project }: { project: Project }) {
  const openProject = useStore((s) => s.openProject);
  return (
    <span className="min-w-0 truncate type-label-13 font-medium">
      <button type="button" onClick={() => openProject(project.path)} className="max-w-full truncate rounded-sm text-left underline-offset-4 hover:underline">
        {project.name}
      </button>
    </span>
  );
}

/** The Target under a point of the window: the Cell it is over, the Board, the Shelf, or nothing.
 * What is dragged does not catch the pointer (it is hidden, or `pointer-events: none`), so the
 * element found is what lies under it. */
function dropAt(x: number, y: number): Target {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
  if (!el) return null;
  if (el.dataset.drop === "shelf") return "shelf";
  if (el.dataset.drop === "board") return "board";
  const { lane, column } = el.dataset;
  return lane && column ? { lane, column: column as Column } : null;
}

const targetKey = (t: Target) => (t === null ? null : typeof t === "string" ? t : cellKey(t));

/** Where the pointer took hold of an element, and the element's width, for the copy that follows it. */
function grip(el: HTMLElement | null, e: PointerEvent): Grip {
  const r = el?.getBoundingClientRect();
  return r ? { dx: e.clientX - r.left, dy: e.clientY - r.top, width: r.width } : { dx: 0, dy: 0, width: 0 };
}

/** One drag at a time across the Board and the Shelf: what is dragged, the pointer's place, and
 * the Target under it, written only when it changes, since the pointer reports every frame. */
function useBoardDrag(): { dragging: Dragging | null; over: string | null; drag: BoardDrag; px: MotionValue<number>; py: MotionValue<number> } {
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const drag = useMemo<BoardDrag>(
    () => ({
      begin: (d, e) => {
        px.set(e.clientX);
        py.set(e.clientY);
        setDragging(d);
        last.current = null;
      },
      move: (e) => {
        px.set(e.clientX);
        py.set(e.clientY);
        const k = targetKey(dropAt(e.clientX, e.clientY));
        if (k !== last.current) {
          last.current = k;
          setOver(k);
        }
      },
      end: (e) => {
        const at = dropAt(e.clientX, e.clientY);
        setDragging(null);
        setOver(null);
        last.current = null;
        return at;
      },
    }),
    [px, py],
  );
  return { dragging, over, drag, px, py };
}

/** *1 Nov*, the day a Project was put in Focus. */
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** The most pressing Status among a Project's open Sessions, for its tape. */
function pressing(project: Project, now: Date): { status: StatusName; count: number } | undefined {
  const all = openStatuses(project, now);
  return (["Waiting", "Busy", "Quiet"] as StatusName[]).map((s) => all.find((x) => x.status === s)).find(Boolean);
}

/** A Lane's strip of tape: the Lane's pad colour, the Project's avatar and name. */
function Tape({ lane, lifted }: { lane: Lane; lifted?: boolean }) {
  return (
    <span className={cn("flex h-8 max-w-full items-center gap-2 rounded-sm bg-secondary pr-3 pl-2.5 shadow-[0_1px_1px_#0000000f]", lifted && "shadow-(--ud-shadow-menu)")}>
      <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-[2px] shadow-[inset_0_0_0_1px_#00000014]", SWATCH[lane.pad])} />
      <ProjectLink project={lane.project} />
    </span>
  );
}

/** The Lane's head: its tape – dragged onto the Shelf, it takes the Project out of Focus – with
 * a `⋯` of the same, then the Project's Status and its Focus Gauge. */
function LaneHead({ lane, now, drag }: { lane: Lane; now: Date; drag: BoardDrag }) {
  const { project, focus } = lane;
  const { setFocus, openProject, newSession } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const [lifting, setLifting] = useState(false);
  const st = pressing(project, now);
  return (
    <div className={cn("flex flex-col items-start gap-2", CELL)}>
      <div className="flex w-full items-center gap-1">
        <m.div
          ref={ref}
          drag
          dragSnapToOrigin
          dragMomentum={false}
          dragElastic={0}
          onDragStart={(e) => {
            setLifting(true);
            drag.begin({ kind: "lane", lane, grip: grip(ref.current, e as PointerEvent) }, e as PointerEvent);
          }}
          onDrag={(e) => drag.move(e as PointerEvent)}
          onDragEnd={(e) => {
            if (drag.end(e as PointerEvent) === "shelf") setFocus(project.path, false);
          }}
          // The tape itself travels hidden, while its copy follows the pointer beyond the Board's
          // edge; it shows again once it has sprung back.
          onDragTransitionEnd={() => setLifting(false)}
          className={cn("min-w-0 cursor-grab select-none", lifting && "pointer-events-none invisible")}
        >
          <Tape lane={lane} />
        </m.div>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`More for ${project.name}`} className={cn(MENU_TRIGGER, "shrink-0 opacity-0 group-focus-within/lane:opacity-100 group-hover/lane:opacity-100")}>
            <Icon name="more" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={MENU}>
            <DropdownMenuItem onClick={() => openProject(project.path)} className={ITEM}>
              Open Project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => newSession(project.path)} className={ITEM}>
              New Session
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFocus(project.path, false)} className={ITEM}>
              Put back on the Shelf
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {st && <StatusMark status={st.status} count={st.count} />}
      <div className="flex items-center gap-2">
        <Gauge value={focus.active} max={focus.days} size={28} label={`${focus.active} of ${focus.days} days with Activity since ${day(project.focusSince!)}`} />
        <span className="type-label-12 text-muted-foreground tabular-nums">
          of {focus.days} {focus.days === 1 ? "day" : "days"} · since {day(project.focusSince!)}
        </span>
      </div>
    </div>
  );
}

function LaneRow({
  lane,
  now,
  notes,
  dragging,
  over,
  drag,
  onMove,
}: {
  lane: Lane;
  now: Date;
  notes: "blank" | "skeleton" | "ready";
  dragging: Dragging | null;
  over: string | null;
  drag: BoardDrag;
  onMove: (project: Project, issue: Issue, from: Column, to: Column) => void;
}) {
  const { project } = lane;
  return (
    <div className={cn(LANE_GRID, "group/lane border-t border-dashed border-line-strong")}>
      <LaneHead lane={lane} now={now} drag={drag} />
      {COLUMNS.map((column) => {
        const key = cellKey({ lane: project.path, column });
        // Only a Note of this Lane, from another column, can land here – never in Done, which
        // GitHub alone fills: no ring says no. While one is lifted, an empty cell it may land in
        // holds its Ghost; at rest an empty cell is empty.
        const legal = column !== "done" && dragging?.kind === "note" && dragging.lane === project.path && dragging.column !== column;
        const issues = lane[column];
        const empty = issues.length === 0 && (column !== "doing" || lane.cards.length === 0);
        // One row, never two: each piece of paper gets a column it may overflow, and the columns
        // shrink together when the cell is short of room, so the pieces overlap like paper on a
        // wall – the last laid down whole, the earlier ones peeking out from under it. The last
        // column keeps its full width, so the last piece never crosses the cell's edge. A Card
        // with its Note under it is a little wider than a Card alone.
        const widths = [...(column === "doing" ? lane.cards.map((c) => (c.issue ? 300 : 268)) : []), ...(notes === "ready" ? issues.map(() => 136) : [])];
        const template = widths.map((w, i) => (i === widths.length - 1 ? `${w}px` : `minmax(28px, ${w + 12}px)`)).join(" ");
        const note = (issue: Issue, className?: string) => <Note key={issue.url} project={project} issue={issue} column={column} pad={lane.pad} drag={drag} onMove={(i, from, to) => onMove(project, i, from, to)} className={className} />;
        return (
          <div
            key={column}
            data-drop="cell"
            data-lane={project.path}
            data-column={column}
            style={{ gridTemplateColumns: template || undefined }}
            className={cn("grid min-h-[188px] content-start justify-start border-l border-border", CELL, legal && over === key && "rounded-lg ring-2 ring-mark")}
          >
            {column === "doing" &&
              lane.cards.map((card) =>
                // The Note a Session was Started from sits under its Card, its corner showing; it
                // comes out under the pointer. The wrapper's own stacking keeps it behind the Card
                // and still above the Board.
                card.issue && notes === "ready" ? (
                  <div key={card.id} className="relative isolate pr-8 pb-5">
                    <SessionCard project={project} card={card} now={now} />
                    {note(card.issue, "absolute right-0 bottom-0 -z-10 hover:z-10 focus-within:z-10")}
                  </div>
                ) : (
                  <SessionCard key={card.id} project={project} card={card} now={now} />
                ),
              )}
            {notes === "skeleton" ? <Bar className="size-[136px] rounded-[2px]" /> : notes === "ready" && empty ? legal && <NoteGhost>{GHOSTS[column]}</NoteGhost> : notes === "ready" && issues.map((issue) => note(issue))}
          </div>
        );
      })}
    </div>
  );
}

/** The one thing to pick up, beside the greeting so the Board keeps the height: the title over
 * the Project and the reason, then the key and the button that do it. */
function UpNextLine({ next }: { next: UpNext }) {
  const pickUpNext = useStore((s) => s.pickUpNext);
  return (
    <div className="flex h-14 min-w-0 max-w-[720px] flex-1 items-center gap-3 rounded-xl py-2 pr-2 pl-4 material-small">
      <span className="shrink-0 type-label-12 text-muted-foreground">Up Next</span>
      {next ? (
        <>
          <ProjectAvatar name={next.project.name} size={28} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate type-label-14 font-medium">
              {next.kind === "resume" ? (
                next.session.title
              ) : (
                <>
                  <span className="font-mono font-normal text-muted-foreground">#{next.issue.number}</span> {next.issue.title}
                </>
              )}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 type-label-13 text-muted-foreground tabular-nums">
              <ProjectLink project={next.project} />
              <span aria-hidden="true">·</span>
              <span className="truncate">{next.why}</span>
            </span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <Key>Enter</Key>
            <Action size="small" onClick={pickUpNext}>
              <Icon name={next.kind} /> {next.kind === "resume" ? "Resume" : "Start"}
            </Action>
          </span>
        </>
      ) : (
        <span className="type-label-13 text-text-2">Nothing to pick up – pull a Note into Today.</span>
      )}
    </div>
  );
}

function ShelfMark({ mark, name, now }: { mark: ShelfEntry["mark"]; name: string; now: Date }) {
  switch (mark.kind) {
    case "waiting":
      return (
        <span className="flex shrink-0 items-center gap-1.5 type-label-12 tabular-nums">
          <span aria-hidden="true" className={cn("size-2 rounded-full", STATUS_DOT.Waiting)} />
          Waiting{mark.since && ` · ${elapsed(mark.since, now)}`}
        </span>
      );
    case "busy":
      return (
        <span className="flex shrink-0 items-center gap-1.5 type-label-12 text-muted-foreground">
          <span aria-hidden="true" className={cn("size-2 rounded-full", STATUS_DOT.Busy)} />
          Busy
        </span>
      );
    case "leftOff":
      return (
        <span className="flex shrink-0 items-center gap-1 type-label-12 tabular-nums">
          <Icon name="leftOff" size={12} className="fill-current" />
          Left off · {elapsed(mark.since, now)}
        </span>
      );
    case "group":
      return <GroupDot name={name} group={mark.group} />;
  }
}

/** A Project's row on the Shelf: its 24 px avatar, its name over its one mark – the shape of the
 * rows Needs You had. Lifted, it is the copy that follows the pointer. */
function ShelfRow({ item, now, lifted }: { item: ShelfEntry; now: Date; lifted?: boolean }) {
  const { project, mark } = item;
  return (
    <span className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2", lifted ? "material-small shadow-(--ud-shadow-menu)" : "transition-colors duration-150 hover:bg-alpha-100")}>
      <ProjectAvatar name={project.name} size={24} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate type-label-13 font-medium">{project.name}</span>
        <span className="flex h-4 items-center text-muted-foreground">
          <ShelfMark mark={mark} name={project.name} now={now} />
        </span>
      </span>
    </span>
  );
}

/** A Project on the Shelf. A click opens its page; dragged onto the Board it goes into Focus –
 * the bridge refuses a fourth, and its words reach the toast. */
function ShelfItem({ item, now, drag }: { item: ShelfEntry; now: Date; drag: BoardDrag }) {
  const { project } = item;
  const openProject = useStore((s) => s.openProject);
  const setFocus = useStore((s) => s.setFocus);
  const ref = useRef<HTMLButtonElement>(null);
  const [lifting, setLifting] = useState(false);
  return (
    <m.button
      ref={ref}
      type="button"
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0}
      onDragStart={(e) => {
        setLifting(true);
        drag.begin({ kind: "project", item, grip: grip(ref.current, e as PointerEvent) }, e as PointerEvent);
      }}
      onDrag={(e) => drag.move(e as PointerEvent)}
      onDragEnd={(e) => {
        if (drag.end(e as PointerEvent) === "board") setFocus(project.path, true);
      }}
      onDragTransitionEnd={() => setLifting(false)}
      onClick={() => openProject(project.path)}
      draggable={false}
      className={cn("flex w-full cursor-grab rounded-md text-left select-none not-first:shadow-[0_-1px_0_0_var(--ud-line)]", lifting && "pointer-events-none invisible")}
    >
      <ShelfRow item={item} now={now} />
    </m.button>
  );
}

/** The Shelf beside the Board: one `material-small` card of rows, the ones that need you first on
 * top, scrolling on its own when it holds more than the window shows. A tape dropped on it takes
 * its Project off the Board. */
function Shelf({ items, now, drag, ring }: { items: ShelfEntry[]; now: Date; drag: BoardDrag; ring: boolean }) {
  return (
    <section data-drop="shelf" aria-labelledby="shelf" className="flex min-h-0 flex-col gap-3">
      <h2 id="shelf" className="shrink-0 px-1 type-label-14 font-medium">
        Shelf <span className="type-label-13 font-normal text-muted-foreground tabular-nums">{items.length}</span>
      </h2>
      <div className={cn("flex min-h-0 flex-col overflow-y-auto rounded-xl p-2 material-small", ring && "ring-2 ring-mark")}>
        {items.map((item) => (
          <ShelfItem key={item.project.path} item={item} now={now} drag={drag} />
        ))}
        {items.length === 0 && <p className="px-2 py-3 type-label-13 text-balance text-muted-foreground">Every Project is on the Board.</p>}
      </div>
    </section>
  );
}

/** The copy of a row or a tape that follows the pointer: the Board and the Shelf scroll on their
 * own and clip what leaves them, so the original travels hidden and this one, fixed to the
 * window, is what is seen. It catches no pointer, so the drop still reads what lies under it. */
function DragOverlay({ dragging, px, py, now }: { dragging: Dragging | null; px: MotionValue<number>; py: MotionValue<number>; now: Date }) {
  if (!dragging || dragging.kind === "note") return null;
  const { dx, dy, width } = dragging.grip;
  return (
    <m.div aria-hidden="true" className="pointer-events-none fixed top-0 left-0 z-50" style={{ x: px, y: py }}>
      <div className="origin-top-left scale-[1.02]" style={{ marginLeft: -dx, marginTop: -dy, width: width || undefined }}>
        {dragging.kind === "project" ? <ShelfRow item={dragging.item} now={now} lifted /> : <Tape lane={dragging.lane} lifted />}
      </div>
    </m.div>
  );
}

/** Home in Skeletons while the transcripts and git are read: the Up Next line and a Board of two
 * Lanes beside an empty Shelf, so the page keeps its shape when they come in. */
function BoardSkeleton() {
  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_232px] gap-6">
        <div className="overflow-hidden rounded-2xl material-small">
          <div className={LANE_GRID}>
            <div />
            {COLUMNS.map((c) => (
              <div key={c} className="border-l border-border px-3 pt-3.5 pb-2">
                <Bar className="h-4 w-16" />
              </div>
            ))}
          </div>
          {[0, 1].map((i) => (
            <div key={i} className={cn(LANE_GRID, "border-t border-dashed border-line-strong")}>
              <div className={cn("flex flex-col gap-2", CELL)}>
                <Bar className="h-8 w-36" />
                <Bar className="h-7 w-40" />
              </div>
              {COLUMNS.map((c) => (
                <div key={c} className={cn("border-l border-border", CELL)}>
                  <Bar className="size-[136px] rounded-[2px]" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Bar className="h-4 w-16" />
          <div className="flex flex-col gap-3 rounded-xl p-4 material-small">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Bar className="size-6" />
                <Bar className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function Home() {
  const firstName = useStore((s) => s.user?.name.split(" ")[0]);
  const githubRead = useStore((s) => s.read.github);
  const now = useNow();
  // The Lanes and the Cards need the transcripts and git; the Notes need GitHub as well. Until
  // then each cell shows a Skeleton, never a Ghost that says there is nothing.
  const { phase, projects } = useProjectsRead();
  const notesPhase = useSkeleton(phase !== "ready" || !githubRead);
  const { dragging, over, drag, px, py } = useBoardDrag();

  // A Note just moved is drawn where it was dropped until the bridge's list agrees – or says no.
  const [flight, setFlight] = useState<Record<string, Column>>({});
  const land = useCallback(
    (url: string) =>
      setFlight((f) => {
        if (!(url in f)) return f;
        const next = { ...f };
        delete next[url];
        return next;
      }),
    [],
  );
  useEffect(() => {
    if (!projects) return;
    const issues = new Map(projects.flatMap((p) => p.issues).map((i) => [i.url, i]));
    for (const url of Object.keys(flight)) {
      const issue = issues.get(url);
      if (!issue || columnOf(issue) === flight[url]) land(url);
    }
    // Only a new list can land a Note; the map itself changing must not run this again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, land]);

  const onMove = useCallback(
    (project: Project, issue: Issue, from: Column, to: Column) => {
      setFlight((f) => ({ ...f, [issue.url]: to }));
      const { start, setToday, forgetStart } = useStore.getState();
      const { path } = project;
      let call: Promise<boolean>;
      if (to === "doing") call = start(path, issue.number);
      else if (from === "doing") {
        // Out of Doing, a Note is back in Today only if it was pulled there before.
        const today = to === "today";
        call = forgetStart(path, issue.number).then((ok) => (ok && today !== !!issue.todaySince ? setToday(path, issue.number, today) : ok));
      } else call = setToday(path, issue.number, to === "today");
      void call.then((ok) => {
        if (!ok) land(issue.url);
      });
      // The bridge answers within a tick or two; past 8 s the Note shows what the list says.
      setTimeout(() => land(issue.url), 8000);
    },
    [land],
  );

  const all = projects ? lanes(projects, now, flight) : [];
  const groups = projects ? looseEnds(projects, now) : [];
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const night = groups.find((g) => g.section === "Last Night")?.items.length ?? 0;
  const counts = projects ? headline(projects, groups) : { unpushed: 0, open: 0 };
  const waiting = projects ? needsYou(projects, now).waiting[0] : undefined;
  // The greeting's line: the Loose Ends, the counts that matter beside them, each only above zero,
  // and the Session that has waited on you longest – it runs in its own window, so it is named here
  // rather than offered as Up Next.
  const line = [
    total > 0 ? `${total} Loose ${total === 1 ? "End" : "Ends"}${night > 0 ? ` – ${night} from last night` : ""}` : "Nothing left half-done",
    counts.unpushed > 0 && `${counts.unpushed} ${counts.unpushed === 1 ? "commit" : "commits"} not pushed`,
    counts.open > 0 && `${counts.open} ${counts.open === 1 ? "Session" : "Sessions"} open`,
    waiting && `${waiting.project.name} waits on you${waiting.open.statusSince ? ` · ${elapsed(waiting.open.statusSince, now)}` : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const next = projects ? upNext(projects, now) : null;
  const items = projects ? shelf(projects, now) : [];
  const count = (c: Column) => all.reduce((n, l) => n + (c === "ready" ? l.ready.filter((i) => i.blockedBy === 0).length : c === "doing" ? l.doing.length + l.cards.length : c === "done" ? l.project.closed.length : l[c].length), 0);
  // A folder may land on the Board while it has room; a tape may land on the Shelf.
  const boardRing = dragging?.kind === "project" && over === "board" && all.length < MAX_LANES;
  const shelfRing = dragging?.kind === "lane" && over === "shelf";

  return (
    // The page takes the window's height and never scrolls itself: the Board and the Shelf do.
    <div className={cn("flex h-full w-full flex-col gap-5 px-8 pt-6 pb-6", dragging && "select-none")}>
      {/* The greeting on the left, Up Next on the right: one row, so the Board gets the height. */}
      <header className="flex shrink-0 items-center justify-between gap-8">
        <div className="flex min-w-0 shrink-0 flex-col gap-1">
          <h1 className="type-heading-24">{firstName ? `Hello, ${firstName}` : "Home"}</h1>
          {projects && <p className="type-copy-14 text-text-2">{line}.</p>}
        </div>
        {projects && <UpNextLine next={next} />}
      </header>
      {phase === "skeleton" && <BoardSkeleton />}
      {projects && (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_232px] gap-6">
            <section data-drop="board" aria-label="The Board" className={cn("relative min-h-0 overflow-y-auto rounded-2xl material-small", boardRing && "ring-2 ring-mark")}>
              {/* The ground and the Lanes sit in one block as tall as the Board at least, so the
                  dots cover it to the bottom whether it holds one Lane or three. */}
              <div className="relative min-h-full pb-2">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 dotted" />
                {all.length === 0 ? (
                  <div className="relative flex min-h-full items-center justify-center">
                    <Empty icon={<Icon name="projects" size={20} />} title="Nothing on the Board.">
                      Drag a Project from the Shelf here, or choose Focus on its page – four at most. The Board shows their Issues, Ready, Today and Doing.
                    </Empty>
                  </div>
                ) : (
                  <div className="relative">
                    <div className={LANE_GRID}>
                      <div />
                      {COLUMNS.map((c) => (
                        <div key={c} className="border-l border-border px-3 pt-3 pb-1.5 type-label-14 font-medium">
                          {HEADS[c]} <span className="type-label-13 font-normal text-muted-foreground tabular-nums">{notesPhase === "ready" || c === "doing" ? count(c) : ""}</span>
                        </div>
                      ))}
                    </div>
                    {all.map((lane) => (
                      <LaneRow key={lane.project.path} lane={lane} now={now} notes={notesPhase} dragging={dragging} over={over} drag={drag} onMove={onMove} />
                    ))}
                  </div>
                )}
              </div>
            </section>
            <Shelf items={items} now={now} drag={drag} ring={shelfRing} />
          </div>
        </>
      )}
      <DragOverlay dragging={dragging} px={px} py={py} now={now} />
    </div>
  );
}
