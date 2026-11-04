# Undrift

A desktop cockpit that shows Mehmet where he left each Project and lets him Resume it.

## Language

**Project**:
A folder Undrift follows: a git root under `~/workspace`, or a folder a Session ran in. It is
identified by its absolute path.
_Avoid_: Agent, repo, workspace, desk

**Discovery**:
How Undrift finds Projects by itself, from the git roots and the Session folders. Hides take
Projects out of it.
_Avoid_: Import, scan settings

**Focus**:
The one to four Projects Mehmet chose to push, each with the moment he chose it – on its page, or
by dragging it onto the Board.
Undrift measures the Drift from that intention: the days since choosing, and how many of them had
Activity.
_Avoid_: Pin, favourite, star, active

**Hide**:
A Project left out of every view. Exact path, never a pattern.
_Avoid_: Ignore, archive

**Let Go**:
Taking one Loose End off the Board – its flag, its Up Next, its *Left off* on the Shelf – until the
Project's next Activity, for work Mehmet chose not to finish. The Project stays everywhere else.
_Avoid_: Dismiss, snooze, ignore, archive

**Home**:
The first page Undrift opens on: Up Next, then the Board, then the Shelf. Nothing else competes
with them.
_Avoid_: Overview, dashboard, inbox, Kanban

**Up Next**:
The one thing to pick up, named in a line above the Board, and what Enter does on Home: the newest
Loose End whose Session is not open, to Resume; else the first Note pulled into Today, to Start;
else the first Note ready on the Project in Focus that drifted most. A Session still open runs in
its own window, so it is never Up Next – the greeting names the one that has waited on Mehmet longest.
_Avoid_: Next action, suggestion, recommendation

**Board**:
Home's stage: a Lane per Project in Focus, and three columns a Note moves through – Ready, Today,
Doing. One white surface with a dot grid, the paper on it.
_Avoid_: Kanban, sprint, dashboard, desk

**Lane**:
A Project in Focus as a row of the Board: its strip of tape on the left – the Project, its Status,
the pull request that needs it, its Focus Gauge – then its Notes in Ready, Today and Doing, and in Doing its Cards.
Its paper is its place: the first Lane's pad is yellow, the second pink, the third green, the
fourth lavender. Its tape dragged onto the Shelf takes the Project out of Focus.
_Avoid_: Swimlane, row, timeline

**Note**:
An Issue on the Board, a square of paper torn from its Lane's pad, leaning the way its number
says. It moves forward by drag or by its `⋯` menu: into Today to plan it, into Doing to Start it.
A blocked Issue is a grey Note that says what it waits on and cannot be moved.
_Avoid_: Post-it, sticky, card, ticket

**Today**:
The Issues Mehmet pulled forward, each with the moment he pulled it – Undrift's second intention
after Focus, kept in `config.json` by URL. A selection of GitHub Issues, never a text: an Issue
leaves Today when it closes on GitHub or when it is Started.
_Avoid_: Queue, plan, backlog, task list

**Doing**:
The Board's third column: the Project's open Sessions as Cards, each with the Note it was Started
from under it, and the Notes Started from Undrift whose Session has ended – they can Resume it –
until the Issue closes or Mehmet takes them out.
_Avoid_: In progress, WIP

**Done**:
The Board's last column: the last three Issues closed on GitHub in the last 7 days, faded, leaving
on their own – the head counts them all. Nothing is dragged into or out of it – closing the Issue on GitHub is what moves a Note there.
_Avoid_: Finished, archive, history

**Card**:
A Session in a Lane's Doing cell: a white card pinned by its Status – a black head waits on Mehmet,
a blue one works, a hollow one has gone quiet – flagged *Left off* when it is the Session a Loose
End was left in, with the Note it was Started from under its corner. An open Session runs in its
own window; only an earlier one gets Resume.
_Avoid_: Pin, tile, note

**Shelf**:
Every Project not in Focus, one line each under the Board, the ones that need Mehmet first: a
Session waiting on him, a busy one, a Loose End, then In motion, Drifting, Parked. Dragged onto the
Board, a Project goes into Focus.
_Avoid_: Sidebar, list, backlog

**Needs You**:
The open Sessions waiting on Mehmet. The greeting names the one that has waited longest; a Card's
black head and a Shelf item's *Waiting* mark the others.
_Avoid_: Inbox, notifications, attention, alerts

**Loose End**:
A Project whose git repository holds work not yet committed or not yet pushed, and whose last
Session is more recent than its last commit – whoever made the changes. A folder that is not a git
repository is never one, nor is a repository with no commit yet.
_Avoid_: Unfinished, pending, WIP, dirty repo

**Graph**:
The Projects drawn as a network: one hub, a node per Project tied to it, a dot per Session tied
to its Project.
_Avoid_: Map, scene, Office

**Session**:
One Claude Code conversation in a Project, identified by its session id. It is either open
(a `claude` process runs it) or earlier (only its transcript remains).
_Avoid_: Chat, conversation, agent

**Status**:
What an open Session is doing: busy (working on a turn), waiting (finished its turn, less than
10 minutes ago), quiet (finished longer ago). A Project with no open Session is off.
_Avoid_: State, idle

**Activity**:
A commit or a Session turn on a Project, counted per day.
_Avoid_: Event, contribution

**Drift**:
The time since the last Activity on a Project. It decides whether a Project is In motion,
Drifting or Parked.
_Avoid_: Silence, staleness, idle time

**Group**:
Which of In motion, Drifting or Parked a Project is in, decided by its Drift.
_Avoid_: Status, state, category

**In motion**:
A Project with Activity today or an open Session.
_Avoid_: Active, current

**Drifting**:
A Project whose last Activity was 1 to 30 days ago. Drifting Projects come first, the one with the
most active days in the last 30 at the top: the streak you broke matters more than the oldest
silence.
_Avoid_: Stale, idle, abandoned

**Parked**:
A Project with no Activity for more than 30 days. Listed last, never nagged about.
_Avoid_: Archived, dead, dormant

**Drift strip**:
The 30-day view with one row per Project and one cell per day that had Activity.
_Avoid_: Heatmap, timeline, calendar

**Reads First**:
What every Session in a Project loads before its first prompt – `CLAUDE.md`, `AGENTS.md`,
`CLAUDE.local.md`, the rules under `.claude/rules/` with no `paths`, and the frontmatter of each
skill – shown as a size on the Project page. A Project with nothing to read shows none.
_Avoid_: Context, instructions, system prompt

**Resume**:
Reopening an earlier Session in a terminal, with `claude --resume`.
_Avoid_: Restore, continue, reopen

**Issue**:
A GitHub issue of a Project's repository: the unit of work Undrift starts from. It is ready to
Start when no open Issue blocks it, as GitHub's dependencies say; a blocked one stays on the
Project page without Start. Undrift reads Issues and never writes them.
_Avoid_: Ticket, task, todo, job

**Start**:
Opening a terminal running Claude Code in a Project with an Issue as its first prompt – from a
Note, by drag into Doing or by its button, or from the Project page – and a session id Undrift
chose. Undrift remembers the moment and the id, so the Note sits in Doing, under its Card.
_Avoid_: Launch, run, kick off, implement
