import {
  ChevronsUpDown,
  Ellipsis,
  ExternalLink,
  Folders,
  GitBranch,
  GitCommitHorizontal,
  House,
  LogOut,
  Minus,
  Monitor,
  Moon,
  Network,
  Play,
  Search,
  Settings,
  Square,
  SquareTerminal,
  Sun,
  X,
} from "lucide-react";

// Undrift's icons, by our own names. The only file that knows where they come from – Lucide, as in
// components.json – so changing the source changes this file alone. shadcn's generated components
// import Lucide themselves.
const ICONS = {
  home: House,
  projects: Folders,
  graph: Network,
  settings: Settings,
  search: Search,
  system: Monitor,
  light: Sun,
  dark: Moon,
  profile: ExternalLink,
  quit: LogOut,
  switch: ChevronsUpDown,
  minimize: Minus,
  maximize: Square,
  close: X,
  resume: Play,
  start: SquareTerminal,
  more: Ellipsis,
  branch: GitBranch,
  commit: GitCommitHorizontal,
} as const;

export type IconName = keyof typeof ICONS;

/** Decorative: the button or link around it carries the label. */
export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph size={size} strokeWidth={2} className={className} aria-hidden="true" />;
}
