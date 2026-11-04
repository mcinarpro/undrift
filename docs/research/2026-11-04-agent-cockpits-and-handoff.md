# What the field does in 2026 – cockpits, handoff, and "what should I do this morning"

Researched 2026-11-04 with three parallel web surveys (mission-control UIs; resume and memory
conventions; cross-repo status and daily-brief tools). Every claim below carries its source; what
could not be verified is marked.

## The question

Undrift's user has ~12 repos, a few hours a week, and works through Claude Code in terminals. He
wants to open the machine in the morning and be told, in one sentence, where he was and the next
verifiable action. Is a desktop cockpit the right object, and what should feed it?

## 1. Cockpits for coding agents – the landscape

| Tool | Shape | Status source | Note |
|---|---|---|---|
| [Conductor](https://www.conductor.build) | Mac app, worktree per workspace, backlog/in progress/in review/done | own process | Joining Meta 2026-11-04; cloud off Nov 20 ([changelog](https://www.conductor.build/changelog/0.93.0-conductor-is-joining-meta)) |
| [Paradev](https://github.com/ParadevAI/Paradev) (ex-Superset) | 15.9k★, worktree per task, sidebar working / done / waiting | hooks it installs, inert outside the app ([docs](https://docs.paradev.com/agent-status)) | Linux experimental |
| [Emdash](https://github.com/generalaction/emdash) | 6.2k★, ticket → agent, PR and CI in one place | marker-tagged hooks | Linux deb/rpm |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) | 28.6k★, kanban of issues, workspace per issue | – | Company shut down 2026-04-10, community-maintained |
| [Claude Squad](https://github.com/smtg-ai/claude-squad) | 8.7k★ Go TUI, tmux + worktree per agent | tmux | Pause = commit and release the worktree |
| [Claude Code Desktop](https://code.claude.com/docs/en/desktop) | sessions sidebar, worktree toggle, OS notification when unfocused | own | Does not see CLI sessions; lost project grouping in some builds |
| [Claude Command Center](https://github.com/amirfish1/claude-command-center) | 215★, one board: Active / Needs you / Finished | **reads `~/.claude/projects/*.jsonl`** | Closest cousin to Undrift; the card shows *the question itself* |
| [opcode](https://github.com/winfunc/opcode) (ex-Claudia) | 22.4k★ Tauri, project browser over `~/.claude`, cost per project | reads JSONL | |
| [Kilo Agent Manager](https://kilo.ai/docs/automate/agent-manager) | VS Code panel, worktrees | `gh` | **PR badge per worktree**: draft, checks pending, failing, clean, merged |
| [claude-office](https://github.com/paulrobello/claude-office) | 600★ pixel office fed by hooks | hooks | Context-window fill drawn as a gauge; "Command Center" room groups needs-you / working / done |
| [Paperclip](https://github.com/paperclipai/paperclip) | 111k★ agent company: heartbeats, org chart, budgets | adapters | Overkill for one person; budget hard-stop is the idea |

Crystal is deprecated (→ Nimbalyst), "officelapse" and "Magnet" could not be verified.

**Patterns that recur**
- One worktree per task is table stakes in every product that owns the process.
- Status comes either from hooks the product installs, or from reading `~/.claude` transcripts. The
  hook camp churns (four deaths or renames in 2026); the read-only camp survives.
- Three states everywhere – working, needs you, done – and the better ones put the question or the
  approval text on the card, not just "waiting".
- Issue → workspace is the ingest path; the lifecycle ends at PR state (status groups, badges,
  auto-archive on merge).
- CI and PR checks feed back as a prompt ("Forward failing checks to Claude").
- Notifications: OS toast when unfocused, badge or unread, optional chime, phone push. Nobody polls
  the user.

**The gap**: no shipped tool shows projects × sessions × dirty state × ready issues across repos.
The Desktop app does not see CLI sessions, and the tmux tools cover one server.

## 2. How agents resume – what persists and who writes it

Claude Code built-ins ([memory](https://code.claude.com/docs/en/memory),
[sessions](https://code.claude.com/docs/en/sessions), [hooks](https://code.claude.com/docs/en/hooks)):

- **Auto memory** (since 2.1.59): `~/.claude/projects/<project>/memory/MEMORY.md` plus topic files,
  written by Claude during the session, loaded every session (first 200 lines). Note types `user`,
  `feedback`, `project` ("ongoing work, deadlines, decisions Claude can't derive from code or git"),
  `reference`. Present on this machine for `~` only, not yet per repo.
- **Session titles**: `custom-title` / `ai-title` JSONL records (format documented as internal,
  has broken before – [issue 64547](https://claudeissues.com/issue/64547-claude-resume-does-not-find-sessions-renamed-with-rename-by-custom-title)).
- **Hooks**: `SessionStart` can inject `additionalContext`; `Stop` receives `last_assistant_message`
  and has no tight budget; `SessionEnd` has a **1.5 s default budget** and fires on crashes never.
- **Tasks** are off by default on Fable-class models (`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`).

Elsewhere: Codex generates memories in the background after a chat idles
([docs](https://developers.openai.com/codex/memories)); Copilot's memories carry a **citation to a
code location and are re-validated against the branch before use**, 90-day expiry
([github.blog](https://github.blog/2026-01-09-building-an-agentic-memory-system-for-github-copilot));
Cursor removed Memories in 2.1.17; Amp replaced compaction by `/handoff` – the agent drafts the
next thread's starting prompt and the user edits it ([ampcode.com](https://ampcode.com/news/handoff)).

Community: [Beads](https://github.com/steveyegge/beads) (28.5k★, `bd ready` as the morning question,
"markdown plans rot"), [claude-mem](https://github.com/thedotmack/claude-mem) (112k★, Stop hook
summary with `next_steps`, SessionStart re-injection),
[planning-with-files](https://github.com/OthmanAdi/planning-with-files) (27.9k★, `task_plan.md`,
`progress.md`), and a dozen tiny HANDOFF.md plugins with no standard
([issue 11455](https://github.com/anthropics/claude-code/issues/11455), [persistent-handoff](https://github.com/adrrr/persistent-handoff)).

**Five practices the sources agree on**
1. Durable state is files on disk loaded deterministically at start, not the transcript.
2. A tiny always-loaded index (~200 lines), detail in topic files.
3. Persist decisions with their rationale and the next action; never transient state or anything
   derivable from code or git.
4. Every "done" and every next action is verifiable: a command, a commit hash, a `file:line`,
   re-checked on load. Handoffs that say "done" for work that never landed are the reported failure.
5. Write at milestones from the host's lifecycle hook (Stop, not SessionEnd), read back as
   untrusted context.

**The disagreement that matters here**: agent-written STATUS files rot – every field report says the
agent forgets to update them ([dbmcco](https://dbmcco.substack.com/p/my-vibe-coding-process-atm),
Yegge's 605 plan files). The tools that work *observe*: git dirty state, last commit versus last
session, the hook's own events. The myrepos `wip` action and tmux-agent-status both landed on the
same rule – **silence when clean, a reason when not**
([perrotta.dev](https://perrotta.dev/2026/07/myrepos-a-wip-action-to-find-unfinished-work/),
[tmux-agent-status](https://github.com/gs/tmux-agent-status)).

## 3. "What should I do this morning" – what works for a solo developer

- **Derive, do not declare.** Loose End from git and transcript dates is the right primitive; a
  handoff file is enrichment, never the source of truth.
- **`bd ready` as the morning question** – the one Beads idea with adoption evidence (`ready` on 42 %
  of telemetry machines). GitHub Issues with blocked-by gives the same answer without Dolt.
- **The agent organises, the human picks** – Doist's own Claude Code guidance, the Obsidian
  "propose three, you pick" pattern, Karpathy's autonomy slider.
- **`notify-send` from the `Notification` hook** is the only officially backed notification path
  ([hooks guide](https://code.claude.com/docs/en/hooks-guide)).
- **Cloud routines are not a morning surface for local repos**: no local files, MCP-only, silent
  failures ([field report](https://www.anothercodingblog.com/p/i-built-a-daily-brief-with-claude)).
  Desktop local scheduled tasks can read local files but need the app awake.

Hype: agent-company orchestrators, Ralph loops in brownfield repos (the originator says no), vector
memory below thousands of items, "Morning Brief" as a Claude feature (unverified).

## 4. What this changes for Undrift

**Keep, it is the right camp.** A local, read-only, cross-project cockpit over `~/.claude` and git is
exactly the gap the field leaves open, and the read-only tools are the ones that survived 2026.
The Loose End, the Status from transcripts, Up Next, and launching `claude` in a terminal are all
confirmed by prior art.

**Correct the plan.** Do not make an agent-written `HANDOFF.md` the primary source: it rots. State
stays derived. A handoff is optional enrichment, and the cheapest one already exists: Claude Code's
own auto memory under `~/.claude/projects/<project>/memory/` – read-only, inside the privacy
contract, no hook to install. A `project`-type note is the "ongoing work and decisions" line the Card
should carry.

**Steal, in this order**
1. **The question on the Card** (Claude Command Center): a waiting Session's last assistant
   message is in the JSONL the bridge already parses. The Card then says *what* it asks.
2. **PR state on the Lane** (Kilo): draft, checks pending, failing, clean, merged – one read-only
   `gh pr view` per repo, with a timeout as every `gh` call has.
3. **Silence when clean**: no Lane, no Card, no Up Next line unless there is a reason. The greeting
   already does this; the Board should too.
4. **Resume with a drafted prompt** (Amp): Resume and Start pass a first prompt built from the
   auto memory `project` note and the Loose End's diff summary, shown for editing before launch.
5. **Notify**: a `Notification` hook that calls `notify-send` is five lines in the dotfiles; the
   tray icon can badge the count of Sessions that need you.
6. **Context fill on the Card** (claude-office): usage numbers are already kept from transcripts.

**Cut from Home.** The Drift strip and the Focus Gauge describe; they stay on the Project page. The
Graph is a showpiece, not a morning surface. Worktree orchestration is not for one sequential
person.

**The test stands.** If the Board is not opened at 5:30 for two weeks, change the feature, not the
design.
