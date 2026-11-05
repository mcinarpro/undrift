import { Action } from "@/components/action";
import { Caps, ChannelTag, Check, Streak, channelColor, channelTint } from "@/components/planner";
import { cn } from "@/lib/utils";
import { HABITS, SPRINT, WEEK } from "@/mocks/day";

// The week as Sunsama lays it out: a column per day, the Sprint as a band over its five days, the
// habits under it. Moving a task to another day is how it is put off – never lost.
export function Week() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3.5 px-7 py-[22px]">
      <div className="flex items-end gap-2">
        <div className="grow">
          <h1 className="type-heading-24">Week 45</h1>
          <p className="type-label-13 text-muted-foreground">
            2 – 8 November · Sprint <strong className="font-medium text-foreground">{SPRINT.project}</strong> Mon → Fri · next: Hatimly
          </p>
        </div>
        <Action variant="secondary" size="small">
          ‹ ›
        </Action>
        <Action variant="secondary" size="small">
          Weekly Review
        </Action>
      </div>
      <div className="grid grid-cols-7 gap-2.5">
        <div
          className="col-span-5 flex h-[26px] items-center rounded-md border px-2.5 text-[12.5px] font-medium"
          style={{ background: channelTint("sprint"), color: channelColor("sprint"), borderColor: "color-mix(in srgb, var(--ud-ch-sprint) 40%, transparent)" }}
        >
          Sprint · {SPRINT.project} · day {SPRINT.day} of {SPRINT.of}
        </div>
        <div className="col-span-2 flex h-[26px] items-center rounded-md border border-dashed border-line-strong px-2.5 text-[12.5px] text-muted-foreground">
          Rest · Life · Review
        </div>
      </div>
      <div className="grid min-h-0 grow grid-cols-7 gap-2.5">
        {WEEK.map((d, i) => (
          <section key={d.label} className={cn("flex min-h-0 flex-col gap-2 overflow-hidden", i === 3 && "-m-1.5 rounded-[10px] bg-alpha-100 p-1.5")}>
            <div className="flex items-center px-0.5">
              <span className={cn("grow text-[13.5px]", i === 3 ? "font-semibold" : "font-medium")}>{d.label}</span>
              <span className="type-label-12 text-muted-foreground">{i < 3 ? "✓" : i === 3 ? "6h05" : ""}</span>
            </div>
            {d.tasks.map(([t, c, done]) => (
              <div key={t} className="flex flex-col gap-1 rounded-[10px] px-2.5 py-2 material-small">
                <div className="flex items-start gap-2">
                  <Check done={!!done} size={14} />
                  <span className={cn("text-[12.5px] leading-4 font-medium", done && "text-muted-foreground line-through")}>{t}</span>
                </div>
                <div className="pl-[22px]">
                  <ChannelTag channel={c} />
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
      <div className="flex items-center gap-7 rounded-xl px-4 py-3 material-small">
        <Caps>Habits</Caps>
        {HABITS.map((h) => (
          <div key={h.name} className="flex items-center gap-2.5">
            <span className="text-[13.5px] font-medium">{h.name}</span>
            <Streak week={h.week} today={3} />
            <span className="type-label-12 text-muted-foreground">{h.week.filter(Boolean).length} of 7</span>
          </div>
        ))}
        <span className="grow" />
        <span className="type-label-12 text-muted-foreground">Later: 4 ideas waiting for the next Sprint</span>
      </div>
    </div>
  );
}
