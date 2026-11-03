import type { ReactNode } from "react";
import { Bar } from "@/components/loading";
import { cn } from "@/lib/utils";

// A page's own rail beside its content (DESIGN.md § Components): sections of 32 px rows, each a
// toggle with its mark, its label and its count. Projects narrows its list with it; the Graph
// lights its network with it.

/** What brought a row into view: the two come and go apart, so the pointer passing over another
 * row never takes the light from the row that has the focus. */
export type LightBy = "pointer" | "focus";

/** The four handlers that tell `onLight` when the pointer or the focus comes to a row and leaves. */
export const lightHandlers = (onLight?: (on: boolean, by: LightBy) => void) => ({
  onPointerEnter: () => onLight?.(true, "pointer"),
  onPointerLeave: () => onLight?.(false, "pointer"),
  onFocus: () => onLight?.(true, "focus"),
  onBlur: () => onLight?.(false, "focus"),
});

/** One row of a rail, on `alpha-200` while it is current, as the header's tabs are. `onLight` is
 * told when the pointer or the focus comes and goes, for a page that previews a row before it is
 * chosen. */
export function RailItem({
  current,
  marker,
  label,
  count,
  onClick,
  onLight,
}: {
  current: boolean;
  marker?: ReactNode;
  label: string;
  count: number;
  onClick: () => void;
  onLight?: (on: boolean, by: LightBy) => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={current}
        onClick={onClick}
        {...lightHandlers(onLight)}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md px-2.5 type-label-14 transition-colors duration-150",
          current ? "bg-alpha-200 text-foreground" : "text-text-2 hover:bg-alpha-100 hover:text-foreground",
        )}
      >
        {marker}
        <span className="grow truncate text-left">{label}</span>
        <span className="type-label-13 text-muted-foreground tabular-nums">{count}</span>
      </button>
    </li>
  );
}

export function RailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-2.5 type-label-12 text-muted-foreground uppercase">{title}</h2>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}

/** A rail in Skeletons while its page waits for the bridge: two sections of rows, so the page
 * keeps its width and shape. */
export function RailSkeleton() {
  return (
    <div aria-hidden="true" className="flex w-60 shrink-0 flex-col gap-6 self-start py-8 pl-6">
      {[5, 3].map((rows, i) => (
        <div key={i} className="flex flex-col gap-2 px-2.5">
          <Bar className="h-3 w-16" />
          {Array.from({ length: rows }, (_, j) => (
            <Bar key={j} className="h-5 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Keeps the rows without a dot or a swatch in line with those that have one. */
export const NO_MARKER = <span aria-hidden="true" className="size-2.5 shrink-0" />;
