// FrontEnd/src/hooks/useChatSession.ts
import * as React from 'react';
import { API_BASE } from '@/config/api';
import { withCsrf } from '@/lib/csrf';

export type Rigor = 'fast' | 'balanced' | 'precise';

export type ChatSessionItem = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessageItem = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type ChatSessionDetail = ChatSessionItem & {
  mode: Rigor;
  folderId: string | null;
};

type SessionsResponse = { items: ChatSessionItem[]; nextCursor: string | null };
type MessagesResponse = { items: ChatMessageItem[]; nextCursor: string | null };

async function json<T>(res: Response): Promise<T> {
  let text = '';
  let data: any = null;

  try {
    text = await res.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err: any = new Error(
      data?.message || text || `HTTP ${res.status}`,
    );
    err.status = res.status;

    // codes d’erreur renvoyés par le back: message_too_long, message_limit_reached, etc.
    if (data?.error) {
      err.code = data.error;
    }

    // compat avec l’ancien comportement
    if (res.status === 401 && !err.code) {
      err.code = 'UNAUTHENTICATED';
    }

    throw err;
  }

  // OK
  return data as T;
}

function autoTitleFrom(text: string) {
  const t = text.trim().replace(/\s+/g, ' ');
  return (t.slice(0, 40) + (t.length > 40 ? '…' : '')) || 'New chat';
}

export function useChatSession(sessionId?: string) {
  const [sessions, setSessions] = React.useState<ChatSessionItem[]>([]);
  const [messages, setMessages] = React.useState<ChatMessageItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [thinking, setThinking] = React.useState(false);

  // ------ Sessions

  const listSessions = React.useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/chat/sessions?take=50`, {
      credentials: 'include',
    });
    const data = await json<SessionsResponse>(res);
    setSessions(data.items);
    return data.items;
  }, []);

  const createSession = React.useCallback(
    async (title?: string, mode: Rigor = 'balanced') => {
      const init = await withCsrf({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(title ? { title, mode } : { mode }),
      });

      const res = await fetch(`${API_BASE}/api/chat/sessions`, init);
      const s = await json<{
        id: string;
        title: string;
        createdAt: string;
        updatedAt: string;
      }>(res);

      setSessions((prev) => [
        {
          id: s.id,
          title: s.title,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        },
        ...prev,
      ]);

      return s.id;
    },
    [],
  );

  // PATCH /api/chat/sessions/:id
  const renameSession = React.useCallback(async (id: string, title: string) => {
    const init = await withCsrf({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });

    const res = await fetch(`${API_BASE}/api/chat/sessions/${id}`, init);
    const s = await json<{ id: string; title: string; updatedAt: string }>(res);

    setSessions((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, title: s.title, updatedAt: s.updatedAt } : it,
      ),
    );
  }, []);

  const setSessionMode = React.useCallback(
    async (id: string, mode: Rigor) => {
      const init = await withCsrf({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });

      await fetch(`${API_BASE}/api/chat/sessions/${id}`, init).then(json);
      // petit refresh pour refléter updatedAt etc.
      listSessions().catch(() => {});
    },
    [listSessions],
  );

  const deleteSession = React.useCallback(async (id: string) => {
    const init = await withCsrf({
      method: 'DELETE',
    });

    const res = await fetch(`${API_BASE}/api/chat/sessions/${id}`, init);

    // 204 → OK, 404 → déjà supprimé / pas trouvé (on ne hurle pas côté front)
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      const text = await res.text().catch(() => '');
      const err: any = new Error(text || 'Delete failed');
      err.status = res.status;
      throw err;
    }

    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const getSession = React.useCallback(
    async (id: string): Promise<ChatSessionDetail> => {
      const res = await fetch(`${API_BASE}/api/chat/sessions/${id}`, {
        credentials: 'include',
      });
      const s = await json<{
        id: string;
        title: string;
        mode: Rigor;
        folderId: string | null;
        createdAt: string;
        updatedAt: string;
      }>(res);

      // On garde la liste locale à jour (titre + dates)
      setSessions((prev) => {
        const base: ChatSessionItem = {
          id: s.id,
          title: s.title,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        };
        const exists = prev.some((it) => it.id === s.id);
        return exists
          ? prev.map((it) => (it.id === s.id ? base : it))
          : [base, ...prev];
      });

      return {
        id: s.id,
        title: s.title,
        mode: s.mode,
        folderId: s.folderId,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    },
    [],
  );

  // ------ Messages

  const loadMessages = React.useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/chat/sessions/${id}/messages?take=100`,
        { credentials: 'include' },
      );
      const data = await json<MessagesResponse>(res);
      setMessages(data.items);
      return data.items;
    } finally {
      setLoading(false);
    }
  }, []);

  const sendMessage = React.useCallback(
    async (id: string, content: string) => {
      setThinking(true);

      // auto-titre optimiste si la session est encore "New chat"
      const sess = sessions.find((s) => s.id === id);
      if (sess && (sess.title === 'New chat' || !sess.title?.trim())) {
        const optimistic = autoTitleFrom(content);
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, title: optimistic } : s)),
        );
      }

      try {
        const init = await withCsrf({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });

        const res = await fetch(
          `${API_BASE}/api/chat/sessions/${id}/messages`,
          init,
        );
        const data = await json<{
          user: ChatMessageItem;
          answer: ChatMessageItem;
        }>(res);

        setMessages((prev) => [...prev, data.user, data.answer]);

        // resynchronise la liste (titre final + updatedAt)
        listSessions().catch(() => {});
        return data;
      } finally {
        setThinking(false);
      }
    },
    [sessions, listSessions],
  );

  React.useEffect(() => {
    listSessions().catch(() => {});
  }, [listSessions]);

  React.useEffect(() => {
    if (!sessionId) return;
    loadMessages(sessionId).catch(() => {});
  }, [sessionId, loadMessages]);

  return {
    sessions,
    messages,
    loading,
    thinking,
    listSessions,
    loadMessages,
    createSession,
    renameSession,
    deleteSession,
    sendMessage,
    setSessionMode,
    getSession,
  };
}
