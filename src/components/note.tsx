import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { animate, m, useMotionValue, useReducedMotion } from "motion/react";
import { openExternal } from "@/bridge";
import { Action } from "@/components/action";
import { Icon } from "@/components/icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { tilt, type BoardDrag, type Card, type Column, type Pad } from "@/lib/board";
import { age, elapsed } from "@/lib/home";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { Issue, Project } from "@/types";

// The Board's two pieces of material (DESIGN.md § Components): a Note, an Issue on paper torn
// from its Lane's pad, and a Card, a Session pinned in the Doing column. Paper keeps its own ink
// and shadows in both themes, so nothing here reads a theme token for its text.

/** Where a Note was before it changed cell, by Issue URL, so the one drawn in the new cell slides
 * from there (DESIGN.md § Shape and motion). Set right before the move, read once by the new Note. */
const origins = new Map<string, { rect: DOMRect; at: number }>();

function remember(url: string, el: HTMLElement | null) {
  if (el) origins.set(url, { rect: el.getBoundingClientRect(), at: performance.now() });
}

/** Geist's swift settle: a short spring that lands in about 250 ms with hardly a bounce. */
const SETTLE = { type: "spring", duration: 0.3, bounce: 0.12 } as const;

const PAD: Record<Pad | "off", string> = {
  1: "[--pad:var(--ud-pad-1)]",
  2: "[--pad:var(--ud-pad-2)]",
  3: "[--pad:var(--ud-pad-3)]",
  4: "[--pad:var(--ud-pad-4)]",
  off: "[--pad:var(--ud-pad-off)]",
};

/** Paper controls keep their own greys, since the primary button turns light in dark mode. */
const PAPER_MENU =
  "flex size-6 items-center justify-center rounded-sm text-ink transition-colors duration-150 hover:bg-[#0000001a] focus-visible:shadow-[0_0_0_2px_var(--pad,#fff),0_0_0_4px_var(--ud-focus)]";
const MENU = "w-52 rounded-xl p-1 ring-0 shadow-(--ud-shadow-menu)";
const ITEM = "h-9 gap-2 rounded-md px-2 text-sm";

/** An Issue on the Board: a square of paper in its Lane's pad colour, its number, its title and –
 * under the pointer or the keyboard – Start and a `⋯` menu, which is the keyboard's way of moving
 * it. A blocked Issue is grey, says what it waits on, and cannot be dragged. */
