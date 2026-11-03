import { useEffect } from "react";
import { Find } from "@/components/find";
import { Header } from "@/components/topbar";
import { Placeholder } from "@/pages/placeholder";
import { useStore } from "@/store";

// Only text entry swallows the shortcuts: a focused radio or button takes no letters, so F and
// Ctrl K must still work from it.
const typing = (t: EventTarget | null) =>
  t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !["radio", "checkbox", "button"].includes(t.type));

export default function App() {
  const { page, setFindOpen, quit } = useStore();

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
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Header />
      <main key={page} className="min-h-0 grow overflow-y-auto">
        <Placeholder page={page} />
      </main>
      <Find />
    </div>
  );
}
