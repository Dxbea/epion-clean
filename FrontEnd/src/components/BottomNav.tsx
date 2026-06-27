import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Newspaper, Settings, UserCircle } from 'lucide-react';

import { useI18n } from '@/i18n/I18nContext';

const DRAG_THRESHOLD_PX = 10;

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
  const navigate = useNavigate();
  const { t } = useI18n();
  const { className = '', ...rest } = props;
  const trackRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    currentX: number;
    didDrag: boolean;
  } | null>(null);
  const suppressClickRef = React.useRef(false);
  const [dragPercent, setDragPercent] = React.useState<number | null>(null);
  const [pendingIndex, setPendingIndex] = React.useState<number | null>(null);

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

  const activeIndex = Math.max(0, items.findIndex((item) => item.isActive(pathname)));
  const itemWidthPercent = 100 / items.length;
  const activePercent = activeIndex * itemWidthPercent;
  const pendingPercent = pendingIndex !== null ? pendingIndex * itemWidthPercent : null;
  const indicatorPercent = dragPercent ?? pendingPercent ?? activePercent;

  React.useEffect(() => {
    if (pendingIndex === null) return;
    if (pendingIndex === activeIndex) setPendingIndex(null);
  }, [activeIndex, pendingIndex]);

  const getPercentFromClientX = React.useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return activePercent;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return activePercent;
    const raw = ((clientX - rect.left) / rect.width) * 100 - itemWidthPercent / 2;
    return Math.max(0, Math.min(100 - itemWidthPercent, raw));
  }, [activePercent, itemWidthPercent]);

  const getClosestIndex = React.useCallback((percent: number) => {
    return Math.max(
      0,
      Math.min(items.length - 1, Math.round(percent / itemWidthPercent)),
    );
  }, [itemWidthPercent, items.length]);

  const goToIndex = React.useCallback((index: number) => {
    const item = items[index];
    if (!item) return;
    setPendingIndex(index);
    navigate(item.to);
  }, [items, navigate]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      currentX: event.clientX,
      didDrag: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    drag.currentX = event.clientX;

    if (!drag.didDrag && Math.abs(deltaX) < DRAG_THRESHOLD_PX) return;

    if (!drag.didDrag) {
      drag.didDrag = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    event.preventDefault();
    setDragPercent(getPercentFromClientX(event.clientX));
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;

    if (!drag.didDrag) {
      setDragPercent(null);
      return;
    }

    const closestIndex = getClosestIndex(getPercentFromClientX(drag.currentX));
    setDragPercent(null);
    setPendingIndex(closestIndex);
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    navigate(items[closestIndex].to);
  };

  const cancelDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragPercent(null);
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  return (
    <nav
      {...rest}
      data-app-bottom-nav
      aria-label="App navigation"
      className={`fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pointer-events-none md:hidden ${className}`}
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div
        ref={trackRef}
        data-bottom-nav-track
        className="pointer-events-auto relative grid min-h-[64px] w-[min(92vw,26rem)] touch-pan-y select-none grid-cols-4 overflow-hidden rounded-full border border-black/10 bg-white/95 p-1 text-neutral-700 shadow-[0_12px_34px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/95 dark:text-neutral-300"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
        onClickCapture={handleClickCapture}
      >
        <span
          data-bottom-nav-indicator
          aria-hidden="true"
          className="absolute bottom-1 top-1 rounded-full bg-black/[0.06] transition-[left] duration-300 ease-out motion-reduce:transition-none dark:bg-white/[0.10]"
          style={{
            width: `calc(${itemWidthPercent}% - 0.5rem)`,
            left: `calc(${indicatorPercent}% + 0.25rem)`,
            transitionDuration: dragPercent === null ? undefined : '80ms',
          }}
        />
        {items.map((item, index) => {
          const active = item.isActive(pathname) || pendingIndex === index;
          const Icon = item.icon;

          return (
            <button
              key={item.to}
              type="button"
              aria-current={item.isActive(pathname) ? 'page' : undefined}
              aria-label={item.label}
              onClick={() => goToIndex(index)}
              className={`
                relative z-10 flex min-h-[52px] touch-manipulation flex-col items-center justify-center gap-1 rounded-full px-2 py-2 text-[11px]
                font-medium transition-colors
                ${active
                  ? 'text-neutral-950 dark:text-white'
                  : 'hover:bg-black/[0.04] hover:text-neutral-950 dark:hover:bg-white/[0.08] dark:hover:text-white'
                }
              `}
            >
              <Icon
                className={`h-5 w-5 ${active ? 'opacity-100' : 'opacity-70'}`}
                strokeWidth={active ? 2.4 : 2}
              />
              <span className="max-w-full truncate leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
