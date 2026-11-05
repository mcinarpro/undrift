import {
  CalendarDays,
  Check,
  ExternalLink,
  Folders,
  House,
  LogOut,
  Minus,
  Monitor,
  Moon,
  Play,
  Plus,
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
  settings: Settings,
  search: Search,
  system: Monitor,
  light: Sun,
  dark: Moon,
  profile: ExternalLink,
  quit: LogOut,
  minimize: Minus,
  maximize: Square,
  close: X,
  check: Check,
  play: Play,
  plus: Plus,
  week: CalendarDays,
  sessions: SquareTerminal,
} as const;

export type IconName = keyof typeof ICONS;

/** Decorative: the button or link around it carries the label. */
export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph size={size} strokeWidth={2} className={className} aria-hidden="true" />;
}
