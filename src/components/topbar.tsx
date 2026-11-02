import type { ReactNode } from "react";
import { WindowControls } from "@/components/window-controls";

// Vercel's top bar: where you are on the left, the page in the centre, its actions on the right,
// then the window controls. Each page passes its own breadcrumb and actions; the shell's pages
// have none yet.
export function Topbar({ title, breadcrumb, actions }: { title: string; breadcrumb?: ReactNode; actions?: ReactNode }) {
  return (
    // The window has no native title bar, so the bar itself drags it and a double-click maximizes.
    <header data-tauri-drag-region className="relative z-10 grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 shadow-[0_1px_0_0_var(--ud-line)]">
      <nav data-tauri-drag-region aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
        {breadcrumb}
      </nav>
      {/* A label, not a heading: each page carries its own h1, so the title is not announced twice. */}
      <p data-tauri-drag-region className="type-label-14 font-medium">
        {title}
      </p>
      <div data-tauri-drag-region className="flex items-center justify-end gap-2">
        {actions}
        <WindowControls />
      </div>
    </header>
  );
}
