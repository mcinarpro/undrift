import type { Page } from "@/store";

export const TITLES: Record<Page, string> = { home: "Home", projects: "Projects", graph: "Graph", settings: "Settings" };

// The pages the shell leads to, each with only its h1 until #3 and #4 fill them. The Graph's title
// is the top bar's alone, so its h1 is for screen readers (DESIGN.md § Type).
export function Placeholder({ page }: { page: Page }) {
  return (
    <div className="flex flex-col gap-6 px-8 py-8">
      <h1 className={page === "graph" ? "sr-only" : "type-heading-24"}>{TITLES[page]}</h1>
    </div>
  );
}
