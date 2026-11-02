import { Key } from "@/components/bits";
import { Icon, type IconName } from "@/components/icon";
import { Logo } from "@/components/logo";
import { NavUser } from "@/components/nav-user";
import { cn } from "@/lib/utils";
import { useStore, type Page } from "@/store";

const NAV: { page: Page; label: string; icon: IconName }[] = [
  { page: "home", label: "Home", icon: "home" },
  { page: "projects", label: "Projects", icon: "projects" },
  { page: "graph", label: "Graph", icon: "graph" },
];

function NavItem({ label, icon, active, onClick }: { label: string; icon: IconName; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 type-label-14 transition-colors duration-150",
        // Geist's two steps: gray-alpha-100 under the pointer, gray-alpha-200 for the current page.
        active ? "bg-alpha-200 font-medium text-foreground" : "text-text-2 hover:bg-alpha-100 hover:text-foreground",
      )}
    >
      <Icon name={icon} size={20} className={active ? "text-foreground" : "text-muted-foreground"} />
      {label}
    </button>
  );
}

// Vercel's sidebar: the brand on top, Find, the pages, and who you are at the foot.
export function Sidebar() {
  const { page, go, setFindOpen } = useStore();

  return (
    // z-10: its edge is a shadow drawn just outside it, which a full-bleed page would paint over.
    <nav aria-label="Main" className="relative z-10 flex w-60 shrink-0 flex-col gap-3 bg-rail px-3 py-3 shadow-[1px_0_0_0_var(--ud-line)]">
      {/* With the top bar, this row is the window's title bar: it drags the window. */}
      <div data-tauri-drag-region className="flex h-9 items-center px-2">
        <Logo className="pointer-events-none h-[26px] w-auto text-foreground" />
      </div>

      {/* Its edge is a shadow, which hides the base focus ring, so it draws the double ring itself. */}
      <button
        type="button"
        onClick={() => setFindOpen(true)}
        className="flex h-9 items-center gap-2 rounded-md bg-card px-2.5 type-label-14 text-muted-foreground edge transition-shadow hover:shadow-[0_0_0_1px_var(--ud-line-strong)] focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]"
      >
        <Icon name="search" />
        <span className="grow text-left">Find…</span>
        <Key>F</Key>
      </button>

      <div className="flex flex-col gap-0.5">
        {NAV.map((n) => (
          <NavItem key={n.page} label={n.label} icon={n.icon} active={page === n.page} onClick={() => go(n.page)} />
        ))}
      </div>

      <div className="mt-auto">
        <NavUser />
      </div>
    </nav>
  );
}
