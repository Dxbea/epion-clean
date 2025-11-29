import * as React from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';

type Options = { message?: string };

/**
 * Bloque la navigation interne quand `when === true`.
 * - Utilise navigator.block si dispo;
 * - Fallback robuste: intercepte clics <a>, popstate (back/forward) et beforeunload.
 */
export function useBlocker(when: boolean, opts: Options = {}) {
  const { message = 'You have unsaved changes. Leave this page?' } = opts;
  const { navigator } = React.useContext(UNSAFE_NavigationContext);

  React.useEffect(() => {
    if (!when) return;

    // 1) Routeur moderne
    const nav: any = navigator as any;
    if (nav && typeof nav.block === 'function') {
      const unblock = nav.block((tx: any) => {
        const ok = window.confirm(message);
        if (ok) {
          unblock();
          tx.retry();
        }
      });
      return unblock;
    }

    // 2) Fallback
    const currentURL = new URL(window.location.href);

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    const onClickCapture = (evt: MouseEvent) => {
      const el = evt.target as Element | null;
      const a = el?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;

      const url = new URL(a.href, window.location.href);
      // liens externes ou nouvel onglet : ignorer
      if (url.origin !== window.location.origin) return;
      if (a.target === '_blank' || evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;

      const ok = window.confirm(message);
      if (!ok) evt.preventDefault();
    };

    // Bloque back/forward: si refus, on "revient" immédiatement au même URL
    const onPopState = () => {
      const ok = window.confirm(message);
      if (!ok) {
        // restore l’URL actuelle sans recharger
        history.pushState(null, '', currentURL.href);
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClickCapture, true);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, [when, navigator, message]);
}
