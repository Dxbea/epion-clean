import { useEffect } from "react";
import { useBeforeUnload } from "react-router-dom";

/**
 * Minimal unsaved-changes guard driven only by `dirty`.
 * - Tab close/refresh (native browser dialog)
 * - Internal links (<a>/<Link>) clicks
 * - Browser back/forward (popstate)
 */
export function useDirtyGuard(dirty: boolean) {
  // 1) Close/refresh
  // useBeforeUnload must always be called (hooks can't be conditional), so pass a handler that checks `dirty`.
  useBeforeUnload((e: BeforeUnloadEvent) => {
    if (!dirty) return;
    // React Router handles setting returnValue for us
    e.preventDefault();
  });

  // 2) Intercept internal link clicks
  useEffect(() => {
    if (!dirty) return;

    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      // ignore middle-click, modifiers, or external origins
      const me = e as MouseEvent;
      const modified = me.button !== 0 || me.metaKey || me.ctrlKey || me.shiftKey || me.altKey;
      if (modified) return;

      const url = new URL(anchor.href, window.location.href);
      const sameOrigin = url.origin === window.location.origin;

      if (!sameOrigin) return; // let the browser handle external nav

      if (!confirm("You have unsaved changes. Leave this page?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  // 3) Back/forward buttons
  useEffect(() => {
    if (!dirty) return;

    // push a state so the first Back triggers popstate
    history.pushState(null, "", window.location.href);

    const onPop = () => {
      if (!confirm("You have unsaved changes. Leave this page?")) {
        // user canceled: push state back so we're still on this page
        history.pushState(null, "", window.location.href);
      }
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [dirty]);
}
