import React from 'react';
import { useLayoutUI } from '@/hooks/layoutUI';
import { FiSliders } from 'react-icons/fi';

type Props = { title?: string };

export default function ChatHeader({ title = 'Epion Chat' }: Props) {
  const {
    appHeaderVisible,
    footerVisible,
    setAppHeaderVisible,
    setFooterVisible,
  } = useLayoutUI();
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-10 border-b border-black/10 bg-[#FAFAF5]/80 backdrop-blur dark:border-white/10 dark:bg-neutral-950/80">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <div className="font-[thermal-variable] [font-variation-settings:'opsz'_100,'wght'_600]">
          {title}
        </div>

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/10 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            <FiSliders className="opacity-70" />
            Layout
          </button>

          {open && (
            <div
              className="absolute right-0 mt-2 w-56 rounded-xl border border-black/10 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-neutral-900"
              onMouseLeave={() => setOpen(false)}
            >
              <label className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 hover:bg-black/5 dark:hover:bg:white/10">
                <span>Hide app header</span>
                <input
                  type="checkbox"
                  checked={!appHeaderVisible}
                  onChange={(e) => setAppHeaderVisible(!e.target.checked)}
                />
              </label>
              <label className="mt-1 flex cursor-pointer items-center justify-between rounded-md px-3 py-2 hover:bg-black/5 dark:hover:bg:white/10">
                <span>Hide footer</span>
                <input
                  type="checkbox"
                  checked={!footerVisible}
                  onChange={(e) => setFooterVisible(!e.target.checked)}
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
