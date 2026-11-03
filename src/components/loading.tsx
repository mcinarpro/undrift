import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import type { Project } from "@/types";

// What a page shows while the bridge has not read what it would list (DESIGN.md § Layout, First
// load): its own shape in Skeletons, never an Empty State that says there is nothing.

/** One block of a Skeleton, as Geist draws it (DESIGN.md § Components): `raised` with a `shimmer`
 * band sweeping across it, only under motion-safe, in place of the generated pulse. The caller
 * gives its size and, for a shape with its own, its radius. */
export function Bar({ className }: { className?: string }) {
  return (
    <Skeleton
      aria-hidden="true"
      className={cn(
        "relative animate-none overflow-hidden rounded-[5px] bg-muted",
        "after:absolute after:inset-0 after:-translate-x-full after:bg-linear-to-r after:from-transparent after:via-shimmer after:to-transparent motion-safe:after:animate-shimmer",
        className,
      )}
    />
  );
}

/** Whether a page shows its Skeletons, nothing yet, or what it read. Nothing for a load under
 * 200 ms, since a flash of grey reads as a glitch; once shown, at least 300 ms, so the page never
 * blinks between its shape and its content. */
export function useSkeleton(loading: boolean): "blank" | "skeleton" | "ready" {
  const [shownAt, setShownAt] = useState<number | null>(null);
  useEffect(() => {
    if (loading && shownAt === null) {
      const t = setTimeout(() => setShownAt(Date.now()), 200);
      return () => clearTimeout(t);
    }
    if (!loading && shownAt !== null) {
      const t = setTimeout(() => setShownAt(null), Math.max(0, shownAt + 300 - Date.now()));
      return () => clearTimeout(t);
    }
  }, [loading, shownAt]);
  if (shownAt !== null) return "skeleton";
  return loading ? "blank" : "ready";
}

/** The Projects once the transcripts and git are read – what Home, Projects and the Graph list –
 * with the page's phase; null until then, so no page files a Project under a group or a Loose End
 * it would leave a moment later. */
export function useProjectsRead(): { phase: ReturnType<typeof useSkeleton>; projects: Project[] | null } {
  const loaded = useStore((s) => s.projects);
  const read = useStore((s) => s.read);
  const phase = useSkeleton(!loaded || !read.sessions || !read.git);
  return { phase, projects: phase === "ready" ? loaded : null };
}
