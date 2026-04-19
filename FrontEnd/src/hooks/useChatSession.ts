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

type StreamSourceLike = Record<string, any>;
type StreamEventLike = Record<string, any>;

function createSseJsonParser(onEvent: (event: StreamEventLike) => void) {
  let lineBuffer = '';
  let dataLines: string[] = [];

  const flushEvent = () => {
    if (dataLines.length === 0) {
      return;
    }

    const payload = dataLines.join('\n').trim();
    dataLines = [];

    if (!payload) {
      return;
    }

    try {
      onEvent(JSON.parse(payload));
    } catch {
      // Ignore malformed SSE payloads instead of corrupting the UI stream.
    }
  };

  return {
    push(chunk: string, finalize = false) {
      lineBuffer += chunk;

      while (true) {
        const newlineIndex = lineBuffer.indexOf('\n');
        if (newlineIndex === -1) {
          break;
        }

        let line = lineBuffer.slice(0, newlineIndex);
        lineBuffer = lineBuffer.slice(newlineIndex + 1);

        if (line.endsWith('\r')) {
          line = line.slice(0, -1);
        }

        if (line === '') {
          flushEvent();
          continue;
        }

        if (line.startsWith(':')) {
          continue;
        }

        if (line.startsWith('data:')) {
          let value = line.slice(5);
          if (value.startsWith(' ')) {
            value = value.slice(1);
          }
          dataLines.push(value);
        }
      }

      if (!finalize) {
        return;
      }

      if (lineBuffer.length > 0) {
        let line = lineBuffer;
        if (line.endsWith('\r')) {
          line = line.slice(0, -1);
        }
        if (line.startsWith('data:')) {
          let value = line.slice(5);
          if (value.startsWith(' ')) {
            value = value.slice(1);
          }
          dataLines.push(value);
        }
      }

      lineBuffer = '';
      flushEvent();
    },
  };
}

function resolveStreamSourceDomain(source: StreamSourceLike): string {
  if (typeof source?.domain === 'string' && source.domain.trim()) {
    return source.domain.trim();
  }

  if (typeof source?.url === 'string' && source.url.trim()) {
    try {
      return new URL(source.url).hostname.replace(/^www\./, '');
    } catch {
      return source.url;
    }
  }

  if (typeof source?.title === 'string' && source.title.trim()) {
    return source.title.trim();
  }

  if (typeof source?.name === 'string' && source.name.trim()) {
    return source.name.trim();
  }

  return 'Source inconnue';
}

function inferPendingSourceCategory(source: StreamSourceLike, domain: string): string {
  const normalizedDomain = domain.toLowerCase();
  const rawType = typeof source?.type === 'string'
    ? source.type
    : typeof source?.category === 'string'
      ? source.category
      : null;

  if (rawType) {
    return rawType;
  }

  if (
    source?.provider === 'rag' ||
    normalizedDomain === 'epion.io' ||
    normalizedDomain.endsWith('.epion.io') ||
    (typeof source?.url === 'string' && source.url.startsWith('/article/'))
  ) {
    return 'DATABASE';
  }

  if (normalizedDomain.endsWith('.gov') || normalizedDomain.endsWith('.gouv.fr')) {
    return 'GOVERNMENT';
  }

  if (normalizedDomain.endsWith('.edu') || normalizedDomain.includes('.ac.')) {
    return 'ACADEMIC';
  }

  return 'MEDIA';
}

function toPendingStreamSource(source: StreamSourceLike, index: number): StreamSourceLike {
  const domain = resolveStreamSourceDomain(source);
  const category = inferPendingSourceCategory(source, domain);
  const provider = source?.provider === 'rag' ? 'rag' : 'serper';

  return {
    id: typeof source?.id === 'number' ? source.id : index + 1,
    name: source?.title || source?.name || domain,
    domain,
    url: source?.url || '#',
    logo: source?.logo || source?.favicon || `https://www.google.com/s2/favicons?domain=${domain !== 'Source inconnue' ? domain : 'example.com'}&sz=64`,
    category,
    type: category,
    score: null,
    trustScore: null,
    dbScore: null,
    description: source?.description || (typeof source?.content === 'string' ? source.content.slice(0, 220) : null) || null,
    justification: source?.provider === 'rag'
      ? `Analyse en cours pour la source interne ${domain}.`
      : `Analyse en cours pour la source ${domain}.`,
    metadata: {
      provider,
      publishedDate: source?.publishedDate,
      searchScore: typeof source?.score === 'number' ? source.score : 0,
      dbScore: null,
      articleSlug: source?.articleSlug,
    },
    isEnriching: true,
  };
}

