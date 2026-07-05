// FrontEnd/src/hooks/useSavedArticles.ts
import React from 'react';
import { API_BASE } from '@/config/api';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useMe } from '@/contexts/MeContext';
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

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isNoSessionPayload(payload: unknown): boolean {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      (payload as { error?: unknown }).error === 'NO_SESSION',
  );
}

export function useSavedArticles() {
  const [ids, setIds] = React.useState<string[]>(() => readLS());
  const [loading, setLoading] = React.useState(false);
  const { requireAuth } = useAuthPrompt();
  const { me, loading: authLoading } = useMe();

  React.useEffect(() => {
    localStorage.removeItem(LS_KEY);

    let alive = true;

    if (authLoading) {
      return () => {
        alive = false;
      };
    }

    if (!me) {
      setIds([]);
      writeLS([]);
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    (async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/api/favorites/ids`, {
          credentials: 'include',
        });
        const payload = await readJson(response);

        if (response.status === 401 || isNoSessionPayload(payload)) {
          if (alive) {
            setIds([]);
            writeLS([]);
          }
          return;
        }

        if (response.ok && payload && typeof payload === 'object' && 'ids' in payload) {
          const server = Array.isArray((payload as { ids?: unknown }).ids)
            ? (payload as { ids: string[] }).ids
            : [];
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
  }, [authLoading, me?.id]);

  const isSaved = React.useCallback(
    (id: string) => ids.includes(id),
    [ids],
  );

  const toggle = React.useCallback(
    async (id: string) => {
      const saved = ids.includes(id);
      const next = saved ? ids.filter((x) => x !== id) : [...ids, id];

      setIds(next);
      writeLS(next);

      try {
        const url = `${API_BASE}/api/favorites/${encodeURIComponent(id)}`;
        const init: RequestInit = {
          method: saved ? 'DELETE' : 'POST',
        };

        const response = await fetch(url, await withCsrf(init));

        if (response.status === 401) {
          setIds(ids);
          writeLS(ids);
          requireAuth({
            message: 'You need to sign in to save articles.',
          });
          return;
        }

        if (!response.ok) throw new Error('Failed');
      } catch {
        setIds(ids);
        writeLS(ids);
      }
    },
    [ids, requireAuth],
  );

  return { ids, isSaved, toggle, loading };
}
