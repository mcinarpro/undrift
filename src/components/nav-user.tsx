import { openExternal } from "@/bridge";
import { Icon, type IconName } from "@/components/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ThemeChoice } from "@/lib/theme";
import { useStore } from "@/store";

const THEMES: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: "system", label: "System", icon: "system" },
  { value: "light", label: "Light", icon: "light" },
  { value: "dark", label: "Dark", icon: "dark" },
];

// Geist's menu rows: 36 px, 6 px radius, 14 px text.
const ROW = "h-9 gap-2 rounded-md px-2 text-sm";

/** The avatar, else the first letter of the login, else an empty circle when no one is signed in. */
function Avatar({ src, login }: { src: string | null; login: string | undefined }) {
  if (src) return <img src={src} alt="" className="size-8 shrink-0 rounded-full edge" />;
  return (
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary type-label-14 font-medium text-text-2 uppercase edge">
      {login?.slice(0, 1)}
    </span>
  );
}

// shadcn's nav-user block: who you are at the foot of the sidebar, and the quiet things in its menu.
export function NavUser() {
  const { user, avatar, go, theme, setTheme, quit } = useStore();
  // Without a cached user – `gh` signed out, missing, or not answered yet – the menu stays, since
  // Settings, the theme and Quit do not depend on the account.
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-12 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors duration-150 hover:bg-alpha-100">
        <Avatar src={avatar} login={user?.login} />
        {user ? (
          <span className="flex min-w-0 grow flex-col">
            <span className="truncate type-label-14 font-medium">{user.name}</span>
            <span className="truncate type-label-13 text-muted-foreground">@{user.login}</span>
          </span>
        ) : (
          <span className="grow truncate type-label-14 text-text-2">Not signed in</span>
        )}
        <Icon name="switch" size={14} className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="rounded-xl p-1 ring-0 shadow-(--ud-shadow-menu)">
        {user && (
          <DropdownMenuItem onClick={() => openExternal(user.profileUrl).catch((e) => console.error("open profile:", e))} className={ROW}>
            <Icon name="profile" className="text-muted-foreground" />
            Open GitHub Profile
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => go("settings")} className={ROW}>
          <Icon name="settings" className="text-muted-foreground" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 pt-1.5 pb-1 type-label-12 font-normal text-muted-foreground">Theme</DropdownMenuLabel>
          {/* The generated radio item draws the tick on the theme in use. */}
          <DropdownMenuRadioGroup value={theme} onValueChange={(v: ThemeChoice) => setTheme(v)}>
            {THEMES.map((t) => (
              <DropdownMenuRadioItem key={t.value} value={t.value} className={ROW}>
                <Icon name={t.icon} className="text-muted-foreground" />
                {t.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuItem onClick={quit} className={ROW}>
          <Icon name="quit" className="text-muted-foreground" />
          Quit
          {/* The generated shortcut is spaced out for symbols; a written key reads as a word. */}
          <DropdownMenuShortcut className="tracking-normal">Ctrl Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
