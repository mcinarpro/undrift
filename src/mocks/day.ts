// Mock data for the v2 screens (docs/v2.md). Nothing here is read from the disk or GitHub: the
// screens are drawn first, and the bridge fills them once Mehmet has used them and kept them.
// The names are his real Projects; every task, time and ticket is an example.

/** What a task or a time block belongs to – the one colour it carries on the day. */
export type Channel = "sprint" | "project" | "life" | "habit" | "rest";

export const CHANNEL_LABEL: Record<Channel, string> = {
  sprint: "home-sweet-plan",
  project: "hatimly",
  life: "life",
  habit: "habit",
  rest: "maintenance",
};

export type Task = {
  id: string;
  title: string;
  /** Planned time, h:mm. */
  estimate: string;
  channel: Channel;
  done?: boolean;
  /** One line under the title: the Reprise's Next, a due date, a note. */
  note?: string;
  /** The question an open Claude session waits on, when there is one. */
  waiting?: string;
};

export type Block = { start: number; end: number; channel: Channel; title: string; sub?: string; faded?: boolean };

export type PostIt = { id: string; num?: string; title: string; meta: string };

export const TODAY = {
  weekday: "Thursday",
  day: 5,
  month: "November",
  planned: "6 h 05",
  capacity: "7 h",
  /** Hour of the red line on the timeline. */
  now: 10.2,
};

export const SPRINT = {
  project: "Home Sweet Plan",
  day: 3,
  of: 5,
  progress: 0.6,
  summary: "5 tickets done · 2 Ready · ends Friday",
  next: "finish #98 – the Children on the plan, test red on the Events list",
  branch: "98-children-on-the-plan",
};

export const TASKS: Task[] = [
  { id: "t1", title: "English – Side by Side, unit 7", estimate: "0:15", channel: "habit", done: true, note: "lesson ready" },
  {
    id: "t2",
    title: "#98 Children appear on the plan",
    estimate: "3:00",
    channel: "sprint",
    note: "Next: the Events list test is red",
    waiting: "Should a Child own an Event?",
  },
  { id: "t3", title: "Pay the school photos", estimate: "0:10", channel: "life", note: "due Fri · → Hollogne school" },
  { id: "t4", title: "Check the yearly electricity bill", estimate: "0:20", channel: "life" },
  { id: "t5", title: "#101 Remind both adults of an Event the day before", estimate: "2:30", channel: "sprint" },
];

export const BLOCKS: Block[] = [
  { start: 8.5, end: 8.75, channel: "habit", title: "English · 15 min" },
  { start: 9, end: 12, channel: "sprint", title: "#98 Children on the plan", sub: "Claude waits on you" },
  { start: 12, end: 13.5, channel: "rest", title: "Lunch", faded: true },
  { start: 13.5, end: 14, channel: "life", title: "School photos · electricity bill" },
  { start: 14, end: 16.5, channel: "sprint", title: "#101 Remind both adults" },
  { start: 16.5, end: 17, channel: "rest", title: "VPS backup token" },
  { start: 21, end: 21.33, channel: "habit", title: "Reading · 20 min" },
];

export const BACKLOG: Record<"sprint" | "life" | "later", PostIt[]> = {
  sprint: [
    { id: "p96", num: "#96", title: "A shopping list two adults share", meta: "Ready · ~3 h" },
    { id: "p104", num: "#104", title: "Empty state of the Events tab", meta: "Ready · ~1 h" },
    { id: "p94", num: "#94", title: "Review PR #97", meta: "Review · ~30 min" },
    { id: "p106", num: "#106", title: "Push when a Task is reassigned", meta: "To do · ~2 h" },
  ],
  life: [
    { id: "l1", title: "Book the car's technical inspection", meta: "before 30 Nov" },
    { id: "l2", title: "Garden – mark out the terrace, 30 min", meta: "Sat morning" },
  ],
  later: [
    { id: "x1", title: "A Ramadan page for Hatimly", meta: "after the Sprint" },
    { id: "x2", title: "A post about Undrift", meta: "after the Sprint" },
  ],
};

export const HABITS = [
  { name: "English", week: [1, 1, 1, 1, 1, 0, 1], label: "5 days" },
  { name: "Reading", week: [0, 0, 1, 1, 0, 1, 1], label: "2 days" },
];

/** The Reprise card Claude drafted when the Sprint's session ended. */
export const DRAFT_CARD = {
  project: "Home Sweet Plan",
  done: "#98 merged – a Child appears on the plan without an account",
  next: "/start-ticket 101 – the reminder job runs at 18:00 in the Family's time zone",
  blocked: "—",
};

