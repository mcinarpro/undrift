import { useCommandState } from "cmdk";
import { ProjectAvatar } from "@/components/bits";
import { Icon, type IconName } from "@/components/icon";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { DialogClose } from "@/components/ui/dialog";
import type { ThemeChoice } from "@/lib/theme";
import { useStore, type Page } from "@/store";
import type { Project, Session } from "@/types";

/** Sessions Find offers across every Project: the last few, which are the ones worth resuming. */
const LAST_SESSIONS = 8;

function lastSessions(projects: Project[]): { project: Project; session: Session }[] {
  return projects
    .flatMap((project) => project.sessions.map((session) => ({ project, session })))
    .sort((a, b) => new Date(b.session.lastActivity).getTime() - new Date(a.session.lastActivity).getTime())
    .slice(0, LAST_SESSIONS);
}

const PAGES: { page: Page; label: string; icon: IconName }[] = [
  { page: "home", label: "Home", icon: "home" },
  { page: "projects", label: "Projects", icon: "projects" },
  { page: "graph", label: "Graph", icon: "graph" },
  { page: "settings", label: "Settings", icon: "settings" },
];

const THEMES: { theme: ThemeChoice; label: string }[] = [
  { theme: "system", label: "System Theme" },
  { theme: "light", label: "Light Theme" },
  { theme: "dark", label: "Dark Theme" },
];

// Geist's group headings are 36 px rows of 13 px gray-900 text. Passed on each group, where `cn`
// replaces the generated 12 px heading classes; a selector on Command would only tie with them.
const HEADING =
  "**:[[cmdk-group-heading]]:flex **:[[cmdk-group-heading]]:h-9 **:[[cmdk-group-heading]]:items-center **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-0 **:[[cmdk-group-heading]]:text-[13px] **:[[cmdk-group-heading]]:text-text-2";

// Geist's rows are 6 px inside the 12 px modal. The generated item forces its corners inside a
// dialog with an important variant, so the radius has to repeat that variant to replace it.
const ROW = "min-h-9 gap-3 px-2 py-2 text-sm in-data-[slot=dialog-content]:rounded-md!";

// cmdk already holds the query and the match count, so the empty state and the announcement read
// them from its store instead of mirroring the input in state of our own.
function NoResults() {
  const search = useCommandState((s) => s.search);
  return (
    <CommandEmpty className="text-sm text-muted-foreground">
      No results found for “<span className="text-foreground">{search}</span>”.
    </CommandEmpty>
  );
}

function ResultCount() {
  const search = useCommandState((s) => s.search);
  const count = useCommandState((s) => s.filtered.count);
  // Silent until something is typed: announcing the full list on open would only be noise.
  return (
    <p aria-live="polite" className="sr-only">
      {search ? (count === 1 ? "1 result" : `${count} results`) : ""}
    </p>
  );
}

// Find (F or Ctrl K): open a Project, resume one of the last Sessions, jump to a page or run an
// action, as Vercel's Find and Geist's Command Menu.
export function Find() {
  const { findOpen, setFindOpen, go, openProject, resume, theme, setTheme, quit, refresh } = useStore();
  const projects = useStore((s) => s.projects) ?? [];

  return (
    <CommandDialog
      open={findOpen}
      onOpenChange={setFindOpen}
      title="Find"
      description="Open a Project, resume a Session, jump to a page or run an action"
      // Geist's modal material and overlay motion. ring-0 drops the generated ring, because the
      // modal shadow already starts with the edge. 15% from the top, not a third, so the full
      // 436 px list still fits in the 700 px minimum window.
      className="top-[15%] rounded-xl ring-0 shadow-(--ud-shadow-modal) duration-300 ease-[cubic-bezier(.175,.885,.32,1.1)] sm:max-w-[640px] data-open:zoom-in-96 data-closed:zoom-out-96"
    >
      {/* Geist's 18 px input in a 52 px header. The generated input group is tinted for forms;
          here it sits on the modal surface, as in Geist, so its important classes are repeated. */}
      <Command className="p-0 [&_[data-slot=command-input-wrapper]]:p-3 [&_[data-slot=command-input]]:text-lg [&_[data-slot=input-group]]:h-7! [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:bg-transparent">
        <div className="relative">
          <CommandInput placeholder="Find a Project, a Session, a page or an action…" className="pr-10" />
          <DialogClose
            aria-label="Close Find"
            className="absolute top-1/2 right-3 flex h-5 -translate-y-1/2 items-center rounded-sm bg-card px-1 font-sans text-xs font-medium text-muted-foreground edge transition-colors duration-150 hover:text-foreground focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]"
          >
            Esc
          </DialogClose>
        </div>
        <CommandList className="max-h-[436px] scroll-py-2 overscroll-contain p-2">
          <NoResults />
          {projects.length > 0 && (
            <CommandGroup heading="Projects" className={HEADING}>
              {projects.map((p) => (
                // The path keeps the value unique; the name is what is typed.
                <CommandItem key={p.path} value={`project ${p.path}`} keywords={[p.name]} onSelect={() => openProject(p.path)} className={ROW}>
                  <ProjectAvatar name={p.name} size={20} />
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{p.shortPath}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {projects.length > 0 && (
            <CommandGroup heading="Sessions" className={HEADING}>
              {lastSessions(projects).map(({ project, session }) => (
                <CommandItem
                  key={session.id}
                  value={`session ${session.id}`}
                  keywords={[session.title, project.name]}
                  onSelect={() => {
                    resume(project.path, session.id);
                    setFindOpen(false);
                  }}
                  className={ROW}
                >
                  <Icon name="resume" className="text-muted-foreground" />
                  <span className="truncate">{session.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{project.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Pages" className={HEADING}>
            {PAGES.map((n) => (
              <CommandItem key={n.page} value={`page ${n.label}`} onSelect={() => go(n.page)} className={ROW}>
                <Icon name={n.icon} className="text-muted-foreground" />
                {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Actions" className={HEADING}>
            {THEMES.map((t) => (
              // data-checked shows the generated item's tick on the theme in use.
              <CommandItem
                key={t.theme}
                value={`action ${t.label}`}
                data-checked={theme === t.theme}
                onSelect={() => {
                  setTheme(t.theme);
                  setFindOpen(false);
                }}
                className={ROW}
              >
                <Icon name={t.theme} className="text-muted-foreground" />
                {t.label}
              </CommandItem>
            ))}
            <CommandItem
              value="action refresh"
              onSelect={() => {
                refresh();
                setFindOpen(false);
              }}
              className={ROW}
            >
              <Icon name="refresh" className="text-muted-foreground" />
              Refresh
              <CommandShortcut className="tracking-normal">R</CommandShortcut>
            </CommandItem>
            <CommandItem value="action quit undrift" onSelect={quit} className={ROW}>
              <Icon name="quit" className="text-muted-foreground" />
              Quit
              {/* The generated shortcut is spaced out for symbols; a written key reads as a word. */}
              <CommandShortcut className="tracking-normal">Ctrl Q</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <ResultCount />
      </Command>
    </CommandDialog>
  );
}
