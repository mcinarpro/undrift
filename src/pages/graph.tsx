import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type ForceLink, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Action } from "@/components/action";
import { Activity, AreaName, AreaSwatch, Diff, Empty, Field, GroupBadge, GroupDot, ProjectAvatar, STATUS_DOT, StatusMark, useNow, When } from "@/components/bits";
import { Icon } from "@/components/icon";
import { status, type StatusName } from "@/lib/home";
import { drift, group, lastSession, ordered, type Group } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { Project, Session } from "@/types";

// The Graph (GLOSSARY.md, DESIGN.md § Layout): the Projects as a network – a hub per Area in its
// colour, a node per Project ringed in its group's colour, a dot per Session by Status – laid out
// by a d3-force simulation and drawn in SVG. It is the one page that moves on its own (DESIGN.md
// § Shape and motion): the network settles, a busy Session's dot pulses, and sparks run from it to
// its Project and on to the Area. A click on a node opens its panel on the right, so the network
// stays in view while one of its parts is read.

/** An earlier Session has no Status: only its transcript remains (GLOSSARY.md § Session). */
type Dot = StatusName | "Earlier";

type Kind = "hub" | "project" | "session";

type GraphNode = SimulationNodeDatum & {
  id: string;
  kind: Kind;
  /** The node it is tied to: a Project's hub, a Session's Project; null for a hub. */
  parent: string | null;
  label: string;
  /** A hub's Area colour; none for Unsorted. */
  color?: string;
  /** A Project node's Project, and a Session dot's. */
  project?: Project;
  group?: Group;
  dot?: Dot;
  /** A Session dot's transcript; none for an open Session that has not written one yet. */
  session?: Session;
};

type Link = SimulationLinkDatum<GraphNode> & { source: string | GraphNode; target: string | GraphNode };

// Every node the Graph has placed, by id, kept outside the page: a refresh from the bridge and a
// visit to another page both find each node where it was, so the layout never starts over.
const known = new Map<string, GraphNode>();

/** The shape of a network: a change in Status or a title leaves it alone, while a node or a tie
 * that comes or goes changes it. Sorted, because the bridge reorders the Sessions by their last
 * turn, and a new order is not a new network. */
const shapeOf = (nodes: GraphNode[]) =>
  nodes
    .map((n) => `${n.id}<${n.parent ?? ""}`)
    .sort()
    .join("|");

// The last network that finished settling, so coming back to it moves nothing. It is recorded when
// a settle ends, not when it starts, so a page left mid-settle finishes the settle next time.
const settled = { shape: "", ids: new Set<string>() };

function markSettled(nodes: GraphNode[]) {
  settled.shape = shapeOf(nodes);
  settled.ids = new Set(nodes.map((n) => n.id));
}

// Large enough that a Session's Status reads at a glance and a dot is easy to click.
// An open Session is a node of its own, with a glyph inside and room for the ring that turns while
// it works.
const RADIUS: Record<Kind, number> = { hub: 28, project: 18, session: 14 };
/** An earlier Session's dot, much smaller than an open one's so the open ones stand out. */
const EARLIER_RADIUS = 7.5;
// Room around each node, with the label under a Project counted in.
const ROOM: Record<Kind, number> = { hub: 22, project: 28, session: 8 };
const CHARGE: Record<Kind, number> = { hub: -900, project: -340, session: -70 };

/** The nodes and links for these Projects, reusing every node already placed. A new node starts
 * beside the one it is tied to, and a new hub on a ring around the middle. */
