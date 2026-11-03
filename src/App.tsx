import { useEffect } from "react";
import { Find } from "@/components/find";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/toast";
import { Topbar } from "@/components/topbar";
import { Graph } from "@/pages/graph";
import { Home } from "@/pages/home";
import { Placeholder, TITLES } from "@/pages/placeholder";
import { Project } from "@/pages/project";
import { Projects } from "@/pages/projects";
import { useStore } from "@/store";
import type { Project as ProjectData } from "@/types";

/** A Project page's breadcrumb, Area / Project: the Area leads back to Projects filtered by it. */
function Breadcrumb({ project }: { project: ProjectData }) {
  const setAreaFilter = useStore((s) => s.setAreaFilter);
  const area = project.area;
  return (
    <>
      <button
        type="button"
        onClick={() => setAreaFilter(area ? { kind: "area", name: area.name } : { kind: "unsorted" })}
        className="flex h-8 min-w-0 items-center rounded-md px-2 type-label-14 text-text-2 transition-colors duration-150 hover:bg-alpha-100 hover:text-foreground focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]"
      >
        <span className="truncate">{area?.name ?? "Unsorted"}</span>
      </button>
      <span aria-hidden="true" className="type-label-14 text-muted-foreground">
        /
      </span>
      <span aria-current="page" className="truncate px-2 type-label-14 font-medium">
        {project.name}
      </span>
    </>
  );
}

// Only text entry swallows the shortcuts: a focused radio or button takes no letters, so F and
// Ctrl K must still work from it.
const typing = (t: EventTarget | null) =>
  t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !["radio", "checkbox", "button"].includes(t.type));

export default function App() {
  const { page, setFindOpen, quit } = useStore();
  // A Project that left the list – hidden, or its folder gone – leaves its page for Projects.
  const project = useStore((s) => (s.page === "projects" && s.project ? (s.projects?.find((p) => p.path === s.project) ?? null) : null));

  // F or Ctrl K opens Find, Ctrl Q quits (DESIGN.md § Keyboard). Esc is the dialog's own.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      if (e.ctrlKey && !e.altKey && !e.shiftKey && key === "k") {
        e.preventDefault();
        setFindOpen(true);
      } else if (e.ctrlKey && !e.altKey && !e.shiftKey && key === "q") {
        e.preventDefault();
        quit();
      } else if (key === "f" && !e.ctrlKey && !e.altKey && !e.metaKey && !typing(e.target)) {
        e.preventDefault();
        setFindOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setFindOpen, quit]);

  return (
    <Toaster>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex min-w-0 grow flex-col">
          <Topbar title={project ? project.name : TITLES[page]} breadcrumb={project && <Breadcrumb project={project} />} />
          {/* Keyed by the page, so a new page opens scrolled to its top. */}
          <main key={project?.path ?? page} className="min-h-0 grow overflow-y-auto">
            {page === "home" ? (
              <Home />
            ) : project ? (
              <Project project={project} />
            ) : page === "projects" ? (
              <Projects />
            ) : page === "graph" ? (
              <Graph />
            ) : (
              <Placeholder page={page} />
            )}
          </main>
        </div>
        <Find />
      </div>
    </Toaster>
  );
}
