import { useState } from "react";
import { Action } from "@/components/action";
import { Key } from "@/components/bits";
import { Icon } from "@/components/icon";
import { MockTerminal, TerminalTabs } from "@/components/mock-terminal";
import { Badge, Caps, ChannelTag, Check, Meter, PostIt, Streak, TaskCard, Timeline } from "@/components/planner";
import { cn } from "@/lib/utils";
import { BACKLOG, BLOCKS, DRAFT_CARD, HABITS, SPRINT, TODAY, type Task } from "@/mocks/day";
import { Focus } from "@/pages/focus";
import { useStore } from "@/store";

// Today, Sunsama's way (docs/v2.md): what can be pulled in on the left, the day's tasks in the
// middle, the day's time blocks on the right. A task opens the terminal under the list; Focus gives
// the block the whole window. The morning plan and the evening shut down are Today's other moments.
export function Today() {
  const view = useStore((s) => s.today);
  if (view === "plan") return <PlanMyDay />;
  if (view === "focus") return <Focus />;
  if (view === "shutdown") return <ShutDown />;
  return <Day />;
}

function DayHeader({ compact }: { compact?: boolean }) {
  const setToday = useStore((s) => s.setToday);
  const done = useStore((s) => s.tasks.filter((t) => t.done).length);
  return (
    <>
      <div className="flex items-end gap-2">
        <div className="grow">
          <h1 className={compact ? "type-heading-24" : "type-heading-24"}>
            {TODAY.weekday} {TODAY.day}
          </h1>
          <p className="mt-0.5 type-label-13 text-muted-foreground">
            {TODAY.month} · <strong className="font-medium text-foreground">{TODAY.planned} planned</strong> of {TODAY.capacity} · {done} done
          </p>
        </div>
        <Action variant="secondary" size="small" onClick={() => setToday("shutdown")}>
          Shut Down
        </Action>
        <Action size="small" onClick={() => setToday("plan")}>
          Plan My Day
        </Action>
      </div>
      <Meter value={0.87} className="h-[5px]" />
    </>
  );
}

function Habits() {
  return (
    <div className="flex items-center gap-5 py-0.5">
      {HABITS.map((h) => (
        <div key={h.name} className="flex items-center gap-2">
          <span className="text-[13px] font-medium">{h.name}</span>
          <Streak week={h.week} />
          <span className="type-label-12 text-muted-foreground">{h.label}</span>
        </div>
      ))}
    </div>
  );
}

