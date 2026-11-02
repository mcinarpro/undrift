import { cn } from "@/lib/utils";

// DESIGN.md § Drift strip: 30 cells, oldest left, today right. Decoration for sighted users – the
// active-day count written beside it carries the same information.
export function DriftStrip({ cells, className }: { cells: boolean[]; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("grid grid-cols-30 gap-0.5", className)}>
      {cells.map((on, i) => (
        <span key={i} className={cn("h-3.5 rounded-[2px]", on ? "bg-mark" : "bg-cell-off")} />
      ))}
    </span>
  );
}
