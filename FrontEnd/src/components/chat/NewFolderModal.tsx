import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createFolder } from '@/api/chatFolders';

type Props = {
  onClose: () => void;
  onCreated?: (folder: { id: string; name: string }) => void;
};

export default function NewFolderModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
   <input
    ref={inputRef}
    type="text"
    placeholder="Nom du dossier"
    value={name}
    onChange={e => setName(e.target.value)}
    className="w-full rounded-md border px-3 py-2 mb-3"
  />


  useEffect(() => {
    inputRef.current?.focus();
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  async function handleCreate() {
    if (!name.trim() || loading) return;
    setLoading(true);
    try {
      const folder = await createFolder(name.trim());
      onCreated?.(folder);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const overlay = (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/45 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[680px] max-w-[92vw] rounded-3xl border border-surface-200 bg-white/95 p-6 shadow-2xl backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 text-2xl font-semibold">Nouveau dossier</h2>

        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            placeholder="Nom du dossier"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="w-full rounded-2xl border border-surface-200 bg-white px-5 py-3.5 text-base outline-none dark:border-neutral-800 dark:bg-neutral-950"
          />

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-surface-200 px-5 py-3 text-base dark:border-neutral-800"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="rounded-xl bg-black px-6 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {loading ? '...' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );

  // ⬇️ rendu en dehors de la sidebar
  return createPortal(overlay, document.body);
}
