import React from 'react';

type Props = {
  title?: string;
  initialValue?: string;
  open: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
};

export default function RenameDialog({
  title = 'Renommer',
  initialValue = '',
  open,
  onCancel,
  onSubmit,
}: Props) {
  const [value, setValue] = React.useState(initialValue);
  React.useEffect(() => setValue(initialValue), [initialValue, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="absolute left-1/2 top-24 w-full max-w-md -translate-x-1/2 rounded-2xl border border-black/10 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-lg font-semibold">{title}</div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:bg-neutral-800"
            placeholder="Nouveau titre"
          />
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            Annuler
          </button>
          <button
            type="submit"
            className="rounded-lg bg-black px-3 py-2 text-sm text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
          >
            Valider
          </button>
        </form>
      </div>
    </div>
  );
}