function build(projects: Project[], now: Date): { nodes: GraphNode[]; links: Link[] } {
  const nodes: GraphNode[] = [];
  const links: Link[] = [];
  const add = (fields: Omit<GraphNode, keyof SimulationNodeDatum>, start: () => { x: number; y: number }) => {
    let n = known.get(fields.id);
    if (n) Object.assign(n, fields);
    else {
      n = { ...fields, ...start() };
      known.set(n.id, n);
    }
    nodes.push(n);
    if (n.parent) links.push({ source: n.parent, target: n.id });
  };
  const beside = (parent: string, spread: number) => () => {
    const p = known.get(parent);
    return { x: (p?.x ?? 0) + (Math.random() - 0.5) * spread, y: (p?.y ?? 0) + (Math.random() - 0.5) * spread };
  };

  const hubOf = (p: Project) => (p.area ? `area:${p.area.name}` : "unsorted");
  const hubs = new Map<string, { label: string; color?: string; rank: number }>();
  for (const p of projects) hubs.set(hubOf(p), p.area ? { label: p.area.name, color: p.area.color, rank: p.area.rank } : { label: "Unsorted", rank: Infinity });
  const ring = [...hubs.entries()].sort((a, b) => a[1].rank - b[1].rank);
  ring.forEach(([id, h], i) => {
    const angle = (2 * Math.PI * i) / ring.length;
    add({ id, kind: "hub", parent: null, label: h.label, color: h.color }, () => ({ x: Math.cos(angle) * 160, y: Math.sin(angle) * 160 }));
  });

  for (const p of projects) {
    const id = `project:${p.path}`;
    add({ id, kind: "project", parent: hubOf(p), label: p.name, project: p, group: group(p, now) }, beside(hubOf(p), 60));
    const open = new Map(p.openSessions.map((o) => [o.id, o]));
    // An open Session that has no transcript yet still gets its dot.
    const sessions = [
      ...p.sessions.map((s) => ({ id: s.id, title: s.title, session: s as Session | undefined })),
      ...p.openSessions.filter((o) => !p.sessions.some((s) => s.id === o.id)).map((o) => ({ id: o.id, title: "New Session", session: undefined })),
    ];
    for (const s of sessions) {
      const o = open.get(s.id);
      add({ id: `session:${s.id}`, kind: "session", parent: id, label: s.title, project: p, session: s.session, dot: o ? status(o, now) : "Earlier" }, beside(id, 20));
    }
  }

  // A node that left the list is forgotten; if it comes back, it starts beside its parent again.
  const ids = new Set(nodes.map((n) => n.id));
  for (const id of known.keys()) if (!ids.has(id)) known.delete(id);
  return { nodes, links };
}

/** The zoom and pan laid over the fit: a scale, then a shift in the fitted viewBox's units. */
type View = { k: number; x: number; y: number };
const FITTED: View = { k: 1, x: 0, y: 0 };
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
// Kept outside the page like the layout, so a visit to another page comes back to the same view.
let lastView = FITTED;

/** The view scaled by `factor` around a point of the fitted viewBox, which stays under the pointer. */
function zoomAt(v: View, factor: number, px: number, py: number): View {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
  return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
}

const REDUCED = "(prefers-reduced-motion: reduce)";

function useReducedMotion(): boolean {
  const [still, setStill] = useState(() => matchMedia(REDUCED).matches);
  useEffect(() => {
    const m = matchMedia(REDUCED);
    const on = () => setStill(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return still;
}

/** The viewBox that holds every node with a margin, centred on them. It never zooms in past 1:1,
 * so a small network keeps its size, and zooms out until a large one fits. `reserve` is the width
 * on the right that an open panel covers: the network fits beside it, never under it. */
function fit(nodes: GraphNode[], w: number, h: number, reserve = 0): string {
  if (nodes.length === 0 || w === 0 || h === 0) return `${-w / 2} ${-h / 2} ${w} ${h}`;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const n of nodes) {
    x0 = Math.min(x0, n.x ?? 0);
    y0 = Math.min(y0, n.y ?? 0);
    x1 = Math.max(x1, n.x ?? 0);
    y1 = Math.max(y1, n.y ?? 0);
  }
  // Wide enough for a Project's name, which runs on either side of its node and under it.
  const margin = 80;
  const room = Math.max(w - reserve, w / 3);
  const scale = Math.min(1, room / (x1 - x0 + 2 * margin), h / (y1 - y0 + 2 * margin));
  const [vw, vh] = [w / scale, h / scale];
  return `${(x0 + x1) / 2 - room / scale / 2} ${(y0 + y1) / 2 - vh / 2} ${vw} ${vh}`;
}

/** The group's colour as a Project node's ring. */
const RING: Record<Group, string> = { "In Motion": "stroke-mark", Drifting: "stroke-drifting", Parked: "stroke-parked" };

/** The Status as a Session dot, as Home's cards draw it: busy in the mark, waiting in the ink,
 * quiet hollow; an earlier Session is a small translucent dot, there without competing. */
const DOT: Record<Dot, string> = {
  Busy: "fill-mark",
  Waiting: "fill-foreground",
  Quiet: "fill-card stroke-muted-foreground",
  Earlier: "fill-alpha-600",
};

// A label keeps a halo of the ground around it, so it reads where a link runs under it.
const HALO = "[paint-order:stroke] stroke-background stroke-[3px] [stroke-linejoin:round]";

const PANEL_ID = "graph-panel";
/** The panel's width in px, which the network makes room for. */
const PANEL_WIDTH = 360;

/** What a node needs to open its panel. */
type Selectable = { selected: boolean; onSelect: (id: string) => void };

/** A node that a click or Enter selects, opening its panel: an SVG group that takes focus and the
 * keyboard like a button, and says whether its panel is open. */
function SelectableNode({ n, label, selected, onSelect, children }: { n: GraphNode; label: string; children: ReactNode } & Selectable) {
  const select = () => onSelect(n.id);
  return (
    <g
      transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={selected}
      aria-controls={selected ? PANEL_ID : undefined}
      onClick={select}
      onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      }}
      className="group cursor-pointer outline-none"
    >
      {children}
    </g>
  );
}

