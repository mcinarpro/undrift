import type { ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";

/** Geist's Keyboard Input: 20 px, 12 px Geist Sans, `surface` with `text-2` inside an `alpha-400` edge. */
export function Key({ children }: { children: ReactNode }) {
  return <Kbd className="rounded-sm bg-card text-text-2 shadow-[0_0_0_1px_var(--ud-alpha-400)]">{children}</Kbd>;
}