export const WEEK = [
  { label: "Mon 2", tasks: [["#92 Assign a Task", "sprint", 1], ["English", "habit", 1], ["Swimming – kids", "life", 1]] },
  { label: "Tue 3", tasks: [["#94 Filter chips", "sprint", 1], ["English", "habit", 1], ["Reading", "habit", 1]] },
  { label: "Wed 4", tasks: [["#98 Child model", "sprint", 1], ["English", "habit", 1], ["Car insurance quote", "life", 1]] },
  {
    label: "Thu 5",
    tasks: [
      ["#98 Children on the plan", "sprint", 0],
      ["#101 Remind both adults", "sprint", 0],
      ["School photos", "life", 0],
      ["Electricity bill", "life", 0],
      ["English", "habit", 1],
      ["Reading", "habit", 0],
    ],
  },
  { label: "Fri 6", tasks: [["#96 Shopping list", "sprint", 0], ["Review PR #97", "sprint", 0], ["English", "habit", 0], ["Reading", "habit", 0]] },
  { label: "Sat 7", tasks: [["Garden – mark out the terrace", "life", 0], ["Reading", "habit", 0]] },
  { label: "Sun 8", tasks: [["Weekly review – 30 min", "life", 0], ["Reading", "habit", 0]] },
] as { label: string; tasks: [string, Channel, 0 | 1][] }[];

export type ProjectRow = {
  id: string;
  name: string;
  initials: string;
  color: string;
  kind: string;
  rhythm: string;
  week: number[];
  last: string;
  state?: { text: string; tone: "red" | "amber" | "blue" | "grey" };
  next: string;
  group: "Sprint" | "Behind Their Rhythm" | "On Rhythm";
};

export const PROJECTS: ProjectRow[] = [
  { id: "hsp", name: "Home Sweet Plan", initials: "HS", color: "#b45309", kind: "dev · board 2 Ready", rhythm: "sprint", week: [0, 0, 1, 1, 1, 1, 1], last: "now", state: { text: "PR #97 to review", tone: "blue" }, next: "Finish #98 – the Children on the plan", group: "Sprint" },
  { id: "vps", name: "VPS", initials: "V", color: "#475569", kind: "maintenance", rhythm: "monthly", week: [0, 0, 0, 0, 0, 0, 0], last: "34 d", state: { text: "4 d late", tone: "amber" }, next: "Renew the backup token before 12 Nov", group: "Behind Their Rhythm" },
  { id: "site", name: "mehmetcinar.com", initials: "M", color: "#7c3aed", kind: "dev", rhythm: "weekly", week: [0, 0, 0, 0, 0, 0, 0], last: "9 d", state: { text: "stale card", tone: "grey" }, next: "Write the post about Undrift", group: "Behind Their Rhythm" },
  { id: "hatimly", name: "Hatimly", initials: "H", color: "#0f766e", kind: "dev · in production", rhythm: "weekly", week: [1, 1, 0, 0, 1, 0, 0], last: "2 d", state: { text: "PR #214 checks failing", tone: "red" }, next: "Fix the expired-link join flow (#212)", group: "On Rhythm" },
  { id: "en", name: "English", initials: "EN", color: "#0369a1", kind: "habit", rhythm: "daily", week: [1, 1, 0, 1, 1, 1, 1], last: "today", next: "Side by Side, unit 7", group: "On Rhythm" },
  { id: "core", name: "Core", initials: "C", color: "#4d4d4d", kind: "second brain", rhythm: "weekly", week: [0, 0, 1, 0, 0, 0, 1], last: "1 d", state: { text: "9 in inbox", tone: "grey" }, next: "Sort the inbox on Sunday", group: "On Rhythm" },
  { id: "undrift", name: "Undrift", initials: "U", color: "#171717", kind: "dev", rhythm: "weekly", week: [1, 0, 0, 0, 0, 0, 1], last: "today", next: "v2 – the Today planner", group: "On Rhythm" },
];

export const BOARD: Record<"Ready" | "Doing" | "Review" | "Done", (PostIt & { faded?: boolean })[]> = {
  Ready: [
    { id: "b101", num: "#101", title: "Remind both adults of an Event the day before", meta: "server · mobile" },
    { id: "b96", num: "#96", title: "A shopping list two adults share", meta: "spec #88" },
  ],
  Doing: [{ id: "b98", num: "#98", title: "Children appear on the plan", meta: "session open" }],
  Review: [{ id: "b94", num: "#94", title: "Filter chips on the Tasks list", meta: "PR #97 · checks pass" }],
  Done: [
    { id: "b92", num: "#92", title: "Assign a Task to the other adult", meta: "", faded: true },
    { id: "b90", num: "#90", title: "A week of Events at a glance", meta: "", faded: true },
  ],
};

export const SESSIONS = [
  { id: "s1", project: "Home Sweet Plan", channel: "sprint" as Channel, state: "waits on you", tone: "blue", label: "Sprint · #98", kind: "question" },
  { id: "s2", project: "Hatimly", channel: "project" as Channel, state: "working · 12 min", tone: "green", label: "delegated · #212", kind: "working" },
  { id: "s3", project: "Home Sweet Plan", channel: "sprint" as Channel, state: "dev server", tone: "grey", label: "Sprint · #98", kind: "server" },
] as const;

export const ENDED = [
  { project: "VPS", channel: "rest" as Channel, text: "Renewed the backup token – card written", took: "10 min" },
  { project: "Core", channel: "habit" as Channel, text: "Sorted 5 captures into notes", took: "6 min" },
];