export function Note({
  project,
  issue,
  column,
  pad,
  drag,
  onMove,
  className,
}: {
  project: Project;
  issue: Issue;
  column: Column;
  pad: Pad;
  /** The Board's drag; none for a blocked Issue. */
  drag: BoardDrag | null;
  onMove: (issue: Issue, from: Column, to: Column) => void;
  /** Where the Note sits when it is not in the cell's flow – under its Card. */
  className?: string;
}) {
  const start = useStore((s) => s.start);
  const resume = useStore((s) => s.resume);
  const ref = useRef<HTMLDivElement>(null);
  const [lifting, setLifting] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const reduced = useReducedMotion();
  const blocked = issue.blockedBy > 0;
  const done = column === "done";
  // A Doing Note whose Session ended can open it again; one whose Session still runs has its Card.
  const ended = column === "doing" && !!issue.sessionId && project.sessions.some((s) => s.id === issue.sessionId) && !project.openSessions.some((o) => o.id === issue.sessionId);

  // A Note drawn in a new cell starts where its old self was and slides into place.
  useLayoutEffect(() => {
    const from = origins.get(issue.url);
    if (!from) return;
    origins.delete(issue.url);
    const el = ref.current;
    if (!el || reduced || performance.now() - from.at > 3000) return;
    const to = el.getBoundingClientRect();
    x.set(from.rect.left + from.rect.width / 2 - (to.left + to.width / 2));
    y.set(from.rect.top + from.rect.height / 2 - (to.top + to.height / 2));
    animate(x, 0, SETTLE);
    animate(y, 0, SETTLE);
    // Once, on mount: the origin is consumed here and never set again for this element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (to: Column) => {
    remember(issue.url, ref.current);
    onMove(issue, column, to);
  };
  const draggable = !!drag && !blocked && !done;

  return (
    <m.div
      ref={ref}
      drag={draggable}
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0}
      style={{ x, y, rotate: tilt(issue.number) }}
      whileDrag={{ rotate: 0, scale: 1.04 }}
      onDragStart={(e) => {
        setLifting(true);
        drag?.begin({ kind: "note", url: issue.url, lane: project.path, column }, e as PointerEvent);
      }}
      onDrag={(e) => drag?.move(e as PointerEvent)}
      onDragEnd={(e) => {
        setLifting(false);
        const at = drag?.end(e as PointerEvent);
        // Only a cell of the Note's own Lane, in another column, is a move; anywhere else the
        // Note springs back to where it was.
        if (at && typeof at !== "string" && at.lane === project.path && at.column !== column) move(at.column);
      }}
      draggable={false}
      className={cn(
        // Under the pointer or the keyboard a Note comes out from under the ones laid after it.
        "group/note relative flex size-[136px] shrink-0 flex-col gap-1 rounded-[2px] p-3 select-none paper hover:z-10 focus-within:z-10",
        PAD[blocked ? "off" : pad],
        blocked && "text-ink-2",
        draggable && "cursor-grab",
        // Closed, the paper fades: it is leaving the Board.
        done && "opacity-75 saturate-50",
        // Lifted, the Note must not catch the pointer: the cell under it is what the drop reads,
        // and the pointerup must not land on the button the drag began on.
        lifting && "pointer-events-none z-20 cursor-grabbing shadow-(--ud-shadow-paper-lifted) will-change-transform",
        className,
      )}
    >
      <span className="type-label-12 font-mono text-ink-2 tabular-nums">#{issue.number}</span>
      <span className="line-clamp-3 type-label-14 font-medium">{issue.title}</span>
      <span className="mt-auto flex items-center gap-1">
        {done ? (
          <span className="flex items-center gap-1 type-label-12 text-ink-2 tabular-nums">
            <svg className="size-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Closed {issue.closedAt ? age(issue.closedAt, new Date()) : ""}
          </span>
        ) : blocked ? (
          <span className="type-label-12 text-ink-2">waits on {issue.blockedBy === 1 ? "1 Issue" : `${issue.blockedBy} Issues`}</span>
        ) : column === "doing" ? (
          <span className="type-label-12 text-ink-2 tabular-nums">Started {issue.startedAt ? age(issue.startedAt, new Date()) : "just now"}</span>
        ) : (
          <Action
            variant="tertiary"
            size="tiny"
            aria-label={`Start #${issue.number}`}
            onClick={() => void start(project.path, issue.number)}
            className="text-ink opacity-0 hover:bg-[#0000001a] group-focus-within/note:opacity-100 group-hover/note:opacity-100"
          >
            <Icon name="start" />
          </Action>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`More for #${issue.number}`} className={cn(PAPER_MENU, "ml-auto opacity-0 group-focus-within/note:opacity-100 group-hover/note:opacity-100")}>
            <Icon name="more" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={MENU}>
            {!blocked && column === "ready" && (
              <DropdownMenuItem onClick={() => move("today")} className={ITEM}>
                Pull into Today
              </DropdownMenuItem>
            )}
            {column === "today" && (
              <DropdownMenuItem onClick={() => move("ready")} className={ITEM}>
                Take out of Today
              </DropdownMenuItem>
            )}
            {ended && (
              <DropdownMenuItem onClick={() => resume(project.path, issue.sessionId!)} className={ITEM}>
                Resume the Session
              </DropdownMenuItem>
            )}
            {column === "doing" && (
              <DropdownMenuItem onClick={() => move(issue.todaySince ? "today" : "ready")} className={ITEM}>
                Take out of Doing
              </DropdownMenuItem>
            )}
            {!blocked && !done && column !== "doing" && (
              <DropdownMenuItem onClick={() => void start(project.path, issue.number)} className={ITEM}>
                Start
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => void openExternal(issue.url)} className={ITEM}>
              Open on GitHub
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </m.div>
  );
}

/** The head of a Card's pin, by Status: black waits on you, blue works, hollow has gone quiet. */
const HEAD: Record<"Busy" | "Waiting" | "Quiet", string> = {
  Busy: "bg-[radial-gradient(circle_at_35%_30%,#8ac2ff,#0a5fd6_70%)]",
  Waiting: "bg-[radial-gradient(circle_at_35%_30%,#5a5a5a,#111_70%)]",
  Quiet: "bg-white shadow-[inset_0_0_0_2px_#666,0_2px_3px_#00000059]",
};

/** A Session in a Lane's Doing cell: a white card pinned by its Status, flagged *Left off* when it
 * left changes behind. An open Session runs in its own window, so only an earlier one gets Resume. */
export function SessionCard({ project, card, now }: { project: Project; card: Card; now: Date }) {
  const { resume, letGo, openProject } = useStore();
  const line = card.status
    ? [card.status === "Busy" ? "Working now" : card.status, card.since && elapsed(card.since, now), card.where].filter(Boolean).join(" · ")
    : card.since
      ? `Left ${age(card.since, now)}`
      : null;
  // The last word said: your prompt while it works, Claude's last line once it has finished or was
  // left – the question to answer, or the step it stopped at – so the Card says what it needs.
  const word = card.status === "Busy" ? card.lastPrompt : (card.lastReply ?? card.lastPrompt);
  return (
    <article className="relative flex w-[268px] shrink-0 flex-col gap-2 rounded-[3px] bg-white p-3 pt-4 text-ink shadow-[0_0_0_1px_#0000000d,0_2px_3px_#0000000f,4px_12px_16px_-10px_#00000040] hover:z-10 focus-within:z-10">
      {card.status && (
        <span
          role="img"
          aria-label={`Session ${card.status.toLowerCase()}`}
          // Pinned at its top left, so the head never meets the *Left off* flag at the top right.
          className={cn("absolute -top-2 left-4 size-4 rounded-full shadow-[0_2px_3px_#00000059]", HEAD[card.status])}
        />
      )}
      {card.leftOff && (
        <span className="absolute -top-[18px] right-3 flex h-[18px] items-center gap-1 rounded-t-[3px] bg-[#171717] px-2 text-[11px]/[18px] font-medium whitespace-nowrap text-white">
          <Icon name="leftOff" size={11} className="fill-current" />
          Left off · {card.leftOff === "Last Night" ? "last night" : card.leftOff === "This Week" ? "this week" : "earlier"}
        </span>
      )}
      <div className="flex flex-col gap-1">
        {line && <span className="type-label-12 text-ink-2 tabular-nums">{line}</span>}
        <h3 className="line-clamp-2 type-label-14 font-medium">{card.title ?? "Untitled Session"}</h3>
        {word && <p className="line-clamp-2 type-copy-13 text-ink-2">“{word}”</p>}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {card.status === null ? (
          <Action variant="secondary" size="small" onClick={() => resume(project.path, card.id)} className="bg-white text-ink shadow-[0_0_0_1px_#e4e4e4] hover:bg-[#f2f2f2]">
            <Icon name="resume" /> Resume
          </Action>
        ) : (
          <Action variant="secondary" size="small" onClick={() => openProject(project.path)} className="bg-white text-ink shadow-[0_0_0_1px_#e4e4e4] hover:bg-[#f2f2f2]">
            Open Project <Icon name="open" />
          </Action>
        )}
        {card.leftOff && (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`More for ${project.name}`} className={cn(PAPER_MENU, "size-8 rounded-md")}>
              <Icon name="more" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={MENU}>
              <DropdownMenuItem onClick={() => openProject(project.path)} className={ITEM}>
                Open Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => letGo(project.path, project.name)} className={ITEM}>
                Let Go
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </article>
  );
}

/** The place a Note would take in an empty cell, with the one sentence that says what to do. */
export function NoteGhost({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-[136px] shrink-0 items-center justify-center rounded-[2px] border border-dashed border-line-strong p-3 text-center type-label-12 text-balance text-muted-foreground">
      {children}
    </span>
  );
}
