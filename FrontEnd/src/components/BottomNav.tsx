import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MessageCircle, Newspaper, Settings, UserCircle } from 'lucide-react';

import { useI18n } from '@/i18n/I18nContext';

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  isActive: (pathname: string) => boolean;
};

export default function BottomNav(
  props: React.HTMLAttributes<HTMLElement>
): React.JSX.Element {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const { className = '', ...rest } = props;

  const items: NavItem[] = [
    {
      to: '/news',
      label: t('nav_news') || 'News',
      icon: Newspaper,
      isActive: (path) =>
        path === '/saved' ||
        path.startsWith('/news') ||
        path.startsWith('/article') ||
        path.startsWith('/create'),
    },
    {
      to: '/chat',
      label: t('nav_chat') || 'Chat',
      icon: MessageCircle,
      isActive: (path) => path.startsWith('/chat'),
    },
    {
      to: '/account',
      label: t('account') || 'Account',
      icon: UserCircle,
      isActive: (path) =>
        path.startsWith('/account') ||
        path.startsWith('/activity') ||
        path.startsWith('/u/'),
    },
    {
      to: '/settings',
      label: t('menu_settings') || t('settings_title') || 'Settings',
      icon: Settings,
      isActive: (path) =>
        path.startsWith('/settings') ||
        path.startsWith('/reset-password') ||
        path.startsWith('/verify-email'),
    },
  ];

  return (
    <nav
      {...rest}
      data-app-bottom-nav
      aria-label="App navigation"
      className={`fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pointer-events-none md:hidden ${className}`}
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto grid min-h-[64px] w-[min(92vw,26rem)] grid-cols-4 rounded-full border border-black/10 bg-white/95 p-1 text-neutral-700 shadow-[0_12px_34px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/95 dark:text-neutral-300">
        {items.map((item) => {
          const active = item.isActive(pathname);
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={`
                flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-full px-2 py-2 text-[11px]
                font-medium transition-colors
                ${active
                  ? 'bg-black/[0.06] text-neutral-950 dark:bg-white/[0.10] dark:text-white'
                  : 'hover:bg-black/[0.04] hover:text-neutral-950 dark:hover:bg-white/[0.08] dark:hover:text-white'
                }
              `}
            >
              <Icon
                className={`h-5 w-5 ${active ? 'opacity-100' : 'opacity-70'}`}
                strokeWidth={active ? 2.4 : 2}
              />
              <span className="max-w-full truncate leading-none">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

