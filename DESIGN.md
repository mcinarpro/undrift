# DESIGN.md – Undrift's visual system

Undrift speaks Vercel's **Geist** design language: an achromatic interface with gray-1000 primary
buttons, one blue for marks, links and focus, status colour as small dots or a subtle Badge, edges
drawn with a 1 px shadow, tight headings. Calm by restraint – nothing blinks, nothing shouts. References: [vercel.com/geist](https://vercel.com/geist/introduction)
and design-bites' [vercel.com DESIGN.md](https://github.com/educlopez/design-bites/blob/main/design-mds/vercel.com/DESIGN.md);
the colour values below are Geist's own, read from vercel.com's stylesheet.

## Layout

Undrift is laid out the way Vercel's dashboard is: a sidebar, a thin top bar, and pages rather than
side panels. The window is at least 1100 × 700. Every page uses the full width of the window. A view
is described here once it is built; until then this section holds what was decided.

- **Sidebar** (240 px): the symbol and name · *Find…* (`F`) · Home, Projects, Graph · the
  **NavUser** at the bottom, as shadcn's nav-user block – the avatar, name and `@login` of the
  account `gh` is signed in to; its menu holds Open GitHub Profile, Settings, the theme (System,
  Light, Dark) and Quit. The current page sits on `alpha-200`; a Project page belongs to Projects.
- **Title bar**: the window has no native decorations. The sidebar header and the top bar share one
  48 px line and are the drag region (double-click maximizes).
- **Top bar** (48 px): a breadcrumb on the left (*Area / Project* on a Project page), the page title
  in the centre (a label, not a heading), the page's actions on the right, then minimize, maximize
  and close (close hides to the tray).
- **Find** (`F` or `Ctrl K`): Geist's Command Menu over Projects, the last Sessions (Enter
  resumes), the pages and the actions.
- **Home**, the first page (ADR 0001): the Loose Ends in three sections – Last Night (since 18:00 the
  day before), This Week, Older – newest first, the biggest diff first within a section. Each shows
  its Project and Area, the last Session's title and last prompt, files changed with +/−, the
  branch, how long ago it was left and the Status of its Session when one is open. Resume is the primary
  action, Let Go sits in a `⋯` menu. Under them, the Issues ready to Start, each with Start. With none, Geist's Empty State says
  *Nothing left half-done.* above the five Projects touched last, each with Resume. The layout is
  being chosen on the `prototype/home` branch of `undrift-old`.
- **Projects**: every Project as Vercel's project card, filtered by Area – avatar, name, path,
  status dot, last commit, branch · relative time · uncommitted, and the Drift strip.
- **Project page**, shaped like Vercel's Project Overview: a **Where You Left Off** card – the Drift
  strip, Drift, Last Activity, Area, Last Session, Last Prompt, the diff stat – with New Session and
  Resume; then the Project's Issues, Earlier Sessions, Git and Focus.
- **Graph**: the Projects as a network (GLOSSARY.md), on a page of its own – a d3-force simulation
  in SVG, a hub per Area in its colour, a node per Project ringed in its group's colour, a dot per
  Session by Status. It is kept for two weeks of use and removed if it is not opened.
- **Settings**: the notification switch, then what still lives only in `config.json`.
- **First load**: while the bridge reads the Projects, the page is its own shape in Skeletons – none
  for a load under 200 ms, and at least 300 ms once shown.
- **Feedback**: a bridge call that fails says so in a toast (*Couldn’t resume the Session. Try
  again.*). Relative times tick every minute.

## Colour

Tokens live in `src/styles/theme.css` as `--ud-<token>` CSS variables with a light and a dark value.
`src/index.css` maps shadcn's names onto them (`primary` = `button`, `secondary` / `muted` / `accent`
backgrounds = `raised`, `muted-foreground` = `muted`, `border` = `line`, `ring` = `focus`,
`destructive` = `error-text`) and exposes the rest as Tailwind colours (`rail`, `line-strong`,
`text-2`, `accent-text`, `mark`, `cell-off`, `shimmer`, `drifting`, `drifting-text`, `parked`, `button-hover`, `alpha-100` …
`alpha-600`, `error`,
`error-fill`, `error-line`, `error-bg`). Components use these classes, never a hex.

