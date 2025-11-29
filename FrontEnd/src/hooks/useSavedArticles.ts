// FrontEnd/src/hooks/useSavedArticles.ts
import React from 'react';
import { API_BASE } from '@/config/api';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { withCsrf } from '@/lib/csrf';

const LS_KEY = 'saved_article_ids';

function readLS(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]') || [];
  } catch {
    return [];
  }
}
function writeLS(ids: string[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ids));
  } catch {}
}

export function useSavedArticles() {
  const [ids, setIds] = React.useState<string[]>(() => readLS());
  const [loading, setLoading] = React.useState(false);
  const { requireAuth } = useAuthPrompt();

  // hydrate depuis l’API au mount
  React.useEffect(() => {
    // purge une fois les vieux IDs qui venaient du mode démo
    localStorage.removeItem('saved_article_ids');
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API_BASE}/api/favorites/ids`, {
          credentials: 'include',
        });

        if (r.status === 401) {
          // invité : pas d’IDs serveur, on garde juste le local (vide)
          if (alive) {
            setIds([]);
            writeLS([]);
          }
          return;
        }

        if (r.ok) {
          const j = await r.json();
          const server = Array.isArray(j.ids) ? j.ids : [];
          if (alive) {
            setIds(server);
            writeLS(server);
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const isSaved = React.useCallback(
    (id: string) => ids.includes(id),
    [ids],
  );

  const toggle = React.useCallback(
    async (id: string) => {
      const saved = ids.includes(id);
      const next = saved ? ids.filter((x) => x !== id) : [...ids, id];

      // optimistic
      setIds(next);
      writeLS(next);

      try {
        const url = `${API_BASE}/api/favorites/${encodeURIComponent(id)}`;
        const init: RequestInit = {
          method: saved ? 'DELETE' : 'POST',
        };

        const r = await fetch(url, await withCsrf(init));

        if (r.status === 401) {
          // rollback + popup
          setIds(ids);
          writeLS(ids);
          requireAuth({
            message: 'You need to sign in to save articles.',
          });
          return;
        }

        if (!r.ok) throw new Error('Failed');
      } catch {
        // rollback en cas d’échec
        setIds(ids);
        writeLS(ids);
      }
    },
    [ids, requireAuth],
  );

  return { ids, isSaved, toggle, loading };
}
