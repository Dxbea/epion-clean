// FrontEnd/src/hooks/useChatSession.ts
import * as React from 'react';
import { API_BASE } from '@/config/api';
import { withCsrf } from '@/lib/csrf';
import { useMe } from '@/contexts/MeContext';

export type Rigor = 'fast' | 'balanced' | 'precise';

export type ChatAttachmentMetadata = {
  kind: 'pdf' | 'image';
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
};

export type SendAttachment = {
  name: string;
  size: number;
  type: string;
  isImage: boolean;
  url: string;
  file: File;
};

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
  sources?: any[];
  metadata?: any;
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
  const { me } = useMe();

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
      listSessions().catch(() => { });
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
    async (
      id: string,
      content: string,
      attachments?: SendAttachment[],
      model?: string,
      mode?: Rigor,
      options?: {
        sourceRestricted?: boolean;
        neutralityForced?: boolean;
        timeRecent?: boolean;
        attachedContext?: any;
        responseStyle?: 'concise' | 'normal' | 'detailed';
      }
    ) => {
      setThinking(true);

      if (!me) {
        setThinking(false);
        // throw new Error("User not authenticated"); 
        // OR implicitly let backend handle it, but UI might crash if using 'me' ID.
        // The error "Cannot read properties of null (reading 'user')" likely comes from optimistic logic or backend response.
        // Let's ensure we don't proceed without 'me' if logic depends on it.
        // For now, let's just create a guard.
        return;
      }

      // 1. Optimistic Updates
      const tempUserId = me?.id || `guest-${Date.now()}`;
      const tempAiId = `temp-ai-${Date.now()}`;
      const now = new Date().toISOString();
      const optimisticAttachments: ChatAttachmentMetadata[] = (attachments || []).map((attachment) => ({
        kind: attachment.isImage ? 'image' : 'pdf',
        name: attachment.name,
        size: attachment.size,
        type: attachment.type,
        previewUrl: attachment.url,
      }));

      const userMsg: ChatMessageItem = {
        id: tempUserId,
        role: 'user',
        content,
        createdAt: now,
        metadata: optimisticAttachments.length > 0
          ? {
            attachments: optimisticAttachments,
          }
          : undefined,
      };

      const aiMsg: ChatMessageItem = {
        id: tempAiId,
        role: 'assistant',
        content: '',
        createdAt: now,
      };

      // Optimistic set
      setMessages((prev) => [...prev, userMsg, aiMsg]);

      // Optimize title logic
      const sess = sessions.find((s) => s.id === id);
      if (sess && (sess.title === 'New chat' || !sess.title?.trim())) {
        const optimistic = autoTitleFrom(content);
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, title: optimistic } : s)),
        );
      }

      try {
        const attachment = attachments?.[0];
        const hasAttachment = Boolean(attachment?.file);

        let init: RequestInit;
        if (hasAttachment && attachment) {
          const formData = new FormData();
          formData.append('content', content);
          if (model) formData.append('model', model);
          if (mode) formData.append('mode', mode);
          if (options?.sourceRestricted !== undefined) formData.append('sourceRestricted', String(options.sourceRestricted));
          if (options?.neutralityForced !== undefined) formData.append('neutralityForced', String(options.neutralityForced));
          if (options?.timeRecent !== undefined) formData.append('timeRecent', String(options.timeRecent));
          if (options?.responseStyle) formData.append('responseStyle', options.responseStyle);
          if (options?.attachedContext !== undefined) formData.append('attachedContext', JSON.stringify(options.attachedContext));
          formData.append('file', attachment.file, attachment.name);

          init = await withCsrf({
            method: 'POST',
            body: formData,
          });
        } else {
          init = await withCsrf({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, model, mode, ...options }),
          });
        }

        const res = await fetch(
          `${API_BASE}/api/chat/sessions/${id}/messages`,
          init,
        );

        if (!res.ok) {
          // Handle Errors (402, 403, 500)
          const text = await res.text();
          let data;
          try { data = JSON.parse(text); } catch { }
          const err: any = new Error(data?.message || text || `HTTP ${res.status}`);
          err.status = res.status;
          if (data?.error) err.code = data.error;

          // Rollback optimistic
          setMessages((prev) => prev.filter(m => m.id !== tempUserId && m.id !== tempAiId));
          throw err;
        }

        // 2. Stream Reading
        if (!res.body) throw new Error('No response body');
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');

        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;

          // Live Update UI
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAiId ? { ...m, content: accumulated } : m
            )
          );
        }

        // 3. Sync finished (Optional: Fetch real message to get ID and Metadata/Sources)
        // Since backend saves logic at the end, we can reload or just keep optimistic for now.
        // For better experience (citations), we should reload messages silently.
        loadMessages(id).catch(() => { });
        listSessions().catch(() => { });

        return; // No specific return needed anymore
      } catch (err) {
        // Rollback optimistic on network error if needed or let UI show error state
        // For now we assume User wants to see failed state or we allow retry?
        // Let's re-throw so UI can handle it
        throw err;
      } finally {
        setThinking(false);
      }
    },
    [sessions, listSessions, loadMessages],
  );

  React.useEffect(() => {
    listSessions().catch(() => { });
  }, [listSessions]);

  React.useEffect(() => {
    if (!sessionId) return;
    loadMessages(sessionId).catch(() => { });
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
