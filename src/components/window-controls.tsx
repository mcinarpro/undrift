import { closeWindow, inTauri, minimizeWindow, toggleMaximizeWindow } from "@/bridge";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

const CONTROLS: { icon: IconName; label: string; run: () => Promise<void> }[] = [
  { icon: "minimize", label: "Minimize", run: minimizeWindow },
  { icon: "maximize", label: "Maximize", run: toggleMaximizeWindow },
  { icon: "close", label: "Close", run: closeWindow },
];

// The window has no native decorations (tauri.conf.json), so the top bar draws its own buttons.
// A plain browser has no window to drive.
export function WindowControls() {
  if (!inTauri) return null;
  return (
    <div className="flex items-center gap-0.5">
      {CONTROLS.map((c) => (
        <button
          key={c.icon}
          type="button"
          aria-label={c.label}
          onClick={() => c.run().catch((e) => console.error(`${c.label.toLowerCase()}:`, e))}
          className={cn(
            "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150",
            c.icon === "close" ? "hover:bg-error-fill hover:text-white" : "hover:bg-alpha-100 hover:text-foreground",
          )}
        >
          <Icon name={c.icon} size={c.icon === "maximize" ? 12 : 14} />
        </button>
      ))}
    </div>
  );
}