/** The ring around a node: in the ink while its panel is open, in the focus colour under the keyboard. */
function SelectRing({ r, selected }: { r: number; selected: boolean }) {
  return <circle r={r} strokeWidth={2} className={cn("fill-none", selected ? "stroke-foreground" : "stroke-ring opacity-0 group-focus-visible:opacity-100")} />;
}

function ProjectNode({ n, ...select }: { n: GraphNode } & Selectable) {
  const p = n.project!;
  return (
    <SelectableNode n={n} label={`${p.name}, ${n.group?.toLowerCase()}, ${p.area?.name ?? "Unsorted"}`} {...select}>
      <SelectRing r={RADIUS.project + 5} selected={select.selected} />
      <circle r={RADIUS.project} strokeWidth={3.5} className={cn("fill-card", RING[n.group ?? "Parked"])} />
      <text y={RADIUS.project + 16} textAnchor="middle" className={cn("fill-text-2 type-label-12 transition-colors duration-150 group-hover:fill-foreground", HALO)}>
        {p.name}
      </text>
    </SelectableNode>
  );
}

/** The glyph inside an open Session's node, in a colour that reads on its fill. */
const GLYPH: Record<StatusName, string> = { Busy: "text-white", Waiting: "text-background", Quiet: "text-muted-foreground" };

/** The ring that turns around a busy Session, as a spinner does: it is at work. A quarter of the
 * circle in the mark runs over a faint track of it; under reduced motion it holds still. */
function WorkingRing({ r }: { r: number }) {
  const c = 2 * Math.PI * r;
  return (
    <>
      <circle r={r} strokeWidth={3} className="fill-none stroke-mark/20" />
      <circle
        r={r}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={`${c * 0.28} ${c}`}
        className="origin-center fill-none stroke-mark [transform-box:fill-box] motion-safe:animate-spin motion-safe:[animation-duration:1.2s]"
      />
    </>
  );
}

function SessionDot({ n, ...select }: { n: GraphNode } & Selectable) {
  const dot = n.dot ?? "Earlier";
  const label = `Session ${n.label}, ${dot.toLowerCase()}`;
  if (dot === "Earlier") {
    // Only its transcript remains, so it stays a small dot beside the ones that run.
    return (
      <SelectableNode n={n} label={label} {...select}>
        <title>{`${n.label} – Earlier`}</title>
        <circle r={EARLIER_RADIUS + 5} className="fill-transparent" />
        <SelectRing r={EARLIER_RADIUS + 4} selected={select.selected} />
        <circle r={EARLIER_RADIUS} className={DOT.Earlier} />
      </SelectableNode>
    );
  }
  const r = RADIUS.session;
  return (
    <SelectableNode n={n} label={label} {...select}>
      <title>{`${n.label} – ${dot}`}</title>
      <SelectRing r={r + 10} selected={select.selected} />
      {dot === "Busy" && <WorkingRing r={r + 5} />}
      <circle r={r} strokeWidth={2.5} className={DOT[dot]} />
      <g transform="translate(-8,-8)">
        <Icon name="session" className={GLYPH[dot]} />
      </g>
    </SelectableNode>
  );
}

