import { useState, type ReactNode } from "react";
import { Action } from "@/components/action";
import { Button } from "@/components/ui/button";

// A throwaway page that shows every Geist token and type style in both themes, so the theme can be
// checked by eye before the first real view replaces it.

type Theme = "system" | "light" | "dark";

/** The same rule as the script in index.html, applied again when the choice changes. */
function applyTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    // A blocked storage only means the choice is not remembered.
  }
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-label-14 font-medium">{title}</h2>
      <div className="flex flex-wrap items-center gap-3 rounded-xl p-5 material-small">{children}</div>
    </section>
  );
}

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className={`size-10 rounded-md edge ${className}`} />
      <span className="type-label-12 text-muted-foreground">{name}</span>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("theme") as Theme | null) ?? "system";
    } catch {
      return "system";
    }
  });
  const choose = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="type-heading-32">Theme Check</h1>
          <p className="type-copy-14 text-text-2">Every Geist token and type style, in the theme you pick.</p>
        </div>
        <div className="flex gap-1 rounded-lg p-1 edge">
          {(["system", "light", "dark"] as const).map((t) => (
            <Button key={t} size="sm" variant={theme === t ? "secondary" : "ghost"} onClick={() => choose(t)} className="capitalize">
              {t}
            </Button>
          ))}
        </div>
      </header>

      <Section title="Buttons">
        <Action>Resume</Action>
        <Action variant="secondary">Examine</Action>
        <Action variant="tertiary">Tertiary</Action>
        <Action variant="error">Forget…</Action>
        <Action disabled>Disabled</Action>
        <Action size="small">Small</Action>
        <Action variant="secondary" size="small">Small Secondary</Action>
      </Section>

      <Section title="Surfaces">
        <Swatch name="bg" className="bg-background" />
        <Swatch name="surface" className="bg-card" />
        <Swatch name="raised" className="bg-secondary" />
        <Swatch name="rail" className="bg-rail" />
        <Swatch name="line-strong" className="bg-line-strong" />
        <Swatch name="alpha-200" className="bg-alpha-200" />
        <Swatch name="button" className="bg-primary" />
      </Section>

      <Section title="Marks and Areas">
        <Swatch name="accent" className="bg-mark" />
        <Swatch name="drifting" className="bg-drifting" />
        <Swatch name="parked" className="bg-parked" />
        <Swatch name="error" className="bg-error-fill" />
        <Swatch name="purple" className="bg-(--ud-area-purple)" />
        <Swatch name="green" className="bg-(--ud-area-green)" />
        <Swatch name="pink" className="bg-(--ud-area-pink)" />
        <Swatch name="teal" className="bg-(--ud-area-teal)" />
      </Section>

      <Section title="Text">
        <span className="type-label-14">text</span>
        <span className="type-label-14 text-text-2">text-2</span>
        <span className="type-label-14 text-muted-foreground">muted</span>
        <span className="type-label-14 text-accent-text">accent-text</span>
        <span className="type-label-14 text-drifting-text">drifting-text</span>
        <span className="type-label-14 text-error">error</span>
      </Section>

      <section className="flex flex-col gap-3">
        <h2 className="type-label-14 font-medium">Type</h2>
        <div className="flex flex-col gap-3 rounded-xl p-5 material-small">
          <p className="type-heading-32">Heading 32 – the big figure</p>
          <p className="type-heading-24">
            Heading 24 – <strong>12 active days</strong>
          </p>
          <p className="type-heading-16">Heading 16 – Empty State title</p>
          <p className="type-heading-14">Heading 14 – Project card name</p>
          <p className="type-label-14">
            Label 14 – row text, <strong>strong part</strong>
          </p>
          <p className="type-label-13 text-muted-foreground">Label 13 – one-line metadata</p>
          <p className="type-label-12 text-muted-foreground">Label 12 – axis, field label</p>
          <p className="type-label-13-mono text-text-2">~/workspace/undrift · main · 12 files · +340 −80</p>
          <p className="type-copy-14 text-text-2">
            Copy 14 – running text that may wrap over several lines, with a <strong>strong part</strong> and an{" "}
            <em>italic last prompt</em>.
          </p>
        </div>
      </section>

      <p className="type-copy-13 text-muted-foreground">Tab through the buttons to see the double focus ring; select text to see the inversion.</p>
    </main>
  );
}
