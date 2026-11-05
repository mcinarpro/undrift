import type { Page } from "@/store";

const TITLES: Record<Page, string> = { today: "Today", week: "Week", projects: "Projects", sessions: "Sessions", settings: "Settings" };

// Settings, the one page v2 has not drawn yet: only its h1.
export function Placeholder({ page }: { page: Page }) {
  return (
    <div className="flex flex-col gap-6 px-8 py-8">
      <h1 className="type-heading-24">{TITLES[page]}</h1>
    </div>
  );
}