function Backlog() {
  const [tab, setTab] = useState<keyof typeof BACKLOG>("sprint");
  const pad = tab === "life" ? "pink" : tab === "later" ? "lavender" : "yellow";
  return (
    <aside className="flex min-h-0 flex-col gap-3.5 border-r border-border px-4 py-[18px]">
      <div className="flex gap-0.5 rounded-lg bg-alpha-100 p-0.5">
        {(["sprint", "life", "later"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("h-[26px] grow rounded-md text-[13px] capitalize", tab === t ? "material-small text-foreground" : "text-text-2")}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="type-label-12 text-muted-foreground">
        {tab === "later" ? "Ideas wait here until the Sprint ends" : "Drag a post-it into the day"}
      </p>
      <div className="dotted grid min-h-0 grow auto-rows-min grid-cols-2 gap-3.5 px-0.5 py-1.5">
        {BACKLOG[tab].map((n) => (
          <PostIt key={n.id} note={n} pad={pad} />
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-xl p-3 material-small">
        <div className="flex items-center">
          <Caps className="grow">Sprint</Caps>
          <Badge tone="ink">
            day {SPRINT.day} / {SPRINT.of}
          </Badge>
        </div>
        <div className="type-label-14 font-medium">{SPRINT.project}</div>
        <Meter value={SPRINT.progress} />
        <div className="type-label-12 text-muted-foreground">{SPRINT.summary}</div>
      </div>
    </aside>
  );
}

function DayLine() {
  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-hidden border-l border-border bg-card px-3.5 pt-4">
      <div className="flex items-center">
        <span className="grow font-medium">
          Thu {TODAY.day}
        </span>
        <span className="type-label-12 text-muted-foreground">‹ ›</span>
      </div>
      <Timeline blocks={BLOCKS} now={TODAY.now} hour={44} />
    </aside>
  );
}

function Day() {
  const { tasks, toggleTask, dock, setDock, setToday } = useStore();
  const open = (t: Task) => t.channel === "sprint" && !t.done && setDock(true);

  if (dock) {
    // The terminal takes the bottom of the day: the three first tasks stay in sight above it.
    return (
      <div className="grid h-full min-h-0 grid-cols-[1fr_300px]">
        <div className="flex min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-2.5 px-6 pt-[18px] pb-3">
            <DayHeader compact />
            <div className="flex flex-col gap-2">
              {tasks.slice(0, 3).map((t) => (
                <TaskCard key={t.id} task={t} compact onToggle={() => toggleTask(t.id)} running={t.id === "t2" ? "running · 1:48 left" : undefined} />
              ))}
            </div>
          </div>
          <section className="flex min-h-0 grow flex-col border-t border-border">
            <TerminalTabs
              lead="home-sweet-plan"
              tabs={[
                { label: "claude", dot: "blue", on: true },
                { label: "mise run dev", dot: "green" },
              ]}
              right={
                <>
                  <button type="button" onClick={() => setToday("focus")} className="hover:text-[var(--ud-term-text)]">
                    ⤢ Focus
                  </button>
                  <button type="button" onClick={() => setDock(false)} className="hover:text-[var(--ud-term-text)]">
                    ⌄ Hide
                  </button>
                </>
              }
            />
            <MockTerminal withTest={false} />
          </section>
        </div>
        <DayLine />
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[272px_1fr_330px]">
      <Backlog />
      <main className="flex min-h-0 flex-col gap-3 overflow-y-auto px-6 py-[22px]">
        <DayHeader />
        <Habits />
        <div className="flex flex-col gap-2.5">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onToggle={() => toggleTask(t.id)} onOpen={() => open(t)} />
          ))}
          <button type="button" className="flex items-center gap-2.5 px-3 py-1 text-left text-[13.5px] text-muted-foreground hover:text-foreground">
            <Icon name="plus" size={14} />
            <span className="grow">Add a task</span>
            <Key>C</Key>
          </button>
        </div>
      </main>
      <DayLine />
    </div>
  );
}

/** Sunsama's morning: yesterday's leftovers decided, today's tasks picked, then timeboxed. */
function PlanMyDay() {
  const setToday = useStore((s) => s.setToday);
  const steps = ["Yesterday", "Today", "Timebox"];
  return (
    <div className="grid h-full min-h-0 grid-cols-[1fr_330px]">
      <div className="flex min-h-0 flex-col gap-[18px] overflow-y-auto px-10 py-[26px]">
        <div className="flex items-center gap-4">
          {steps.map((s, i) => (
            <div key={s} className={cn("flex items-center gap-2 text-[13px]", i === 1 ? "text-foreground" : "text-muted-foreground")}>
              <b
                className={cn(
                  "flex size-[22px] items-center justify-center rounded-full text-xs font-medium",
                  i === 0 && "bg-[var(--ud-ch-habit)] text-white",
                  i === 1 && "bg-primary text-primary-foreground",
                  i === 2 && "shadow-[inset_0_0_0_1px_var(--ud-line-strong)]",
                )}
              >
                {i === 0 ? <Icon name="check" size={12} /> : i + 1}
              </b>
              {s}
              {i < 2 && <span className="ml-2 text-muted-foreground">—</span>}
            </div>
          ))}
        </div>
        <div>
          <h1 className="type-heading-24">What will you get done today?</h1>
          <p className="mt-1 type-label-13 text-muted-foreground">Your Sprint, your habits, and what Life asks this week. Claude already read the boards and the cards.</p>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <section className="flex flex-col gap-2.5">
            <Caps>Carried From Yesterday</Caps>
            <TaskCard task={{ id: "y1", title: "#98 Children appear on the plan", estimate: "3:00", channel: "sprint", note: "started yesterday" }} />
            <Choice options={["Today", "Tomorrow", "Later"]} />
            <TaskCard task={{ id: "y2", title: "Reading – 20 min", estimate: "0:20", channel: "habit", note: "missed yesterday" }} />
            <Choice options={["Today", "Skip once"]} />
            <Caps className="mt-2.5">Habits</Caps>
            <TaskCard task={{ id: "y3", title: "English – Side by Side, unit 7", estimate: "0:15", channel: "habit", note: "lesson ready · 08:30" }} />
          </section>
          <section className="flex flex-col gap-2.5">
            <Caps>Suggested</Caps>
            <div className="flex flex-col gap-2 rounded-xl px-3.5 py-3 shadow-[var(--ud-shadow-small),inset_3px_0_0_var(--ud-accent)] material-small">
              <div className="flex items-center gap-2">
                <Badge tone="blue">Claude</Badge>
                <span className="type-label-12 text-muted-foreground">from the boards, the cards and Life</span>
              </div>
              <p className="type-copy-13">#101 is next on the frontier, and the school photos are due tomorrow. The VPS token expires in 7 days – 30 minutes would do it.</p>
            </div>
            <TaskCard task={{ id: "s1", title: "#101 Remind both adults of an Event", estimate: "2:30", channel: "sprint" }} />
            <TaskCard task={{ id: "s2", title: "Pay the school photos", estimate: "0:10", channel: "life", note: "due Fri" }} />
            <TaskCard task={{ id: "s3", title: "VPS – renew the backup token", estimate: "0:30", channel: "rest", note: "expires 12 Nov" }} />
            <p className="pl-1 type-label-12 text-muted-foreground">Not now – in Later: “a Ramadan page for Hatimly”, “a post on Undrift”</p>
          </section>
        </div>
        <div className="mt-auto flex items-end gap-2">
          <div className="grow">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="font-medium">6 h 35 planned</span>
              <span className="type-label-12 text-muted-foreground">of 7 h you have today</span>
            </div>
            <Meter value={0.94} className="mt-1.5 max-w-[420px]" />
          </div>
          <Action variant="secondary" size="small" onClick={() => setToday("day")}>
            Back
          </Action>
          <Action size="small" onClick={() => setToday("day")}>
            Next: Timebox <Key>↵</Key>
          </Action>
        </div>
      </div>
      <aside className="overflow-hidden border-l border-border bg-card px-3.5 pt-4">
        <div className="mb-3 flex items-center">
          <span className="grow font-medium">Thu {TODAY.day}</span>
          <span className="type-label-12 text-muted-foreground">drag to timebox</span>
        </div>
        <Timeline
          blocks={[
            { start: 8.5, end: 8.75, channel: "habit", title: "English · 15 min" },
            { start: 12, end: 13.5, channel: "rest", title: "Lunch", faded: true },
            { start: 16.75, end: 17.25, channel: "life", title: "School pick-up", faded: true },
          ]}
          hour={44}
        />
      </aside>
    </div>
  );
}

function Choice({ options }: { options: string[] }) {
  const [on, setOn] = useState(0);
  return (
    <div className="flex gap-1.5 pl-1">
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          onClick={() => setOn(i)}
          className={cn("h-[26px] rounded-full px-2.5 text-[12.5px]", on === i ? "bg-primary text-primary-foreground" : "bg-card text-text-2 edge")}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** The evening: what was done, where the rest goes, and the card Claude drafted to keep. */
function ShutDown() {
  const { tasks, setToday } = useStore();
  const done = tasks.filter((t) => t.done);
  const open = tasks.filter((t) => !t.done);
  return (
    <div className="flex h-full justify-center overflow-y-auto px-8 py-[30px]">
      <div className="flex w-[760px] flex-col gap-4">
        <div>
          <p className="type-label-12 text-muted-foreground">
            {TODAY.weekday} {TODAY.day} · 18:10
          </p>
          <h1 className="type-heading-24">Shut down for today</h1>
          <p className="type-label-13 text-muted-foreground">What happened, what moves, and where each project stands – so tomorrow starts from the page.</p>
        </div>
        <section className="flex flex-col gap-2.5 rounded-xl px-[18px] py-4 material-small">
          <div className="flex items-center">
            <h2 className="grow type-label-14 font-medium">Done</h2>
            <span className="type-label-12 text-muted-foreground">
              {done.length} of {tasks.length}
            </span>
          </div>
          {done.length === 0 && <p className="type-label-13 text-muted-foreground">Nothing checked yet – tick a task on Today.</p>}
          {done.map((t) => (
            <div key={t.id} className="flex items-center gap-2.5">
              <Check done size={16} />
              <span className="grow text-[13.5px] text-text-2">{t.title}</span>
              <ChannelTag channel={t.channel} />
            </div>
          ))}
        </section>
        <section className="flex flex-col gap-2.5 rounded-xl px-[18px] py-4 material-small">
          <h2 className="type-label-14 font-medium">Not Done</h2>
          {open.map((t) => (
            <div key={t.id} className="flex items-center gap-2.5">
              <Check size={16} />
              <span className="grow text-[13.5px]">{t.title}</span>
              <Choice options={t.channel === "habit" ? ["Tonight 21:00", "Later"] : ["Tomorrow", "Later"]} />
            </div>
          ))}
        </section>
        <section className="flex flex-col gap-3 rounded-xl px-[18px] py-4 shadow-[var(--ud-shadow-small),inset_3px_0_0_var(--ud-accent)] material-small">
          <div className="flex items-center gap-2">
            <h2 className="type-label-14 font-medium">Reprise Card · {DRAFT_CARD.project}</h2>
            <Badge tone="blue">drafted by Claude when the session ended</Badge>
          </div>
          <dl className="grid grid-cols-[90px_1fr] gap-x-4 gap-y-2 text-[13.5px]">
            <dt className="text-muted-foreground">Done</dt>
            <dd>{DRAFT_CARD.done}</dd>
            <dt className="text-muted-foreground">Next</dt>
            <dd className="font-medium">{DRAFT_CARD.next}</dd>
            <dt className="text-muted-foreground">Blocked by</dt>
            <dd>{DRAFT_CARD.blocked}</dd>
          </dl>
          <div className="flex gap-2">
            <Action variant="secondary" size="small">
              Edit
            </Action>
            <Action size="small">Keep It</Action>
          </div>
        </section>
        <div className="flex items-center">
          <span className="grow type-label-12 text-muted-foreground">Captured today: 3 – sorted on Sunday</span>
          <Action size="small" onClick={() => setToday("day")}>
            Close the Day <Key>↵</Key>
          </Action>
        </div>
      </div>
    </div>
  );
}