| Token | Light | Dark | Geist step · role |
|---|---|---|---|
| `bg` | `#fafafa` | `#000000` | background-200 · window ground |
| `rail` | `#fafafa` | `#000000` | the rail |
| `surface` | `#ffffff` | `#0a0a0a` | background-100 · cards, panel |
| `raised` | `#f2f2f2` | `#1a1a1a` | gray-100 · secondary-button hover, disabled button, the last-Session box |
| `line` | `#ebebeb` | `#2e2e2e` | gray-400 · edges |
| `line-strong` | `#c9c9c9` | `#454545` | gray-500 · hovered card edge |
| `text` | `#171717` | `#ededed` | gray-1000 · 17.2 / 17.9:1 on `bg` |
| `text-2` | `#4d4d4d` | `#a1a1a1` | gray-900 · git lines, secondary copy – 8.1 / 8.1:1 |
| `muted` | `#666666` | `#8f8f8f` | labels, paths, dates – 5.5 / 6.5:1 |
| `accent` | `#0072f5` | `#0072f5` | blue-700 · marks only: strip cells, the In Motion dot and Badge tint, the Gauge's value arc, the drop-target ring |
| `accent-text` | `#0068d6` | `#52a8ff` | blue-900 · blue text – 5.1 / 8.4:1 |
| `focus` | `#0072f5` | `#52a8ff` | Geist's focus colour · blue-700, blue-900 in dark |
| `button` | `#171717` | `#ededed` | gray-1000 · primary button – 17.9 / 16.9:1 with `on-button` |
| `button-hover` | `#383838` | `#cccccc` | the hovered primary button, a solid step |
| `on-button` | `#ffffff` | `#0a0a0a` | the primary button's label |
| `overlay` | `#f2f2f2` | `#000000` | gray-100 / background-200 · the dialog backdrop, laid at 80% |
| `shimmer` | `#ebebeb` | `#1f1f1f` | gray-200 · the light that sweeps across a Skeleton |
| `cell-off` | `alpha-400` | `alpha-400` | Geist's gauge track · a day without Activity, the ring's track – `#ebebeb` / `#2d2d2d` on a card, `#dfdfdf` / `#3a3a3a` on the raised box |
| `drifting` | `#ffb224` | `#ffb224` | amber-700 · the Drifting dot, the Drifting Badge's tint |
| `drifting-text` | `#a35200` | `#f2a20d` | amber-900 · the Drifting Badge's word – 5.1 / 7.3:1 on its tint |
| `parked` | `#a8a8a8` | `#878787` | gray-600 · the Parked dot |
| `area-purple` · `area-green` · `area-pink` · `area-teal` · `area-gray` | `#8e4ec6` · `#30a46c` · `#d6409f` · `#12a594` · `#8d8d8d` | same | Radix step 9 · the Area colours, never blue or amber: the Area's swatch and its hub in the Graph |
| `alpha-100` … `alpha-600` | `#0000000d` … `#00000057` | `#ffffff0f` … `#ffffff82` | gray-alpha 100, 200, 400, 500, 600 · 100 hover, 200 selected, 400 a field's or a key's edge and the gauge track, 500 a hovered field's edge – the same on any surface |
| `error-text` | `#cb2a2f` | `#ff6166` | red-900 · error text (`text-error`) – 5.4 / 6.7:1 |
| `error-fill` | `#da2f35` | `#d93036` | red-800 · the hovered Close; white on it 4.7:1 |
| `error-line` | `#fdd8d8` | `#671e21` | red-400 · an error Note's edge |
| `error-bg` | `#ffebeb` | `#3c1618` | red-200 · an error Note's fill |

