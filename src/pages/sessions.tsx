import { Action } from "@/components/action";
import { MiniTerm } from "@/components/mock-terminal";
import { Badge, channelColor } from "@/components/planner";
import { ENDED, SESSIONS } from "@/mocks/day";
import { useStore } from "@/store";

// Every Claude running on this machine, each with a glimpse of its terminal: the one that waits on
// Mehmet first, the one working on its own, then the servers. Below, the ones that ended today,
// whose cards are already written.
export function Sessions() {
  const setToday = useStore((s) => s.setToday);
  return (
    <div className="flex flex-col gap-4 px-8 py-7">
      <div className="flex items-end">
        <div className="grow">
          <h1 className="type-heading-24">Sessions</h1>
          <p className="type-label-13 text-muted-foreground">Every Claude running on this machine – one waits on you, one works on its own</p>
        </div>
        <div className="flex gap-0.5 rounded-lg bg-alpha-100 p-0.5 text-[13px]">
          <span className="flex h-[26px] items-center rounded-md px-2.5 material-small">Running 3</span>
          <span className="flex h-[26px] items-center px-2.5 text-text-2">Ended today 2</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {SESSIONS.map((s) => (
          <div key={s.id} className="flex flex-col overflow-hidden rounded-xl material-small">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="size-2 rounded-[2px]" style={{ background: channelColor(s.channel) }} />
              <span className="grow text-[13.5px] font-medium">{s.project}</span>
              <Badge tone={s.tone as "blue" | "green" | "grey"}>{s.state}</Badge>
            </div>
            <MiniTerm kind={s.kind} />
            <div className="flex items-center gap-1.5 px-3 py-2">
              <span className="grow type-label-12 text-muted-foreground">{s.label}</span>
              <Action variant="secondary" size="small" onClick={() => s.kind === "question" && setToday("focus")}>
                Open
              </Action>
            </div>
          </div>
        ))}
      </div>
      <section className="flex flex-col gap-2.5 rounded-xl px-4 py-3.5 material-small">
        <div className="flex items-center">
          <h2 className="grow type-label-14 font-medium">Ended Today</h2>
          <span className="type-label-12 text-muted-foreground">their cards are written</span>
        </div>
        {ENDED.map((e) => (
          <div key={e.project} className="flex items-center gap-2.5">
            <span className="size-2 rounded-[2px]" style={{ background: channelColor(e.channel) }} />
            <span className="w-[120px] text-[13.5px] font-medium">{e.project}</span>
            <span className="grow text-[13px] text-text-2">{e.text}</span>
            <span className="type-label-12 text-muted-foreground">{e.took}</span>
            <Action variant="secondary" size="small">
              Resume
            </Action>
          </div>
        ))}
      </section>
    </div>
  );
}
