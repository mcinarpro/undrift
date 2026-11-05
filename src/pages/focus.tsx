import { Action } from "@/components/action";
import { Key } from "@/components/bits";
import { Icon } from "@/components/icon";
import { MockTerminal, TerminalTabs } from "@/components/mock-terminal";
import { Caps, ChannelTag, Meter, channelColor } from "@/components/planner";
import { cn } from "@/lib/utils";
import { BLOCKS, SPRINT } from "@/mocks/day";
import { useStore } from "@/store";

const STEPS: [string, boolean][] = [
  ["Child in the domain + migration", true],
  ["POST /children, tests green", true],
  ["Events list includes Children", false],
  ["Mobile: the Child picker", false],
  ["PR, then /code-review in a new session", false],
];

// A block in focus: the time left on top, the ticket on the left, the terminal in the middle, the
// card and the rest of the day on the right – everything the block needs, nothing else.
export function Focus() {
  const setToday = useStore((s) => s.setToday);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3.5 border-b border-border bg-card px-4">
        <span className="inline-flex h-5 items-center rounded-full bg-primary px-2 text-[11px] font-medium text-primary-foreground">Focus</span>
        <span className="font-medium">#98 Children appear on the plan</span>
        <ChannelTag channel="sprint" />
        <span className="grow" />
        <span className="type-label-12 text-muted-foreground">09:00 – 12:00</span>
        <Meter value={0.4} color={channelColor("sprint")} className="w-40" />
        <span className="font-medium tabular-nums">1:48 left</span>
        <Action variant="secondary" size="small">
          Pause
        </Action>
        <Action variant="secondary" size="small" onClick={() => setToday("day")}>
          Done <Icon name="check" size={14} />
        </Action>
      </div>
      <div className="grid min-h-0 grow grid-cols-[260px_1fr_290px]">
        <aside className="flex min-h-0 flex-col gap-4 overflow-hidden border-r border-border p-4">
          <div className="flex items-center gap-3.5">
            <div
              className="size-16 shrink-0 rounded-full"
              style={{
                background: `conic-gradient(${channelColor("sprint")} 40%, var(--ud-alpha-400) 0)`,
                mask: "radial-gradient(circle, transparent 25px, #000 26px)",
              }}
            />
            <div>
              <div className="text-xl font-semibold tracking-[-.6px] tabular-nums">1:48</div>
              <div className="type-label-12 text-muted-foreground">left in this block</div>
            </div>
          </div>
          <div className="h-px bg-border" />
          <div>
            <Caps className="mb-2">The Ticket</Caps>
            <p className="type-copy-13 text-text-2">
              A Family's children appear on the plan without an account. An adult adds a Child by first name; Tasks and Events can include them.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Caps>Steps</Caps>
            {STEPS.map(([s, done]) => (
              <div key={s} className="flex items-start gap-2 text-[13px] leading-[18px]">
                <span
                  className={cn(
                    "mt-px flex size-[15px] shrink-0 items-center justify-center rounded-[4px] text-white",
                    done ? "bg-[var(--ud-ch-habit)]" : "shadow-[inset_0_0_0_1.5px_var(--ud-line-strong)]",
                  )}
                >
                  {done && <Icon name="check" size={10} />}
                </span>
                <span className={cn(done && "text-muted-foreground line-through")}>{s}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] text-muted-foreground material-small">
            <Icon name="plus" size={14} />
            <span className="grow">Capture</span>
            <Key>Ctrl Alt Space</Key>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          <TerminalTabs
            tabs={[
              { label: "claude", dot: "blue", on: true },
              { label: "mise run dev", dot: "green" },
              { label: "shell", dot: "dim" },
            ]}
            right={<span>Claude is waiting on you</span>}
          />
          <MockTerminal withTest />
        </section>

        <aside className="flex min-h-0 flex-col gap-3.5 overflow-hidden border-l border-border bg-card p-4">
          <div className="flex flex-col gap-2 rounded-xl p-3.5 shadow-[var(--ud-shadow-small),inset_3px_0_0_var(--ud-ch-sprint)] material-small">
            <div className="flex items-center">
              <Caps className="grow">Reprise</Caps>
              <span className="type-label-12 text-muted-foreground">yesterday</span>
            </div>
            <p className="text-[12.5px] text-text-2">
              <b className="font-medium text-foreground">Next –</b> {SPRINT.next}
            </p>
          </div>
          <div>
            <Caps className="mb-2">Pull Request</Caps>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="size-2 rounded-full shadow-[inset_0_0_0_1.5px_var(--ud-muted)]" />
              not opened yet
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center">
            <Caps className="grow">Rest of Today</Caps>
            <span className="type-label-12 text-muted-foreground">4 left</span>
          </div>
          {BLOCKS.filter((b) => b.start >= 12 && b.title !== "VPS backup token").map((b) => (
            <div key={b.title} className="flex items-center gap-2.5">
              <span className="w-[38px] font-mono text-[11.5px] text-muted-foreground">
                {String(Math.floor(b.start)).padStart(2, "0")}:{b.start % 1 ? "30" : "00"}
              </span>
              <span className="h-[22px] w-[3px] rounded-sm" style={{ background: channelColor(b.channel) }} />
              <span className="text-[13px]">{b.title}</span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