function HubNode({ n, ...select }: { n: GraphNode } & Selectable) {
  const tint = n.color ? ({ "--area": `var(--ud-area-${n.color})` } as CSSProperties) : undefined;
  return (
    <SelectableNode n={n} label={`Area ${n.label}`} {...select}>
      <SelectRing r={RADIUS.hub + 5} selected={select.selected} />
      <circle r={RADIUS.hub} style={tint} className={n.color ? "fill-(--area)" : "fill-parked"} />
      <text y={-RADIUS.hub - 8} textAnchor="middle" className={cn("fill-foreground type-label-13 font-medium", HALO)}>
        {n.label}
      </text>
    </SelectableNode>
  );
}

/** A Project as a panel shows it: what it holds and what is left, with Resume and its page. */
function ProjectPanel({ project, now }: { project: Project; now: Date }) {
  const { resume, newSession, openProject } = useStore();
  const last = lastSession(project);
  const st = last?.open && status(last.open, now);
  const repo = project.repo;
  const left = repo && (repo.changed > 0 || (repo.unpushed ?? 0) > 0);
  const issues = project.issues.length;
  return (
    <>
      <header className="flex min-w-0 items-center gap-3 pr-8">
        <ProjectAvatar name={project.name} color={project.area?.color} />
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate type-heading-16">{project.name}</h2>
          <span className="truncate type-label-13-mono text-muted-foreground">{project.shortPath}</span>
        </div>
      </header>
      <Activity project={project} now={now} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Drift">
          <GroupBadge group={group(project, now)} />
          <span className="type-label-13-mono text-text-2 tabular-nums">{drift(project, now)}</span>
        </Field>
        <Field label="Last Activity">{project.lastActivity ? <When iso={project.lastActivity} now={now} /> : <span className="text-muted-foreground">None</span>}</Field>
        <Field label="Area">
          <AreaName project={project} />
        </Field>
        <Field label="Changes">
          {!repo ? <span className="text-muted-foreground">Not a git repository</span> : left ? <Diff project={project} /> : <span className="text-muted-foreground">Nothing left behind</span>}
        </Field>
        <Field label="Last Session" className="col-span-2">
          {last ? <span className="truncate">{last.session.title}</span> : <span className="text-muted-foreground">No Session yet</span>}
          {st && <StatusMark status={st} />}
        </Field>
        {last?.session.lastPrompt && (
          <Field label="Last Prompt" className="col-span-2">
            <span className="line-clamp-3 type-copy-14 text-text-2">“{last.session.lastPrompt}”</span>
          </Field>
        )}
        {issues > 0 && (
          <Field label="Issues">
            <span className="tabular-nums">{issues} open</span>
          </Field>
        )}
      </dl>
      <div className="mt-auto flex flex-wrap gap-2">
        {last && (
          <Action variant="primary" size="small" onClick={() => resume(project.path, last.session.id)}>
            <Icon name="resume" /> Resume
          </Action>
        )}
        <Action variant="secondary" size="small" onClick={() => newSession(project.path)}>
          <Icon name="start" /> New Session
        </Action>
        <Action variant="tertiary" size="small" onClick={() => openProject(project.path)}>
          Open Project
        </Action>
      </div>
    </>
  );
}

/** A Session as a panel shows it: its Status, its Project and its last prompt, with Resume. */
function SessionPanel({ node, now, onSelect }: { node: GraphNode; now: Date; onSelect: (id: string) => void }) {
  const resume = useStore((s) => s.resume);
  const project = node.project!;
  const { session } = node;
  const dot = node.dot ?? "Earlier";
  return (
    <>
      <header className="flex min-w-0 flex-col gap-1 pr-8">
        <p className="type-label-13 text-muted-foreground">Session</p>
        <h2 className="line-clamp-2 type-heading-16">{node.label}</h2>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Status">{dot === "Earlier" ? <span className="text-muted-foreground">Earlier</span> : <StatusMark status={dot} />}</Field>
        <Field label="Last Turn">{session ? <When iso={session.lastActivity} now={now} /> : <span className="text-muted-foreground">Not yet</span>}</Field>
        <Field label="Project" className="col-span-2">
          <button
            type="button"
            onClick={() => onSelect(`project:${project.path}`)}
            className="-mx-1 flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-alpha-100 focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]"
          >
            <ProjectAvatar name={project.name} color={project.area?.color} size={20} />
            <span className="truncate">{project.name}</span>
          </button>
        </Field>
        {session?.lastPrompt && (
          <Field label="Last Prompt" className="col-span-2">
            <span className="line-clamp-4 type-copy-14 text-text-2">“{session.lastPrompt}”</span>
          </Field>
        )}
      </dl>
      {/* An open Session with no transcript yet cannot be resumed: its own terminal holds it. */}
      {session && (
        <div className="mt-auto">
          <Action variant="primary" size="small" onClick={() => resume(project.path, session.id)}>
            <Icon name="resume" /> Resume
          </Action>
        </div>
      )}
    </>
  );
}

