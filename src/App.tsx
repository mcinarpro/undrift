import { useEffect } from "react";
import { Find } from "@/components/find";
import { Toaster } from "@/components/toast";
import { Header } from "@/components/topbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Graph } from "@/pages/graph";
import { Home } from "@/pages/home";
import { Placeholder } from "@/pages/placeholder";
import { Project } from "@/pages/project";
import { Projects } from "@/pages/projects";
import { useStore } from "@/store";

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
    // One provider shares the Hints' 150 ms delay: once one is open, moving to the next shows it at once.
    <TooltipProvider delay={150}>
      <Toaster>
        <div className="flex h-screen flex-col overflow-hidden bg-background">
          <Header />
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
          <Find />
        </div>
      </Toaster>
    </TooltipProvider>
  );
}
