import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import Analytics from '@/components/analytics';
import BottomNav from '@/components/BottomNav';
import Header from '@/components/Header';
import AppProviders from '@/layout/AppProviders';

type AppChrome = {
  showBottomNav: boolean;
};

function useExposeAppChromeHeights(showBottomNav: boolean): void {
  const { pathname } = useLocation();

  React.useEffect(() => {
    const root = document.documentElement;

    const setVars = () => {
      const headerEl = document.querySelector<HTMLElement>('[data-app-header]');
      const bottomNavEl = showBottomNav
        ? document.querySelector<HTMLElement>('[data-app-bottom-nav]')
        : null;
      const h = headerEl ? Math.round(headerEl.getBoundingClientRect().height) : 0;
      const bottom = bottomNavEl ? Math.round(bottomNavEl.getBoundingClientRect().height) : 0;

      root.style.setProperty('--app-header-h', `${h}px`);
      root.style.setProperty('--app-footer-h', '0px');
      root.style.setProperty('--footer-offset', '0px');
      root.style.setProperty('--app-bottom-nav-h', `${bottom}px`);
    };

    setVars();

    const ro = new ResizeObserver(() => setVars());
    const headerEl = document.querySelector<HTMLElement>('[data-app-header]');
    const bottomNavEl = showBottomNav
      ? document.querySelector<HTMLElement>('[data-app-bottom-nav]')
      : null;
    if (headerEl) ro.observe(headerEl);
    if (bottomNavEl) ro.observe(bottomNavEl);

    window.addEventListener('resize', setVars);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', setVars);
    };
  }, [pathname, showBottomNav]);
}

function useAppChrome(): AppChrome {
  const { pathname } = useLocation();

  return {
    showBottomNav:
      pathname === '/news' ||
      pathname === '/chat' ||
      pathname === '/account' ||
      pathname === '/settings' ||
      pathname === '/saved' ||
      pathname === '/news/saved',
  };
}

export default function AppLayout(): React.JSX.Element {
  const { pathname } = useLocation();
  const chrome = useAppChrome();

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useExposeAppChromeHeights(chrome.showBottomNav);

  return (
    <AppProviders>
      <div
        className="grid min-h-[100dvh] grid-rows-[auto_1fr] bg-[#FAFAF5] text-neutral-900 dark:bg-neutral-950 dark:text-white"
        data-app-shell
      >
        <Header
          data-app-header
          className="hidden md:block"
          mode="app"
          showPrimaryNav
          showDownload={false}
        />
        <Analytics />
        <main
          className="min-h-0"
          style={{
            paddingBottom: chrome.showBottomNav ? 'var(--app-bottom-nav-h, 0px)' : '0px',
          }}
        >
          <Outlet />
        </main>
        {chrome.showBottomNav && <BottomNav />}
      </div>
    </AppProviders>
  );
}