- Blue is the only colour of the interface, and it is never a button fill: the primary button is
  Geist's gray-1000, as on the Vercel dashboard. Two deliberate departures from Geist, both for WCAG
  AA: `muted` is `#666666` (Geist's gray-700, `#8f8f8f`, is 3.2:1 on white), and blue text uses
  blue-900 (blue-700 is 4.3:1 on the page).
- On a wide-gamut panel (`color-gamut: p3`), `accent`, `focus`, `accent-text` and `drifting` take
  Geist's own oklch values; every other panel keeps the hex above.
- Selection is Geist's inversion: `text` behind, `raised` in front.
- Errors are a Geist Note: `error` text on `error-bg` in a 6 px box with a 1 px `error-line` edge.
- Group colours (`drifting`, `parked`, and `mark` for In Motion) appear as dots of 8–10 px, with the
  group written beside them or for screen readers; a dot alone in a row is given the Project's name,
  so it says *undrift is drifting* on hover and to screen readers. Where the group is the point – the Project
  page's Drift field and the Projects list row – it is Geist's subtle Badge instead: the word in a
  readable step of the colour (`accent-text`, `drifting-text`, `text-2`) on a 10–15% tint of it
  (`alpha-200` for Parked). Blue's tint is mixed into `surface` and opaque, so a hovered row cannot
  take *In Motion* under 4.5:1. Never a fill behind other text.

## Theme

System, Light or Dark, switched from the NavUser's menu; System follows `prefers-color-scheme`. A script in
`index.html` resolves the choice before the first paint and always sets `data-theme` to `light` or
`dark` on `<html>`; Tailwind's `dark:` variant follows that attribute. Our components write no
`dark:` classes – a token changes value, not the component. shadcn's generated components keep theirs.

## Type

- **Geist Sans** for the interface and for shortcuts (`Kbd`, menu shortcuts, Find's Esc), as Geist's
  Keyboard Input; **Geist Mono** for paths, git lines and Drift values. Both bundled as variable
  fonts (no network). The body takes vercel.com's features – `"calt" 0, "rlig", "ss11"` – so
  ligatures stay on, contextual alternates are off and stylistic set 11 is on; `html` sets `text-rendering: optimizeLegibility` and `font-synthesis: none`.
- Geist's named type styles, as `type-*` utilities in `index.css` with the values of vercel.com's
  stylesheet. They are prefixed `type-`, not `text-`, because `cn` reads an unknown `text-*` as a
  colour and drops it beside a real one. Views write no size, line height or tracking by hand; the
  only `text-*` sizes left sit on controls that override a generated component through `cn` (menu
  items, Find's rows, headings, empty message and Esc key, the Hint's 13 px / 1.3) and on the small
  Badge, whose 11 px has no named style.

  | Role | Style | Size / line · weight · tracking |
  |---|---|---|
  | page title · the big figure | `type-heading-24` · `type-heading-32` | 24/32 · 32/40, 600, −0.96 / −1.28 px |
  | Empty State title | `type-heading-16` | 16/24, 600, −0.32 px |
  | Project card name | `type-heading-14` | 14/20, 600, −0.28 px |
  | Panel and card title, row name, top-bar title | `type-label-14 font-medium` | 14/20, 500 – Geist's label-14 strong |
  | one-line metadata, field label · axis | `type-label-13` · `type-label-12` | 13/16 · 12/16, 400 |
  | path, branch, Drift value | `type-label-13-mono` | 13/20 Geist Mono, 400 |

  Running text is `type-copy-14` (14/20) or, when 13 px text may wrap, `type-copy-13` (13/18); row
  text and field values are `type-label-14`. Buttons are Geist's button-14 (14/20, 500), written as
  `text-sm/5 font-medium` in `Action`.
- A `<strong>` inside a style picks out part of it, as in Geist: in a heading it is 500 in `text-2`
  (*12 **active days***), in a label 500 in `text`, in copy 550 in `text`.
- Numbers that change or line up – counts, relative times, days, the big figure – take
  `tabular-nums`.
- Weights 400, 500, 600 – no bold. The one exception is 550, Geist's strong inside copy.
- Casing: headings, card and Panel titles, field labels, filter labels, buttons, menu items and
  Find's headings and actions are Title Case (*Where You Left Off*, *Needs You*, *In Motion*, *Last
  Activity*); running text and descriptions stay sentence case. Never small uppercase.
- Structure: every page has one `h1` – visible on Home, Projects and Settings, `sr-only`
  on the Project page and the Graph, whose title the top bar shows – and its cards and Panels are `h2`. Labelled
  values are Geist's Description: a `<dl>` of `<dt>` / `<dd>` pairs.

## Drift strip

30 cells, one per day, oldest left, today right. A cell is `accent` when the day had Activity, else
`cell-off`, a translucent track that stays visible on a card and on the raised box alike; 2 px gap,
2 px radius, 14 px tall. It is decoration for sighted users (`aria-hidden`); the Drift value carries
the information.

## Shape and motion

- The Graph is the one place that moves on its own: the network settles into place, a busy
  Session's dot pulses, and sparks run from it to its Project and on to the Area. Under
  `prefers-reduced-motion` the layout settles at once and nothing moves.
- Edges are a 1 px spread shadow (`edge` utility, `0 0 0 1px var(--ud-line)`), not `border`; the rail
  and the top bar use a one-sided shadow. A drop target being hovered gets a 2 px `accent` ring.
- Cards wear Geist's material-small, as the Vercel dashboard's cards do: the `material-small` utility
  in `index.css` – `surface` behind `--ud-shadow-small`, the edge plus a small drop – with the radius
  as its own class, since cards come in 6 and 12 px. A hovered Project card lays a `line-strong` ring
  over it and keeps the drop. A material is a utility, so it hides the base focus ring: a focusable
  card draws the double ring itself. `--ud-shadow-medium`, `--ud-shadow-menu` and `--ud-shadow-modal` are
  Geist's other materials, each starting with the same edge.
- Radius, fixed steps rather than multiples of `--radius`: 4 px `rounded-sm` · 6 px `rounded-md` for
  buttons, rows, sidebar links, avatars, and the Project cards and list cards (the Projects grid), as on Vercel's dashboard · 8 px `rounded-lg` · 12 px `rounded-xl` for
  Panels, the Project page's cards, dialogs and menus · 2 px for strip cells · full for dots.
- Spacing on the 4 px grid. Separation by space and surface, not divider lines.
- Overlays move as Geist's: Find scales in from 96% over 300 ms on Geist's swift curve,
  `cubic-bezier(.175,.885,.32,1.1)`, over an `overlay` backdrop at 80% with no blur – an unlayered
  rule in `index.css`, so the generated dialog stays untouched.
- Hover and selection are Geist's two steps on background-100: `alpha-100` under the pointer (rows,
  sidebar links, the top-bar scope, the window controls, the Project pill), `alpha-200` for what is
  current (the sidebar's page, the chosen segment). Buttons keep their own hovers (§ Components).
- Loading moves as Geist's: the Spinner's bars fade over a 1 s cycle, a Skeleton's gray-200 light
  sweeps across it every 1.5 s, both only under `motion-safe`. A toast rises 16 px and fades in over
  300 ms on the swift curve, and fades out.
- Hover changes colour or shadow only, 150 ms; no movement. Under `prefers-reduced-motion: reduce`, a
  base rule in `index.css` ends every animation and transition at once, the generated dialogs included.

## Keyboard

`F` or `Ctrl K` opens Find · `/` jumps to the Projects search · `Esc` closes Find · `Ctrl Q` quits.
Focus is Geist's double ring: `0 0 0 2px` `surface` (background-100), then `0 0 0 4px` `focus`; text
fields show focus with their caret and frame instead. That frame is `--ud-focus-border`, Geist's field
halo (a gray-alpha-600 edge in a 4 px halo), and it stays while the pointer is over the field. Segmented
controls are native radios: one tab stop per group, the arrow keys move the choice. `F6` moves
into the toasts, where `Esc` dismisses the focused one.

## Components

shadcn/ui on Base UI, restyled through the tokens. Each piece below lands with the first view that
needs it, at the path it names. Icons: Lucide, shadcn's icon library
(`components.json`), 2 px stroke – 20 px in the sidebar, 16 px inline.
The logo comes from `art/` – never redrawn, never retyped; in the interface it takes the text colour.

- **Buttons** are Geist's Button, through `src/components/action.tsx` (`Action`), never `ui/button`
  directly. Every size is 14 px / 500, 6 px radius (4 px for `tiny`), 6 px icon gap, 16 px icons.
  - `variant`: `primary` (`button` fill, `button-hover`, `on-button` label) · `secondary` (`surface`
    inside a 1 px `line` edge, `raised` on hover) · `tertiary` (no fill, `alpha-200` on hover) ·
    `error` (`error-fill`, white label, the fill darkened 12% on hover), only for an action that erases something.
  - `size`: `small` 32 px, 12 px padding (the top bar, rows) · `medium` 36 px, 16 px padding (cards) ·
    `icon` a 32 px square with an `aria-label` · `tiny` a 24 px square with a 4 px radius, for a control inside a field.
    Geist's large size joins when a view needs it.
  - Focus is the double ring (§ Keyboard), drawn by the wrapper; the secondary keeps its edge inside it.
  - Disabled is greyed, not faded: `raised` fill, `muted` label, `line` edge.
  - `loading` is Geist's loading button: the Spinner takes the leading icon's place, the label stays,
    and the button keeps its focus, says `aria-busy` and ignores clicks (Rescan in the top bar).
  - Labels are Title Case: *Open Folder*, *New Session*, *Add to Focus*.
- **Search field** (the Projects search) is Geist's Input: 36 px, `surface`, an `alpha-400` edge that
  turns `alpha-500` on hover and becomes `--ud-focus-border` on focus. While it holds a query, a tiny
  tertiary Clear Search button (`Action` size `tiny`, a 24 px square) takes the place of the `/` key.
- **Segmented controls** (`Segmented` in `bits.tsx`) are Geist's Switch: a `<fieldset>` with an
  `sr-only` legend, each option a `<label>` around a hidden native radio. 36 px, `surface` inside an
  edge, 4 px padding, 28 px options with a 4 px radius; the chosen one is `alpha-200` and `text`. Labels
  are always 500, so choosing never shifts them. `pill` is Geist's Theme Switcher: round, the chosen
  icon on `surface` inside an edge with a soft `alpha-100` drop.
- **Keys** (`Key` in `bits.tsx`) are Geist's Keyboard Input: 20 px, 12 px Geist Sans, 4 px radius,
  `surface` with `text-2` inside an `alpha-400` edge.
- **Badges** (`Badge` and `GroupBadge` in `bits.tsx`) are Geist's subtle Badge, full radius: `md` 24 px,
  12 px / 500 (the group), `sm` 20 px, 11 px / 500 (the Focus marker on a Project card, `accent-text`
  on a 10% `accent` tint). A Badge labels; it is never a button.
- **Empty State** (`Empty`) is Geist's: 48 px vertical padding and 24 px gaps, the icon in an 8 px
  radius box with 10 px padding and an edge, an optional `type-heading-16` title (an `h3`), a sentence
  of at most 340 px balanced over its lines, then an optional action.
- **Toast** (`src/components/toast.tsx`, on Base UI's Toast) is Geist's: a 420 px `surface` card,
  12 px radius, 16 px padding, `type-copy-14`, `--ud-shadow-menu`, stacked in the bottom-right
  corner with the newest nearest it. It leaves after 3.5 s (an Undo after 5 s); hovering or focusing
  the corner pauses it. One optional action, a small secondary `Action` (*Undo*). A failure reads
  *Couldn’t {do it}. Try again.* through `failed()`, which also logs the cause, and is announced at
  once; anything else is announced politely.
- **Hint** (`Hint` in `bits.tsx`, on the generated Tooltip) is Geist's Tooltip: 8 px radius, 8 × 6 px
  padding, 13 px / 1.3 balanced text, after a shared 150 ms delay. It names an icon-only control on
  hover – Grid and List, the theme icons, Resume, Remove from Focus – and never replaces its
  `aria-label`.
- **Relative time** (`RelativeTime` in `bits.tsx`) is Geist's Relative Time Card: *Just now*, *5 min.
  ago*, in a `<time>`, with a Hint giving the local time and UTC, each after its zone in a mono chip.
- **Spinner** (`Spinner` in `bits.tsx`) is Geist's: 16 px, ten 4 × 1.5 px bars 36° apart, in the text
  colour.
- **Skeleton** (`Skeleton` in `bits.tsx`) is Geist's: `raised` (gray-100) with a `shimmer` band, a
  5 px radius unless the shape it stands for has another; the caller gives the size.
- **Gauge** (the Focus ring) is Geist's small Gauge: a `progressbar` with its value, maximum and a
  spoken text, drawn as two round-capped arcs – `accent` for the value, `cell-off` for the track –
  with a 9% gap at each end; a change eases over 1 s under `motion-safe`.
- **Find** is Geist's Command Menu, styled from `find.tsx` and `index.css` (never `ui/command.tsx`):
  - a 640 px modal at 15% from the top, 12 px radius, `--ud-shadow-modal` and no generated ring;
  - an 18 px input in a 52 px header on the modal surface, then an Esc key – 20 px, 12 px Geist Sans,
    4 px radius, edged – that closes it;
  - Title Case group headings of one or two words (Projects, Sessions, Pages, Actions), 36 px rows of
    13 px `text-2`;
  - 36 px rows with a 6 px radius, inside an 8 px padded list at most 436 px tall; the theme and
    layout in use carry the generated tick, and a row with a key (Quit) writes it at its end in
    12 px Geist Sans, `muted`;
  - with no match it says `No results found for "query".`, the query in `text`; the match count is
    announced politely once something is typed.
