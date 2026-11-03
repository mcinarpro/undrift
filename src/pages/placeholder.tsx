import type { Page } from "@/store";

const TITLES: Record<Page, string> = { home: "Home", projects: "Projects", graph: "Graph", settings: "Settings" };

// A page the shell leads to that is not built yet – Settings – with only its h1.
export function Placeholder({ page }: { page: Page }) {
  return (
    <div className="flex flex-col gap-6 px-8 py-8">
      <h1 className="type-heading-24">{TITLES[page]}</h1>
    </div>
  );
}