function getStreamSourceKey(source: StreamSourceLike): string | null {
  if (typeof source?.url === 'string' && source.url.trim()) {
    return `url:${source.url.trim()}`;
  }

  if (typeof source?.domain === 'string' && source.domain.trim()) {
    return `domain:${source.domain.trim().toLowerCase()}`;
  }

  if (typeof source?.id === 'number') {
    return `id:${source.id}`;
  }

  return null;
}

function mergeStreamSource(
  currentSources: StreamSourceLike[] | undefined,
  enrichedSource: StreamSourceLike,
): StreamSourceLike[] {
  const safeCurrentSources = Array.isArray(currentSources) ? currentSources : [];
  const enrichedKey = getStreamSourceKey(enrichedSource);
  let didReplace = false;

  const merged = safeCurrentSources.map((source) => {
    const sourceKey = getStreamSourceKey(source);
    const matchesByKey = enrichedKey !== null && sourceKey === enrichedKey;
    const matchesById =
      !matchesByKey &&
      typeof source?.id === 'number' &&
      typeof enrichedSource?.id === 'number' &&
      source.id === enrichedSource.id;

    if (!matchesByKey && !matchesById) {
      return source;
    }

    didReplace = true;

    return {
      ...source,
      ...enrichedSource,
      isEnriching: false,
    };
  });

  if (didReplace) {
    return merged;
  }

  return [
    ...merged,
    {
      ...enrichedSource,
      isEnriching: false,
    },
  ];
}

export function useChatSession(sessionId?: string) {
  const [sessions, setSessions] = React.useState<ChatSessionItem[]>([]);
  const [messages, setMessages] = React.useState<ChatMessageItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [thinking, setThinking] = React.useState(false);
  const [currentActions, setCurrentActions] = React.useState<string[]>([]);
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
      setCurrentActions([]);

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

        let rawAccumulator = '';
        let latestEnrichmentSources: any[] | undefined;
        let latestEnrichmentMean: number | undefined;
        let latestAction: string | null = null;

        const syncAssistantMessage = () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAiId ? {
                ...m,
                content: rawAccumulator,
                sources: latestEnrichmentSources ?? m.sources,
                metadata: {
                  ...m.metadata,
                  currentAction: latestAction || m.metadata?.currentAction,
                  ...(typeof latestEnrichmentMean === 'number'
                    ? { factScore: latestEnrichmentMean }
                    : {}),
                }
              } : m
            )
          );
        };

        const processStreamEvent = (ev: any) => {
          if (!ev || typeof ev !== 'object') {
            return;
          }

          if (ev.type === 'status') {
            latestAction = typeof ev.message === 'string' ? ev.message : latestAction;
            if (typeof ev.message === 'string' && ev.message) {
              setCurrentActions((prev) => prev.includes(ev.message) ? prev : [...prev, ev.message]);
            }
            return;
          }

          if (ev.type === 'sources_pending') {
            if (Array.isArray(ev.sources)) {
              latestEnrichmentSources = ev.sources.map((source, index) => toPendingStreamSource(source, index));
            }
            return;
          }

          if (ev.type === 'source_enriched') {
            if (ev.source) {
              latestEnrichmentSources = mergeStreamSource(latestEnrichmentSources, ev.source);
            }
            return;
          }

          if (ev.type === 'enrichment') {
            if (Array.isArray(ev.sources)) {
              latestEnrichmentSources = ev.sources.map((source: any) => ({
                ...source,
                isEnriching: false,
              }));
            }
            if (typeof ev.sourcesMean === 'number') {
              latestEnrichmentMean = ev.sourcesMean;
            }
            return;
          }

          if (ev.type === 'text') {
            rawAccumulator += ev.content || '';
          }
        };

        const sseParser = createSseJsonParser(processStreamEvent);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkText = decoder.decode(value, { stream: true });
          sseParser.push(chunkText);
          syncAssistantMessage();
        }

        sseParser.push('', true);

        if (latestEnrichmentSources || typeof latestEnrichmentMean === 'number') {
          syncAssistantMessage();
        }

        await Promise.allSettled([
          loadMessages(id),
          listSessions(),
        ]);


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
    currentActions,
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
