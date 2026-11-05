import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { CHANNEL_LABEL, type Block, type Channel, type PostIt as PostItData, type Task } from "@/mocks/day";

// The pieces the v2 screens are made of: a task card, a time block on the day's line, a post-it,
// a habit's week, a meter. Each takes its colour from the task's channel and nothing else.

const LINE: Record<Channel, string> = {
  sprint: "var(--ud-ch-sprint)",
  project: "var(--ud-ch-project)",
  life: "var(--ud-ch-life)",
  habit: "var(--ud-ch-habit)",
  rest: "var(--ud-ch-rest)",
};
const TINT: Record<Channel, string> = {
  sprint: "var(--ud-ch-sprint-tint)",
  project: "var(--ud-ch-project-tint)",
  life: "var(--ud-ch-life-tint)",
  habit: "var(--ud-ch-habit-tint)",
  rest: "var(--ud-ch-rest-tint)",
};

export const channelColor = (c: Channel) => LINE[c];
export const channelTint = (c: Channel) => TINT[c];

/** The channel a task belongs to, as a coloured square and its name. */
export function ChannelTag({ channel, extra }: { channel: Channel; extra?: string }) {
  return (
    <span className="flex items-center gap-1.5 type-label-12 text-muted-foreground">
      <i className="inline-block size-[7px] rounded-[2px]" style={{ background: LINE[channel] }} />
      {CHANNEL_LABEL[channel]}
      {extra && <span>· {extra}</span>}
    </span>
  );
}

/** Planned time, in the mono figures of a clock. */
export function Estimate({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-5 shrink-0 items-center rounded-[5px] bg-alpha-100 px-1.5 font-mono text-[11.5px] text-text-2">{children}</span>;
}

export function Check({ done, onToggle, size = 18 }: { done?: boolean; onToggle?: () => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!!done}
      aria-label={done ? "Mark as not done" : "Mark as done"}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-white transition-colors",
        done ? "bg-[var(--ud-ch-habit)]" : "shadow-[inset_0_0_0_1.5px_var(--ud-line-strong)] hover:shadow-[inset_0_0_0_1.5px_var(--ud-text-2)]",
      )}
      style={{ width: size, height: size }}
    >
      {done && <Icon name="check" size={size * 0.62} />}
    </button>
  );
}

/** A task of the day, as Sunsama draws one: its check, its title, its time, its channel. */
export function TaskCard({
  task,
  onToggle,
  onOpen,
  running,
  compact,
}: {
  task: Task;
  onToggle?: () => void;
  onOpen?: () => void;
  running?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-[10px] material-small",
        compact ? "px-3 py-2" : "px-3 py-2.5",
        running && "shadow-[var(--ud-shadow-small),0_0_0_2px_var(--ud-ch-sprint)]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Check done={task.done} onToggle={onToggle} />
        <button
          type="button"
          onClick={onOpen}
          className={cn("grow text-left type-label-14 font-medium", task.done && "text-muted-foreground line-through decoration-line-strong")}
        >
          {task.title}
        </button>
        {running && (
          <span className="flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium" style={{ background: TINT.sprint, color: LINE.sprint }}>
            <Icon name="play" size={10} /> {running}
          </span>
        )}
        {compact && !running && <ChannelTag channel={task.channel} />}
        <Estimate>{task.estimate}</Estimate>
      </div>
      {!compact && task.waiting && (
        <div className="flex items-center gap-2 pl-7 type-label-12 text-text-2">
          <span className="size-2 rounded-full bg-mark" />
          Claude Code · waiting on you · “{task.waiting}”
        </div>
      )}
      {!compact && (
        <div className="pl-7">
          <ChannelTag channel={task.channel} extra={task.note} />
        </div>
      )}
    </div>
  );
}

