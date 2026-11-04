import { useEffect } from "react";
import { domMax, LazyMotion, MotionConfig } from "motion/react";
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

// Enter is Up Next's key only on the ground: a focused button, a menu item or Find's input keeps
// its own Enter, so the thing to pick up is never picked up twice.
const ground = (t: EventTarget | null) => t === document.body || (t instanceof HTMLElement && t.tagName === "MAIN");

export default function App() {
  const { page, setFindOpen, quit, refresh } = useStore();
  // A Project that left the list – hidden, or its folder gone – leaves its page for Projects.
  const project = useStore((s) => (s.page === "projects" && s.project ? (s.projects?.find((p) => p.path === s.project) ?? null) : null));

  // F or Ctrl K opens Find, R or Ctrl R refreshes, Ctrl Q quits, Enter on Home picks up what Up
  // Next names (DESIGN.md § Keyboard). Esc is the dialog's own. Ctrl R is taken over, or the
  // webview would reload the window.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      const plain = !e.ctrlKey && !e.altKey && !e.metaKey && !typing(e.target);
      if (plain && key === "enter" && ground(e.target)) {
        const s = useStore.getState();
        if (s.page === "home" && !s.findOpen) {
          e.preventDefault();
          s.pickUpNext();
        }
      } else if (e.ctrlKey && !e.altKey && !e.shiftKey && key === "k") {
        e.preventDefault();
        setFindOpen(true);
      } else if (e.ctrlKey && !e.altKey && !e.shiftKey && key === "q") {
        e.preventDefault();
        quit();
      } else if ((e.ctrlKey && !e.altKey && !e.shiftKey && key === "r") || (plain && key === "r")) {
        e.preventDefault();
        refresh();
      } else if (plain && key === "f") {
        e.preventDefault();
        setFindOpen(true);
      }
    }
    // A touchpad's pinch comes as a wheel with Ctrl held, and the webview would zoom the whole
    // page with it. It is swallowed everywhere; over the Graph's network, the Graph's own listener
    // has zoomed the network first. Not passive, or preventDefault would do nothing.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [setFindOpen, quit, refresh]);

  return (
    // One provider shares the Hints' 150 ms delay: once one is open, moving to the next shows it at once.
    <TooltipProvider delay={150}>
      <Toaster>
        <div className="flex h-screen flex-col overflow-hidden bg-background">
          <Header />
          {/* Motion's features load once for the Board's drag, and `m.*` is the only way in, so no
              page pulls the full `motion` bundle by accident. Under reduced motion nothing slides. */}
          <LazyMotion features={domMax} strict>
            <MotionConfig reducedMotion="user">
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
            </MotionConfig>
          </LazyMotion>
          <Find />
        </div>
      </Toaster>
    </TooltipProvider>
  );
}
