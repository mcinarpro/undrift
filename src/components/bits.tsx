import type { CSSProperties, ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";
import { monogram } from "@/lib/home";
import { cn } from "@/lib/utils";

/** Geist's Keyboard Input: 20 px, 12 px Geist Sans, `surface` with `text-2` inside an `alpha-400` edge. */
export function Key({ children }: { children: ReactNode }) {
  return <Kbd className="rounded-sm bg-card text-text-2 shadow-[0_0_0_1px_var(--ud-alpha-400)]">{children}</Kbd>;
}

/** A small square in an Area's colour – the Parked grey for Unsorted. */
export function AreaSwatch({ color, className }: { color: string | undefined; className?: string }) {
  const tint = color ? ({ "--area": `var(--ud-area-${color})` } as CSSProperties) : undefined;
  return <span aria-hidden="true" style={tint} className={cn("size-3 shrink-0 rounded-[3px]", color ? "bg-(--area)" : "bg-parked", className)} />;
}

/** A Project's avatar: its initials on a raised square, as Vercel shows a framework icon. In an
 * Area, the square takes a light tint of the Area's colour, so a Project's theme shows at a glance. */
export function ProjectAvatar({ name, color, size = 32 }: { name: string; color?: string; size?: number }) {
  const tint = color ? ({ "--area": `var(--ud-area-${color})` } as CSSProperties) : undefined;
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.38, ...tint }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md font-semibold text-text-2 edge",
        color ? "bg-[color-mix(in_oklab,var(--area)_18%,var(--ud-surface))]" : "bg-secondary",
      )}
    >
      {monogram(name)}
    </span>
  );
}

/** Geist's Empty State, informational kind: an icon in a box, maybe a title, one sentence, maybe an action. */
export function Empty({ icon, title, children, action }: { icon: ReactNode; title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-12 text-center">
      <span className="flex items-center justify-center rounded-lg p-2.5 text-text-2 edge">{icon}</span>
      <div className="flex flex-col items-center gap-2">
        {title && <h3 className="type-heading-16 text-balance">{title}</h3>}
        <p className="max-w-[340px] type-copy-14 text-balance text-text-2">{children}</p>
      </div>
      {action}
    </div>
  );
}
