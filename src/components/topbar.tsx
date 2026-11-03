import { Action } from "@/components/action";
import { Hint, Key } from "@/components/bits";
import { Icon } from "@/components/icon";
import { Logo } from "@/components/logo";
import { NavUser } from "@/components/nav-user";
import { WindowControls } from "@/components/window-controls";
import { cn } from "@/lib/utils";
import { useStore, type Page } from "@/store";

// The label is Home, never Overview: Home is the Loose Ends (ADR 0001), not a summary.
const NAV: { page: Page; label: string }[] = [
  { page: "home", label: "Home" },
  { page: "projects", label: "Projects" },
  { page: "graph", label: "Graph" },
];

// Vercel's header, in one 48 px line: the lockup, the pages as tabs, Find, the account, then the
// window controls. Each page shows its own title and actions, so the header carries none.
export function Header() {
  const { page, project, go, setFindOpen, refresh, refreshing } = useStore();

  return (
    // The window has no native title bar, so the header is the drag region and a double-click
    // maximizes. Tauri drags only from an element that carries the attribute itself, so the lockup,
    // the tabs, Find, the avatar and the controls never drag.
    // z-10: its edge is a shadow drawn just below it, which a full-bleed page would paint over.
    <header data-tauri-drag-region className="relative z-10 flex h-12 shrink-0 items-center px-4 shadow-[0_1px_0_0_var(--ud-line)]">
      {/* The lockup leads home, as a site's logo does; -ml-1 takes back its padding. Its name keeps
          it apart from the Home tab beside it. */}
      <button type="button" onClick={() => go("home")} aria-label="undrift – Home" className="-ml-1 flex h-8 shrink-0 items-center rounded-md px-1">
        <Logo className="h-[26px] w-auto text-foreground" />
      </button>

      <nav data-tauri-drag-region aria-label="Main" className="ml-6 flex items-center gap-1">
        {NAV.map((n) => {
          // A Project page belongs to Projects, so Projects stays current there – but the page is
          // the Project's, which its breadcrumb announces, so the tab says only that it is current.
          const current = page === n.page;
          return (
            <button
              key={n.page}
              type="button"
              onClick={() => go(n.page)}
              aria-current={current ? (project ? "true" : "page") : undefined}
              className={cn(
                "flex h-8 items-center rounded-md px-3 type-label-14 transition-colors duration-150",
                // Geist's two steps: gray-alpha-100 under the pointer, gray-alpha-200 for the current page.
                current ? "bg-alpha-200 text-foreground" : "text-text-2 hover:bg-alpha-100 hover:text-foreground",
              )}
            >
              {n.label}
            </button>
          );
        })}
      </nav>

      {/* Its edge is a shadow, which hides the base focus ring, so it draws the double ring itself. */}
      <button
        type="button"
        onClick={() => setFindOpen(true)}
        className="ml-auto flex h-8 w-60 shrink-0 items-center gap-2 rounded-md bg-card px-2.5 type-label-14 text-muted-foreground edge transition-shadow hover:shadow-[0_0_0_1px_var(--ud-line-strong)] focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]"
      >
        <Icon name="search" />
        <span className="grow text-left">Find…</span>
        <Key>F</Key>
      </button>

      {/* Refresh sits between Find and the account: the one action the header holds, since it
          belongs to no page. It turns while the bridge reads, and stops on its answer. */}
      <div className="ml-2 flex shrink-0">
        <Hint label="Refresh (R)">
          <Action variant="tertiary" size="icon" aria-label="Refresh" onClick={refresh} className="text-muted-foreground hover:text-foreground">
            <Icon name="refresh" className={cn(refreshing && "animate-spin motion-reduce:animate-none")} />
          </Action>
        </Hint>
      </div>

      <div className="ml-2 flex shrink-0">
        <NavUser />
      </div>

      {/* 12 px between the avatar and the controls, so a slip never lands on the window. */}
      <div className="ml-3 flex shrink-0">
        <WindowControls />
      </div>
    </header>
  );
}
