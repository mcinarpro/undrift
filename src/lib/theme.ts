// System, Light or Dark (DESIGN.md § Theme). index.html applies the saved choice before the first
// paint; this keeps data-theme in step afterwards, including when the system flips.

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "theme";
const media = matchMedia("(prefers-color-scheme: dark)");

export function savedTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage can be unavailable; the choice still applies for this run.
  }
  apply(choice);
}

media.addEventListener("change", () => apply(savedTheme()));
