import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// A drawing of the integrated terminal, in Catppuccin – Latte with the light window, Mocha with the
// dark one, through the --ud-term-* tokens. The real one is xterm.js over a PTY, ported from
// Sentinel (docs/v2.md); until then this shows where it goes and what it holds.

const C = {
  dim: "text-[var(--ud-term-dim)]",
  peach: "text-[var(--ud-term-peach)]",
  green: "text-[var(--ud-term-green)]",
  red: "text-[var(--ud-term-red)]",
  blue: "text-[var(--ud-term-blue)]",
  bold: "font-semibold text-[var(--ud-term-text)]",
};

export type TermTab = { label: string; dot: "blue" | "green" | "dim"; on?: boolean };

const DOT = { blue: "var(--ud-term-blue)", green: "var(--ud-term-green)", dim: "var(--ud-term-dim)" };

export function TerminalTabs({ tabs, lead, right }: { tabs: TermTab[]; lead?: string; right?: ReactNode }) {
  return (
    <div className="flex h-[38px] shrink-0 items-center gap-0.5 border-b border-[var(--ud-term-tab)] bg-[var(--ud-term-bar)] px-2">
      {lead && <span className="px-1.5 text-[11.5px] text-[var(--ud-term-dim)]">{lead}</span>}
      {tabs.map((t) => (
        <span
          key={t.label}
          className={cn(
            "flex h-7 items-center gap-2 rounded-md px-3 text-[12.5px]",
            t.on ? "bg-[var(--ud-term-tab)] text-[var(--ud-term-text)]" : "text-[var(--ud-term-sub)]",
          )}
        >
          <span className="size-2 rounded-full" style={{ background: DOT[t.dot] }} />
          {t.label}
        </span>
      ))}
      <span className="px-2 text-[var(--ud-term-dim)]">+</span>
      <span className="grow" />
      {right && <span className="flex items-center gap-3 text-xs text-[var(--ud-term-dim)]">{right}</span>}
    </div>
  );
}

/** Claude Code at the moment it asks: the start of the session, the failing test, the question. */
export function ClaudeTranscript({ withTest = true }: { withTest?: boolean }) {
  return (
    <div className="font-mono text-[12.5px] leading-[19px] whitespace-pre text-[var(--ud-term-text)]">
      <div className="mb-2 inline-block rounded-md border border-[var(--ud-term-peach)] px-3 py-1.5">
        <span className={C.peach}>✻</span> <span className={C.bold}>Claude Code</span>
        {"\n"}
        <span className={C.dim}>{"  ~/workspace/home-sweet-plan  ⎇ 98-children-on-the-plan"}</span>
      </div>
      {"\n"}
      <span className={C.dim}> Reprise loaded – Next: finish #98, the Events list test is red</span>
      {"\n\n"}
      <span className={C.dim}>{">"}</span> continue #98{"\n"}
      {withTest && (
        <>
          {"\n"}
          <span className={C.green}>●</span> <span className={C.bold}>Bash</span>(mise run test:server){"\n"}
          {"  "}
          <span className={C.dim}>⎿</span> <span className={C.red}>Failed</span> An_adult_sees_the_Events_of_the_week{" "}
          <span className={C.dim}>(1 of 214)</span>
          {"\n"}
          <span className={C.dim}>{"     Child has no MemberId – EventsQuery.cs:42"}</span>
          {"\n"}
        </>
      )}
      {"\n"}
      <span className={C.green}>●</span> <span className={C.bold}>Read</span>(apps/server/Domain/Event.cs){"\n"}
      {"  "}
      <span className={C.dim}>⎿  Read 88 lines</span>
      {"\n\n"}
      <span className={C.bold}>●</span> The test fails because an Event's owner is a Member, and a{"\n"}
      {"  Child is not one. Two ways out:\n\n"}
      {"  "}
      <span className={C.blue}>1.</span> A Child can own an Event – the owner becomes a Person{"\n"}
      <span className={C.dim}>{"     (touches ADR 0007, the query filter)"}</span>
      {"\n  "}
      <span className={C.blue}>2.</span> Events stay owned by an adult; a Child is a participant{"\n"}
      <span className={C.dim}>{"     (no migration of existing Events)"}</span>
      {"\n\n  Which one?"}
    </div>
  );
}

export function ClaudeInput({ text }: { text: string }) {
  return (
    <div className="font-mono text-[12.5px] leading-[19px]">
      <div className="rounded-md border border-[var(--ud-term-edge)] bg-[var(--ud-term-bar)] px-3 py-1.5 text-[var(--ud-term-text)]">
        <span className={C.bold}>{">"}</span> {text}
        <span className="inline-block h-[15px] w-2 bg-[var(--ud-term-cursor)] align-[-3px]" />
      </div>
      <div className={cn("mt-1 flex justify-between px-3", C.dim)}>
        <span>? for shortcuts</span>
        <span>⏵⏵ accept edits off</span>
      </div>
    </div>
  );
}

/** The terminal surface: its own Catppuccin ground, the transcript, the input pinned at the bottom. */
export function MockTerminal({ withTest, className }: { withTest?: boolean; className?: string }) {
  return (
    <div className={cn("relative flex min-h-0 grow flex-col overflow-hidden bg-[var(--ud-term-bg)] px-[18px] pt-3.5 pb-3.5", className)}>
      <div className="min-h-0 grow overflow-hidden">
        <ClaudeTranscript withTest={withTest} />
      </div>
      <ClaudeInput text="2 – a Child is a participant, keep ADR 0007 as it is" />
    </div>
  );
}

/** A few lines of another terminal, for the Sessions cards. */
export function MiniTerm({ kind }: { kind: "question" | "working" | "server" }) {
  const lines: Record<typeof kind, ReactNode> = {
    question: (
      <>
        <span className={C.bold}>●</span> Two ways out:{"\n"}
        {"  "}
        <span className={C.blue}>1.</span> A Child can own an Event{"\n"}
        {"  "}
        <span className={C.blue}>2.</span> Events stay owned by an adult{"\n"}
        {"  Which one?\n\n"}
        <span className={C.dim}>{">"}</span> <span className="inline-block h-3 w-1.5 bg-[var(--ud-term-cursor)] align-[-2px]" />
      </>
    ),
    working: (
      <>
        <span className={C.green}>●</span> <span className={C.bold}>Edit</span>(src/join/link.ts){"\n"}
        <span className={C.dim}>{"  ⎿  +14 −3"}</span>
        {"\n"}
        <span className={C.green}>●</span> <span className={C.bold}>Bash</span>(pnpm test e2e/group-join){"\n"}
        {"  "}
        <span className={C.dim}>⎿</span> <span className={C.green}>Passed</span> 12 of 12{"\n"}
        <span className={C.peach}>✻</span> <span className={C.dim}>Opening the pull request…</span>
      </>
    ),
    server: (
      <>
        <span className={C.dim}>[api]</span> Now listening on: http://localhost:5073{"\n"}
        <span className={C.dim}>[api]</span> GET /events?week=45 <span className={C.green}>200</span> 14 ms{"\n"}
        <span className={C.dim}>[api]</span> GET /children <span className={C.green}>200</span> 6 ms{"\n"}
        <span className={C.dim}>[api]</span> POST /events <span className={C.red}>400</span> child_not_member
      </>
    ),
  };
  return (
    <div className="h-[150px] overflow-hidden bg-[var(--ud-term-bg)] px-3 py-2.5 font-mono text-[11px] leading-4 whitespace-pre text-[var(--ud-term-text)]">
      {lines[kind]}
    </div>
  );
}
