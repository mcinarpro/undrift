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
The one to three Projects Mehmet chose to push, each with the moment he chose it. Undrift measures
the Drift from that intention: the days since choosing, and how many of them had Activity.
_Avoid_: Pin, favourite, star, active

**Hide**:
A Project left out of every view. Exact path, never a pattern.
_Avoid_: Ignore, archive

**Let Go**:
Taking one Loose End off Home until the Project's next Activity, for work Mehmet chose not to
finish. The Project stays everywhere else.
_Avoid_: Dismiss, snooze, ignore, archive

**Area**:
A theme Mehmet files Projects under – a site and its spin-offs, the mobile apps, a field of study.
A Project sits in one Area at most, chosen on its page. An Area has a colour, and exists while it
holds a Project.
_Avoid_: Folder, group, category, workspace

**Home**:
The first page Undrift opens on: the Loose Ends, newest first, and beside them, on a wide window,
Needs You over the Issues ready to Start – on a narrower one the Issues come under the Loose Ends.
Nothing else competes with them.
_Avoid_: Overview, dashboard, inbox

**Needs You**:
The open Sessions across every Project that Home lists beside the Loose Ends: those waiting on
Mehmet, then those busy, then those gone quiet in the last day – one left overnight is quiet by
the morning. It lists them; the Sessions Open figure only counts them.
_Avoid_: Inbox, notifications, attention, alerts

**Loose End**:
A Project whose git repository holds work not yet committed or not yet pushed, and whose last
Session is more recent than its last commit – whoever made the changes. A folder that is not a git
repository is never one.
_Avoid_: Unfinished, pending, WIP, dirty repo

**Graph**:
The Projects drawn as a network: a hub per Area, a node per Project tied to it, a dot per Session
tied to its Project.
_Avoid_: Map, scene, Office

**Lanes**:
The Projects drawn in time: a row per Project grouped by Area, its days with Activity across 30
days, and the Sessions open Now.
_Avoid_: Timeline, list

**Unsorted**:
The Projects in no Area, tied to the Unsorted hub in the Graph.
_Avoid_: Other, misc, uncategorized

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
Opening a terminal running Claude Code in a Project with an Issue as its first prompt.
_Avoid_: Launch, run, kick off, implement
