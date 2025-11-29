import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMe } from '@/contexts/MeContext';
import { useSavedArticles } from '@/hooks/useSavedArticles';

export default function HeaderUserMenu() {
  const [open, setOpen] = React.useState(false);
  const { me, logout } = useMe();
  const { ids: savedIds } = useSavedArticles();
  const navigate = useNavigate();

  const isGuest = !me;
  const displayName =
    me?.displayName ||
    (me?.email ? me.email.split('@')[0] : 'Guest');

  const statusBadge = isGuest ? 'Limited mode' : 'Full access';
  const emailLine = isGuest ? 'Not signed in' : me!.email;

  const initials = (
    (me?.displayName || me?.email || 'U').charAt(0) || 'U'
  ).toUpperCase();

  const savedCount = savedIds.length;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  function handlePrimaryClick() {
    if (isGuest) navigate('/settings#account');
    else navigate('/account');
    setOpen(false);
  }

  async function handleLogout() {
    await logout();
    navigate('/settings#account');
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Compact pill */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="
          inline-flex items-center gap-2
          rounded-xl border border-black/10 bg-white/70
          px-3 py-1 text-[13px] font-medium leading-none text-neutral-900
          hover:bg-white
          dark:border-white/10 dark:bg-neutral-900/80 dark:text-neutral-100
          dark:hover:bg-neutral-900
          transition
        "
      >
        {/* Mini avatar */}
        <span
          className="
            flex h-6 w-6 items-center justify-center rounded-full bg-black/90
            text-[11px] font-semibold text-white
            dark:bg-white dark:text-neutral-900
          "
        >
          {initials}
        </span>

        {/* Name + status inline */}
        <span className="flex flex-col leading-tight">
          <span className="text-[13px]">{displayName}</span>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {statusBadge}
          </span>
        </span>

        {/* Chevron */}
        <svg
          className="ml-1 h-4 w-4 opacity-70"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="
            absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-black/10
            bg-white p-3 shadow-xl
            dark:border-white/10 dark:bg-neutral-950
          "
        >
          <div className="flex items-start gap-3 pb-3 border-b border-black/5 dark:border-white/10">
            <div
              className="
                flex h-9 w-9 items-center justify-center rounded-full bg-black/90
                text-xs font-semibold text-white
                dark:bg-white dark:text-neutral-900
              "
            >
              {initials}
            </div>
            <div className="flex flex-col text-xs">
              <span className="font-semibold">{displayName}</span>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {emailLine}
              </span>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {statusBadge}
              </span>
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-1 text-sm">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5"
              onClick={handlePrimaryClick}
            >
              <span>
                {isGuest ? 'Sign in / Create account' : 'My account'}
              </span>
            </button>

            <Link
              to="/actuality/saved"            // <- au lieu de "/saved"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
            >
              <span>Saved</span>
              {savedCount > 0 && (              // optionnel : ne rien afficher si 0
                <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-[11px] dark:bg-white/10">
                  {savedCount}
                </span>
              )}
            </Link>


            <Link
              to="/settings"
              className="rounded-lg px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => setOpen(false)}
            >
              Settings
            </Link>

            {!isGuest && (
              <button
                type="button"
                onClick={handleLogout}
                className="mt-1 rounded-lg px-2 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
