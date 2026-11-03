import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Geist's Button on top of the generated one, which stays as shadcn wrote it. Every class here
// overrides a generated one through cn, so the generated defaults never leak into the window.
// Class names are written out in full, because Tailwind only finds literal strings.
const action = cva(
  [
    // No border: the generated transparent border plus bg-clip-padding would inset the fill by
    // 1 px, leaving a gap between it and the edge shadow.
    "gap-1.5 rounded-md border-0 text-sm/5 font-medium",
    // Colour changes only, and no press movement (DESIGN.md § Shape and motion).
    "transition-[background-color,box-shadow,color] active:not-aria-[haspopup]:translate-y-0",
    // The generated focus-visible:ring-1 sets box-shadow at utility level, which hides the base
    // :focus-visible rule, so each variant below draws Geist's double ring itself.
    "focus-visible:ring-0",
    // Geist's disabled button is greyed out, not a faded version of the live one.
    "disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-[0_0_0_1px_var(--ud-line)]",
  ],
  {
    variants: {
      variant: {
        // A solid hover: the generated hover:bg-primary/80 mixes the fill with the surface.
        primary: "hover:bg-button-hover focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]",
        // Geist's secondary: the page surface inside a gray-400 edge, gray-100 on hover.
        secondary:
          "bg-card text-foreground shadow-[0_0_0_1px_var(--ud-line)] hover:bg-secondary focus-visible:shadow-[0_0_0_1px_var(--ud-line),0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]",
        // The ! is needed because the generated dark:hover:bg-muted/50 survives cn and would win,
        // leaving a hover that cannot be seen on the black page.
        tertiary: "hover:bg-alpha-200! focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]",
        // Geist's error button, for the one action that erases something: red-800 with white text.
        // The hover darkens the fill instead of taking red-900, which is lighter in dark and would
        // drop white text under 4.5:1.
        error:
          "bg-error-fill text-white hover:bg-[color-mix(in_oklab,var(--ud-error-fill),black_12%)] focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)]",
      },
      size: {
        small: "h-8 px-3",
        medium: "h-9 px-4",
        // Geist's svgOnly button: a square at the small height.
        icon: "size-8",
        // Geist's tiny svgOnly button, for a control that sits inside a field, with its 4 px corner.
        tiny: "size-6 rounded-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "medium" },
  },
);

// The generated variant each Geist type starts from. Outline is avoided: its dark: border and
// fill survive cn and would grey the secondary button in dark.
const BASE = { primary: "default", secondary: "secondary", tertiary: "ghost", error: "default" } as const;

type ActionProps = Omit<ComponentProps<typeof Button>, "variant" | "size"> & VariantProps<typeof action>;

export function Action({ variant = "primary", size = "medium", className, ...props }: ActionProps) {
  return (
    <Button
      variant={BASE[variant ?? "primary"]}
      size={size === "icon" || size === "tiny" ? "icon" : "default"}
      className={cn(action({ variant, size }), className)}
      {...props}
    />
  );
}

/** Geist's split button: the action itself, and beside it a chevron that opens the menu of its
 * alternatives. The two halves share one shape, split by a 1 px line in the label's colour, so they
 * read as one button with two targets. The menu's items are the caller's. */
export function SplitAction({
  onClick,
  children,
  menuLabel,
  menu,
}: {
  onClick: () => void;
  children: ReactNode;
  /** Names the chevron for screen readers, which see only an icon. */
  menuLabel: string;
  menu: ReactNode;
}) {
  return (
    <div className="flex">
      <Action variant="primary" size="medium" onClick={onClick} className="rounded-r-none">
        {children}
      </Action>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Action
              variant="primary"
              size="medium"
              aria-label={menuLabel}
              className="w-9 rounded-l-none px-0 shadow-[inset_1px_0_0_color-mix(in_oklab,var(--ud-on-button)_25%,transparent)]"
            />
          }
        >
          <Icon name="chevron" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 rounded-xl p-1 ring-0 shadow-(--ud-shadow-menu)">
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