/** An Area as a panel shows it: its Projects, the Drifting first, each opening its own panel. */
function AreaPanel({ node, projects, now, onSelect }: { node: GraphNode; projects: Project[]; now: Date; onSelect: (id: string) => void }) {
  return (
    <>
      <header className="flex min-w-0 items-center gap-2 pr-8">
        <AreaSwatch color={node.color} />
        <h2 className="truncate type-heading-16">{node.label}</h2>
        <span className="type-label-13 text-muted-foreground tabular-nums">{projects.length}</span>
      </header>
      <ul className="-mx-2 flex flex-col">
        {ordered(projects, now).map((p) => (
          <li key={p.path}>
            <button
              type="button"
              onClick={() => onSelect(`project:${p.path}`)}
              className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-alpha-100 focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]"
            >
              <ProjectAvatar name={p.name} color={p.area?.color} size={24} />
              <span className="grow truncate type-label-14">{p.name}</span>
              {p.lastActivity && <When iso={p.lastActivity} now={now} />}
              <GroupDot name={p.name} group={group(p, now)} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The panel a click on a node opens on the right, over the network, which stays in view. */
function NodePanel({ node, nodes, now, onSelect, onClose }: { node: GraphNode; nodes: GraphNode[]; now: Date; onSelect: (id: string) => void; onClose: () => void }) {
  return (
    <aside
      id={PANEL_ID}
      aria-label={node.label}
      style={{ width: PANEL_WIDTH }}
      className="absolute top-4 right-4 bottom-[68px] flex flex-col gap-5 overflow-y-auto rounded-xl bg-card p-5 shadow-(--ud-shadow-medium)"
    >
      <Action variant="tertiary" size="icon" aria-label="Close" onClick={onClose} className="absolute top-3 right-3">
        <Icon name="close" />
      </Action>
      {node.kind === "project" ? (
        <ProjectPanel project={node.project!} now={now} />
      ) : node.kind === "session" ? (
        <SessionPanel node={node} now={now} onSelect={onSelect} />
      ) : (
        <AreaPanel node={node} projects={nodes.filter((n) => n.kind === "project" && n.parent === node.id).map((n) => n.project!)} now={now} onSelect={onSelect} />
      )}
    </aside>
  );
}

function LegendItem({ mark, children }: { mark: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {mark}
      {children}
    </li>
  );
}

/** What the rings and dots mean, in the corner. */
function Legend() {
  const ring = (color: string) => <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ boxShadow: `inset 0 0 0 2px var(--ud-${color})` }} />;
  const dot = (cls: string) => <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", cls)} />;
  return (
    <div className="absolute bottom-4 left-4 flex gap-6 rounded-xl px-4 py-3 type-label-12 text-text-2 material-small">
      <ul className="flex flex-col gap-1.5" aria-label="Projects">
        <LegendItem mark={ring("accent")}>In Motion</LegendItem>
        <LegendItem mark={ring("drifting")}>Drifting</LegendItem>
        <LegendItem mark={ring("parked")}>Parked</LegendItem>
      </ul>
      <ul className="flex flex-col gap-1.5" aria-label="Sessions">
        <LegendItem mark={dot(STATUS_DOT.Busy)}>Busy</LegendItem>
        <LegendItem mark={dot(STATUS_DOT.Waiting)}>Waiting</LegendItem>
        <LegendItem mark={dot(STATUS_DOT.Quiet)}>Quiet</LegendItem>
        <LegendItem mark={dot("bg-alpha-600")}>Earlier</LegendItem>
      </ul>
    </div>
  );
}

export function Graph() {
  const projects = useStore((s) => s.projects);
  const now = useNow();
  const still = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const sim = useRef<Simulation<GraphNode, Link> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState(lastView);
  const changeView = (f: (v: View) => View) =>
    setView((v) => {
      lastView = f(v);
      return lastView;
    });
  // The last point of a pan, in the fitted viewBox's units, and where it started on the screen: a
  // press that hardly moved is a click on the ground, which closes the panel.
  const pan = useRef<{ id: number; x: number; y: number; clientX: number; clientY: number } | null>(null);
  // The node whose panel is open, by id, so the panel follows the node across a refresh.
  const [selected, setSelected] = useState<string | null>(null);

  // Esc closes the panel, unless it is Find's to close.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !useStore.getState().findOpen) setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  /** A point of the screen in the fitted viewBox's units, before the zoom and pan. */
  const toFitted = (clientX: number, clientY: number) => {
    const m = svg.current?.getScreenCTM();
    return m ? new DOMPoint(clientX, clientY).matrixTransform(m.inverse()) : null;
  };

  /** Zoom by `factor` around a point of the screen, the middle of the page by default. */
  const zoomBy = (factor: number, clientX?: number, clientY?: number) => {
    const r = box.current?.getBoundingClientRect();
    const p = r && toFitted(clientX ?? r.left + r.width / 2, clientY ?? r.top + r.height / 2);
    if (p) changeView((v) => zoomAt(v, factor, p.x, p.y));
  };

  // The wheel zooms around the pointer, and a touchpad's pinch comes as a wheel too. React's
  // wheel listener is passive, so it could not keep the page from scrolling: this one is not.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!svg.current) return;
      e.preventDefault();
      // A wheel that counts in lines moves about 16 px per line.
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomBy(Math.exp(-dy * 0.002), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // Registered once: zoomBy reads only refs and the state setter, which never change.
  }, []);

  const graph = useMemo(() => build(projects ?? [], now), [projects, now]);
  const shape = shapeOf(graph.nodes);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // One simulation per visit to the page; the positions outlive it in `known`. d3's timer runs one
  // tick per animation frame, and each tick draws the page again.
  useEffect(() => {
    const s = forceSimulation<GraphNode, Link>()
      .force(
        "link",
        forceLink<GraphNode, Link>()
          .id((d) => d.id)
          .distance((l) => ((l.target as GraphNode).kind === "session" ? 50 : 130))
          .strength((l) => ((l.target as GraphNode).kind === "session" ? 1 : 0.6)),
      )
      .force("charge", forceManyBody<GraphNode>().strength((d) => CHARGE[d.kind]))
      .force("collide", forceCollide<GraphNode>((d) => RADIUS[d.kind] + ROOM[d.kind]))
      .force("x", forceX<GraphNode>(0).strength(0.05))
      .force("y", forceY<GraphNode>(0).strength(0.05))
      .on("tick", redraw)
      .on("end", () => markSettled(s.nodes()))
      .stop()
      // A new simulation starts hot; at rest instead, the network decides how hard to settle.
      .alpha(0);
    sim.current = s;
    return () => {
      s.stop().on("tick", null).on("end", null);
      sim.current = null;
    };
  }, []);

  // Runs when the shape changes, not on every refresh: the network as it is now. A first draw
  // settles from scratch, a change settles gently around the nodes in place, and the network that
  // last settled moves nothing. `graph` is always current when `shape` changes.
  useEffect(() => {
    const s = sim.current;
    if (!s) return;
    s.nodes(graph.nodes);
    (s.force("link") as ForceLink<GraphNode, Link>).links(graph.links);
    if (shape === settled.shape) {
      s.stop();
      redraw();
      return;
    }
    const fresh = graph.nodes.filter((n) => !settled.ids.has(n.id)).length;
    // A change during a settle never slows it down.
    s.alpha(Math.max(s.alpha(), fresh === graph.nodes.length ? 1 : 0.3));
    if (still) {
      // Under reduced motion the layout settles at once, out of sight, and is drawn once.
      s.stop();
      while (s.alpha() > s.alphaMin()) s.tick();
      markSettled(graph.nodes);
      redraw();
    } else s.restart();
  }, [shape, still]);

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const at = (id: string | GraphNode) => (typeof id === "string" ? byId.get(id) : id);
  const busy = graph.nodes.filter((n) => n.dot === "Busy");
  // A node that left the network takes its panel with it.
  const open = selected ? byId.get(selected) : undefined;
  const select = (id: string) => ({ selected: id === selected, onSelect: setSelected });

  return (
    // The title sits above the network rather than over it, so no node ever slips under it.
    <div className="flex h-full flex-col">
      <header className="px-8 pt-8">
        <h1 className="type-heading-24">Graph</h1>
      </header>
      <div ref={box} className="relative min-h-[480px] w-full grow overflow-hidden">
        {projects && projects.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Empty icon={<Icon name="graph" size={20} />} title="Nothing to draw yet.">
              The Graph draws each Project once Undrift has found one.
            </Empty>
          </div>
        )}
        {size.w > 0 && graph.nodes.length > 0 && (
          // Dragging the ground pans, a click on it closes the panel and a double-click fits the
          // network again; a node keeps its own click.
          <svg
            ref={svg}
            width={size.w}
            height={size.h}
            viewBox={fit(graph.nodes, size.w, size.h, open ? PANEL_WIDTH + 32 : 0)}
            role="group"
            aria-label="The Projects as a network, tied to their Area"
            className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
            onPointerDown={(e) => {
              if (e.button !== 0 || (e.target as Element).closest("[role=button]")) return;
              const p = toFitted(e.clientX, e.clientY);
              if (!p) return;
              pan.current = { id: e.pointerId, x: p.x, y: p.y, clientX: e.clientX, clientY: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const start = pan.current;
              const p = start?.id === e.pointerId && toFitted(e.clientX, e.clientY);
              if (!start || !p) return;
              pan.current = { ...start, x: p.x, y: p.y };
              changeView((v) => ({ ...v, x: v.x + p.x - start.x, y: v.y + p.y - start.y }));
            }}
            onPointerUp={(e) => {
              const start = pan.current;
              if (start && Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) < 4) setSelected(null);
              pan.current = null;
            }}
            onPointerCancel={() => (pan.current = null)}
            onDoubleClick={(e) => {
              if (!(e.target as Element).closest("[role=button]")) changeView(() => FITTED);
            }}
          >
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            <g aria-hidden="true">
              {graph.links.map((l) => {
                const [a, b] = [at(l.source), at(l.target)];
                if (!a || !b) return null;
                return <line key={`${a.id}>${b.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={1} className="stroke-border" />;
              })}
            </g>
            {/* Sparks run from a busy Session to its Project and on to the Area, never under
                reduced motion. */}
            {!still && (
              <g aria-hidden="true">
                {busy.map((n) => {
                  const p = n.parent ? byId.get(n.parent) : undefined;
                  const h = p?.parent ? byId.get(p.parent) : undefined;
                  if (!p || !h) return null;
                  return (
                    <circle key={n.id} r={4} className="fill-mark">
                      <animateMotion dur="2.4s" repeatCount="indefinite" path={`M${n.x},${n.y} L${p.x},${p.y} L${h.x},${h.y}`} />
                    </circle>
                  );
                })}
              </g>
            )}
            <g>
              {graph.nodes
                .filter((n) => n.kind === "session")
                .map((n) => (
                  <SessionDot key={n.id} n={n} {...select(n.id)} />
                ))}
            </g>
            <g>
              {graph.nodes
                .filter((n) => n.kind === "project")
                .map((n) => (
                  <ProjectNode key={n.id} n={n} {...select(n.id)} />
                ))}
            </g>
            <g>
              {graph.nodes
                .filter((n) => n.kind === "hub")
                .map((n) => (
                  <HubNode key={n.id} n={n} {...select(n.id)} />
                ))}
            </g>
            </g>
          </svg>
        )}
        {graph.nodes.length > 0 && (
          <>
            <Legend />
            {open && <NodePanel node={open} nodes={graph.nodes} now={now} onSelect={setSelected} onClose={() => setSelected(null)} />}
            {/* The same zoom for the keyboard, and for whoever does not guess the wheel. */}
            <div className="absolute right-4 bottom-4 flex gap-1 rounded-xl p-1 material-small">
              <Action variant="tertiary" size="icon" aria-label="Zoom Out" disabled={view.k <= MIN_ZOOM} onClick={() => zoomBy(1 / 1.25)}>
                <Icon name="zoomOut" />
              </Action>
              <Action variant="tertiary" size="icon" aria-label="Fit" disabled={view === FITTED} onClick={() => changeView(() => FITTED)}>
                <Icon name="fit" />
              </Action>
              <Action variant="tertiary" size="icon" aria-label="Zoom In" disabled={view.k >= MAX_ZOOM} onClick={() => zoomBy(1.25)}>
                <Icon name="zoomIn" />
              </Action>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