/** The day as a line of hours with its time blocks, Sunsama's right column. */
export function Timeline({ blocks, now, from = 8, to = 22, hour = 44 }: { blocks: Block[]; now?: number; from?: number; to?: number; hour?: number }) {
  const y = (h: number) => (h - from) * hour;
  return (
    <div className="relative" style={{ height: y(to) + 10 }}>
      {Array.from({ length: to - from + 1 }, (_, i) => (
        <div key={i} className="absolute inset-x-0 border-t border-border" style={{ top: i * hour }}>
          <span className="absolute -top-[7px] left-0 bg-card pr-1.5 text-[10.5px] text-muted-foreground tabular-nums">
            {String(from + i).padStart(2, "0")}:00
          </span>
        </div>
      ))}
      {blocks.map((b) => {
        const short = b.end - b.start < 0.5;
        return (
          <div
            key={b.title + b.start}
            className={cn(
              "absolute right-2 left-11 z-[1] overflow-hidden rounded-md border-l-[3px] px-2 text-xs leading-[15px]",
              short ? "flex items-center py-0.5 whitespace-nowrap" : "py-1",
              b.faded && "opacity-55",
            )}
            style={{
              top: y(b.start) + 1,
              height: Math.max((b.end - b.start) * hour - 2, 20),
              background: `linear-gradient(${TINT[b.channel]}, ${TINT[b.channel]}), var(--ud-surface)`,
              borderColor: LINE[b.channel],
            }}
          >
            <b className="font-medium">{b.title}</b>
            {!short && b.sub && <div className="text-text-2">{b.sub}</div>}
          </div>
        );
      })}
      {now !== undefined && (
        <div className="absolute right-0 left-[38px] z-[3] border-t-2 border-error-fill" style={{ top: y(now) }}>
          <span className="absolute -top-[5px] -left-1 size-2 rounded-full bg-error-fill" />
        </div>
      )}
    </div>
  );
}

/** A post-it, leaning a little the way its id says, so a board never looks printed. */
export function PostIt({ note, pad = "yellow", faded, className }: { note: PostItData; pad?: "yellow" | "pink" | "green" | "lavender"; faded?: boolean; className?: string }) {
  const lean = ((note.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 7) - 3;
  return (
    <div
      className={cn("paper flex min-h-[78px] flex-col gap-1 px-2.5 pt-3.5 pb-2", faded && "opacity-55", className)}
      style={{ ["--pad" as string]: `var(--ud-pad-${pad})`, transform: `rotate(${lean * 0.45}deg)` }}
    >
      {note.num && <span className="font-mono text-[11px] text-[var(--ud-ink-2)]">{note.num}</span>}
      <span className="text-[12.5px] leading-4 font-medium">{note.title}</span>
      {note.meta && <span className="mt-auto text-[10.5px] text-[var(--ud-ink-2)]">{note.meta}</span>}
    </div>
  );
}

/** A habit's last seven days, a square each. */
export function Streak({ week, today }: { week: number[]; today?: number }) {
  return (
    <span className="flex gap-[3px]">
      {week.map((d, i) => (
        <i
          key={i}
          className={cn("size-2.5 rounded-[3px]", d ? "bg-[var(--ud-ch-habit)]" : "bg-alpha-400", i === today && "shadow-[0_0_0_1.5px_var(--ud-text)]")}
        />
      ))}
    </span>
  );
}

export function Meter({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-alpha-400", className)}>
      <i className="block h-full rounded-full" style={{ width: `${value * 100}%`, background: color ?? "var(--ud-text)" }} />
    </div>
  );
}

/** A small uppercase heading over a group of things on a page. */
export function Caps({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[11px] font-medium tracking-[.4px] text-muted-foreground uppercase", className)}>{children}</div>;
}

export function Badge({ children, tone = "grey" }: { children: ReactNode; tone?: "grey" | "blue" | "amber" | "red" | "green" | "ink" }) {
  const tones = {
    grey: "bg-alpha-100 text-text-2",
    blue: "bg-[#0072f51f] text-accent-text",
    amber: "bg-[#ffb2242e] text-drifting-text",
    red: "bg-error-bg text-error",
    green: "bg-[var(--ud-ch-habit-tint)] text-[var(--ud-ch-habit)]",
    ink: "bg-primary text-primary-foreground",
  };
  return <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium whitespace-nowrap", tones[tone])}>{children}</span>;
}
