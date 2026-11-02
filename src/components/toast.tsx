import type { ReactNode } from "react";
import { Toast } from "@base-ui/react/toast";
import { Action } from "@/components/action";

// Geist's Toast on Base UI's: a 420 px card in the bottom-right corner that says what just happened,
// sometimes with one action, and leaves by itself.

/** The window's one toast manager. It lives outside React, so the store can raise a toast too. */
export const toasts = Toast.createToastManager();

/**
 * A bridge call that failed. The window would otherwise show nothing, so the failure is said in a
 * toast, and logged with its cause for debugging. `what` reads after "Couldn’t": "resume the Session".
 */
export function failed(what: string, err: unknown) {
  console.error(`${what}:`, err);
  // High priority: Base UI announces it at once instead of waiting for a pause.
  toasts.add({ title: `Couldn’t ${what}. Try again.`, priority: "high" });
}

/** Wraps the window: every toast, from anywhere, lands in this one corner. */
export function Toaster({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toasts} timeout={3500}>
      {children}
      <Toast.Portal>
        {/* Newest at the bottom, nearest the corner. Hovering or focusing the corner pauses every timer. */}
        <Toast.Viewport className="fixed right-6 bottom-6 z-50 flex w-[420px] flex-col-reverse gap-3 outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts: list } = Toast.useToastManager();
  return list.map((t) => (
    <Toast.Root
      key={t.id}
      toast={t}
      // A desktop window has no touch to swipe with; a toast leaves on its timer, Esc or its action.
      swipeDirection={[]}
      className="rounded-xl bg-card p-4 type-copy-14 shadow-(--ud-shadow-menu) transition-[opacity,translate] duration-300 ease-[cubic-bezier(.175,.885,.32,1.1)] focus-visible:shadow-[0_0_0_2px_var(--ud-surface),0_0_0_4px_var(--ud-focus)] data-ending-style:opacity-0 data-limited:hidden data-starting-style:translate-y-4 data-starting-style:opacity-0"
    >
      <Toast.Content className="flex items-center gap-4">
        {/* A paragraph, not the generated h2: a toast is a message, not a section of the page. */}
        <Toast.Title render={<p />} className="grow text-pretty" />
        <Toast.Action render={<Action variant="secondary" size="small" />} />
      </Toast.Content>
    </Toast.Root>
  ));
}
