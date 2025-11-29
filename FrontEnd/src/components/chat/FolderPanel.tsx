// FrontEnd/src/components/chat/FolderPanel.tsx
import React from 'react';
import { API_BASE } from '@/config/api';
import { FiArrowLeft, FiMessageSquare } from 'react-icons/fi';

type ChatListItem = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  folderId?: string | null;
};

type FolderPanelProps = {
  folderId: string;
  onOpenChat: (id: string) => void;
  onClose: () => void;
};

const FolderPanel: React.FC<FolderPanelProps> = ({ folderId, onOpenChat, onClose }) => {
  const [items, setItems] = React.useState<ChatListItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!folderId) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const url = `${API_BASE}/api/chat/sessions?folderId=${encodeURIComponent(folderId)}`;
        const res = await fetch(url, { credentials: 'include' });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }

        const data = (await res.json()) as { items: ChatListItem[] };
        if (cancelled) return;

        setItems(data.items ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Failed to load folder');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [folderId]);

  return (
    <div className="w-full rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          <FiArrowLeft />
          <span>Back</span>
        </button>
        <div className="text-sm font-semibold">Folder</div>
        <div className="w-10" />
      </div>

      {loading && (
        <div className="py-6 text-center text-sm text-black/60 dark:text-white/60">
          Loading chats…
        </div>
      )}

      {error && !loading && (
        <div className="py-6 text-center text-sm text-red-500">
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="py-6 text-center text-sm text-black/60 dark:text-white/60">
          This folder does not contain any chats yet.
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="space-y-1">
          {items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpenChat(c.id)}
                className="
                  flex w-full items-center gap-2 rounded-xl border border-black/5
                  px-3 py-2 text-left text-sm hover:bg-black/5
                  dark:border-white/10 dark:hover:bg-white/10
                "
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/5 dark:bg-white/15">
                  <FiMessageSquare />
                </span>
                <span className="flex-1 truncate text-xs font-medium">
                  {c.title || 'Sans titre'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FolderPanel;
