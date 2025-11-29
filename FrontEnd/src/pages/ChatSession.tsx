// src/pages/ChatSession.tsx
// DEBUT BLOC
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatInput from '@/components/chat/ChatInput';
import ChatMessage from '@/components/chat/ChatMessage';
import { type Rigor } from '@/utils/rigorLevels';
import { useChatSession } from '@/hooks/useChatSession';
import FolderPanel from '@/components/chat/FolderPanel';
import { createPortal } from 'react-dom';
import { useMe } from '@/contexts/MeContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';

export type UploadedFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  isImage: boolean;
};

export default function ChatSession() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();

  const isGuestSession = id === 'guest';         // <-- AJOUT

  const { me } = useMe();
  const { requireAuth } = useAuthPrompt();
  

  // Hook connecté à l'API
  const {
    sessions,
    messages,
    loading,
    thinking,
    createSession,
    deleteSession,
    sendMessage,
    setSessionMode,
    getSession,
  } = useChatSession(id);

  const [rigor, setRigor] = React.useState<Rigor>('balanced');
  const [collapsed, setCollapsed] = React.useState(false);
  const [hideAppHeader, setHideAppHeader] = React.useState<boolean>(false);
  const [hideAppFooter, setHideAppFooter] = React.useState<boolean>(false);
  const [activeFolderId, setActiveFolderId] = React.useState<string | null>(null);
  const [rigorLoaded, setRigorLoaded] = React.useState(false);
    // Cacher le footer automatiquement à l'arrivée sur la page chat
  React.useEffect(() => {
    setHideAppFooter(true);
  }, []);


  // Toasts locaux pour les erreurs
  type Toast = { id: number; text: string };
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const pushToast = React.useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const openChat = React.useCallback(
    (cid: string) => {
      setActiveFolderId(null);
      nav(`/chat/${cid}`);
    },
    [nav],
  );

  // overlays
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [folderOpen, setFolderOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [folders, setFolders] = React.useState<string[]>([]);
  const [renamedMap, setRenamedMap] = React.useState<Record<string, string>>({});

  const filteredConvos = React.useMemo(
    () =>
      sessions.filter((c) =>
        (c.title || 'Sans titre').toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [sessions, searchQuery],
  );

  // IMPORTANT : plus de création auto ici, c'est géré par /chat.

  // appliquer classes <body> pour le layout local
  React.useEffect(() => {
    document.body.classList.toggle('chat-hide-app-header', hideAppHeader);
    document.body.classList.toggle('chat-hide-app-footer', hideAppFooter);
  }, [hideAppHeader, hideAppFooter]);

  const onNewChat = async () => {
    try {
      const newId = await createSession(undefined, rigor);
      setActiveFolderId(null);
      nav(`/chat/${newId}`);
    } catch (err: any) {
      console.error('createSession error', err);
      const msg =
        err?.code === 'UNAUTHENTICATED'
          ? 'Tu dois te reconnecter pour utiliser le chat.'
          : err?.message === 'Failed to fetch'
          ? 'Serveur Epion indisponible. Vérifie que le back-end tourne bien puis réessaie.'
          : 'Impossible de créer un nouveau chat pour le moment.';
      pushToast(msg);
    }
  };

  const onSelect = (cid: string) => nav(`/chat/${cid}`);

  const onDelete = async (cid: string) => {
    if (!confirm('Supprimer cette conversation ?')) return;

    try {
      await deleteSession(cid);

      if (cid === id) {
        await onNewChat();
      }
    } catch (err: any) {
      console.error('deleteSession error', err);

      if (err?.code === 'UNAUTHENTICATED') {
        pushToast('Tu dois te reconnecter pour gérer tes conversations.');
        return;
      }

      const msg = typeof err?.message === 'string' ? err.message : '';

      if (msg === 'Failed to fetch') {
        pushToast('Serveur Epion indisponible. Vérifie que le back-end tourne bien puis réessaie.');
      } else {
        pushToast('Impossible de supprimer cette conversation pour le moment.');
      }
    }
  };

  // ===== Scroll / auto-scroll =====
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const div = listRef.current;
    const page =
      document.scrollingElement || document.documentElement || document.body;

    const target =
      div && div.scrollHeight > div.clientHeight + 1 ? div : page;

    const idRaf = window.requestAnimationFrame(() => {
      target.scrollTo({
        top: target.scrollHeight,
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(idRaf);
  }, [messages.length, thinking]);

  // ENVOI DU MESSAGE : garde d’auth + cas guest
      const handleSend = async (text: string) => {
    if (!id) return;

    const isGuestSession = id === 'guest';

    // 1) invité (aucun compte)
    if (!me) {
      requireAuth({
        title: 'Sign in required',
        message: 'You need an account to use the chat.',
        primaryLabel: 'Sign in',
        redirectTo: '/settings#account',
      });
      return;
    }

    // 2) connecté mais email non vérifié
    if (!me.emailVerifiedAt) {
      requireAuth({
        title: 'Verify your email',
        message:
          'You need to verify your email address before using the chat. Go to Settings → Account to resend the verification link.',
        primaryLabel: 'Go to account',
        redirectTo: '/settings#account',
      });
      return;
    }

    // 3) connecté + vérifié mais URL = /chat/guest → on bascule sur une vraie session
    if (isGuestSession) {
      try {
        const newId = await createSession(undefined, rigor);
        nav(`/chat/${newId}`, { replace: true });
      } catch (err: any) {
        console.error('createSession error (from guest)', err);
        const msg =
          err?.message === 'Failed to fetch'
            ? 'Serveur Epion indisponible. Vérifie que le back-end tourne bien puis réessaie.'
            : 'Impossible de créer une conversation pour le moment.';
        pushToast(msg);
      }
      return;
    }

    // 4) cas normal : session existante + user vérifié
    try {
      await sendMessage(id, text);
    } catch (err: any) {
      console.error('sendMessage error', err);

      if (err?.code === 'UNAUTHENTICATED') {
        requireAuth({
          title: 'Sign in required',
          message: 'Your session has expired. Please sign in again to continue.',
          primaryLabel: 'Sign in',
          redirectTo: '/settings#account',
        });
        return;
      }

      const msg = typeof err?.message === 'string' ? err.message : '';

      if (msg === 'Failed to fetch') {
        pushToast(
          'Serveur Epion indisponible. Vérifie que le back-end tourne bien puis réessaie.',
        );
      } else {
        pushToast(msg || "Impossible d’envoyer le message pour le moment.");
      }
    }
  };



  // Charge le mode stocké en DB quand on ouvre une session (sauf "guest")
  React.useEffect(() => {
    if (!id || isGuestSession) return;

    setRigorLoaded(false);

    getSession(id)
      .then((s) => {
        if (s.mode) {
          setRigor(s.mode);
        }
      })
      .catch((err: any) => {
        if (err?.status === 404 || err?.status === 403) {
          // id invalide → retour vers /chat qui gère la suite
          nav('/chat', { replace: true });
          return;
        }
        console.error('getSession error', err);
      })
      .finally(() => {
        setRigorLoaded(true);
      });
  }, [id, isGuestSession, getSession, nav]);

  // Sync du mode vers le backend (sauf "guest")
  React.useEffect(() => {
    if (!id || isGuestSession || !rigorLoaded) return;
    setSessionMode(id, rigor).catch(() => {});
  }, [id, isGuestSession, rigor, rigorLoaded, setSessionMode]);

  const empty = !messages.length;

  return (
    <div
      className="w-full"
      style={{ minHeight: 'calc(100dvh - var(--app-header-h,64px))' }}
    >
      <div
        className={`grid isolate h-full min-h-0 bg-[#FAFAF5] text-neutral-900 dark:bg-neutral-950 dark:text-white ${
          collapsed ? 'grid-cols-[3.5rem_1fr]' : 'grid-cols-[15rem_1fr]'
        }`}
      >
        {/* Sidebar */}
        <ChatSidebar
          open
          collapsed={collapsed}
          onCollapseToggle={() => setCollapsed((c) => !c)}
          onClose={() => setCollapsed(true)}
          conversations={sessions.map((s) => ({
            id: s.id,
            title: renamedMap[s.id] ?? (s.title || 'Sans titre'),
          }))}
          currentId={id}
          onSelect={openChat}
          onNewChat={onNewChat}
          onDelete={onDelete}
          onSearch={() => setSearchOpen(true)}
          onCreateFolder={() => setFolderOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenFolder={(fid) => setActiveFolderId(fid)}
          onRename={(cid, title) =>
            setRenamedMap((m) => ({
              ...m,
              [cid]: title,
            }))
          }
        />

        {/* Colonne contenu */}
        <section className="flex min-w-0 flex-col">
          {/* Messages */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto"
            style={{ paddingBottom: '160px' }}
          >
            <div
              className={`mx-auto w-full max-w-3xl px-4 py-8 ${
                empty && !activeFolderId ? 'flex h-full items-center justify-center' : ''
              }`}
            >
              {activeFolderId ? (
                <FolderPanel
                  folderId={activeFolderId}
                  onOpenChat={(chatId) => {
                    setActiveFolderId(null);
                    onSelect(chatId);
                  }}
                  onClose={() => setActiveFolderId(null)}
                />
              ) : empty ? (
                <div className="select-none text-center">
                  <h1 className="font-[thermal-variable] text-3xl md:text-4xl [font-variation-settings:'opsz'_100,'wght'_600]">
                    Learn with epion
                  </h1>
                  <p className="mt-2 text-black/70 dark:text-white/70">
                    Ask for facts, summaries, or explanations. Epion will answer with sources soon.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => (
                    <ChatMessage
                      key={m.id}
                      message={{
                        id: m.id,
                        role: m.role,
                        content: m.content,
                        createdAt: new Date(m.createdAt).getTime(),
                      }}
                    />
                  ))}

                  {(thinking || loading) && (
                    <div className="mt-2 text-center text-sm text-black/60 dark:text-white/60">
                      L&apos;IA réfléchit…
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          <div
            className="sticky bottom-0 z-10 border-black/10 bg-[#FAFAF5]/90 backdrop-blur dark:border-white/10 dark:bg-neutral-950/90"
            style={{ ['--chat-input-h' as any]: '120px' }}
          >
            <div className="mx-auto w-full max-w-3xl px-4 py-3">
              <ChatInput
                rigor={rigor}
                setRigor={setRigor}
                onSend={(t) => handleSend(t)}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Overlays search / folder / settings */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="absolute left-1/2 top-24 w-full max-w-xl -translate-x-1/2 rounded-2xl border border-black/10 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-lg font-semibold">Rechercher un chat</div>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tape un titre…"
              className="w-full rounded-xl border border-black/10 bg:white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:bg-neutral-800"
            />
            <div className="mt-3 max-h-72 overflow-y-auto divide-y divide-black/5 dark:divide-white/5">
              {filteredConvos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    openChat(c.id);
                    setSearchOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-2 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <span className="truncate">{c.title || 'Sans titre'}</span>
                  <span className="text-xs text-black/50 dark:text-white/50">Ouvrir</span>
                </button>
              ))}
              {filteredConvos.length === 0 && (
                <div className="px-2 py-6 text-center text-sm text-black/60 dark:text-white/60">
                  Aucun résultat.
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setSearchOpen(false)}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg:white/10"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {folderOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => setFolderOpen(false)}
        >
          <div
            className="absolute left-1/2 top-28 w-full max-w-md -translate-x-1/2 rounded-2xl border border-black/10 bg:white p-4 shadow-2xl dark:border-white/10 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-lg font-semibold">Nouveau dossier</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem('name') as HTMLInputElement;
                if (!input?.value.trim()) return;
                setFolders((f) => [...f, input.value.trim()]);
                setFolderOpen(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                name="name"
                placeholder="Nom du dossier"
                className="flex-1 rounded-xl border border-black/10 bg:white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:bg-neutral-800"
              />
              <button
                type="button"
                onClick={() => setFolderOpen(false)}
                className="rounded-lg border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg:white/10"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-lg bg:black px-3 py-2 text-sm text:white hover:bg-black/90 dark:bg:white dark:text-black dark:hover:bg:white/90"
              >
                Créer
              </button>
            </form>
            {folders.length > 0 && (
              <div className="mt-4 text-xs text-black/60 dark:text:white/60">
                Dossiers créés : {folders.join(' • ')}
              </div>
            )}
          </div>
        </div>
      )}

      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="absolute left-1/2 top-24 w-full max-w-md -translate-x-1/2 rounded-2xl border border-black/10 bg:white p-4 shadow-2xl dark:border-white/10 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-lg font-semibold">Paramètres</div>
            <label className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-black/5 dark:hover:bg:white/10">
              <span>Hide app header</span>
              <input
                type="checkbox"
                checked={hideAppHeader}
                onChange={(e) => setHideAppHeader(e.target.checked)}
              />
            </label>
            <label className="mt-1 flex items-center justify-between rounded-lg px-3 py-2 hover:bg-black/5 dark:hover:bg:white/10">
              <span>Hide footer</span>
              <input
                type="checkbox"
                checked={hideAppFooter}
                onChange={(e) => setHideAppFooter(e.target.checked)}
              />
            </label>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-sm hover:bg:black/5 dark:border-white/10 dark:hover:bg:white/10"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts d’erreur pour le chat */}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[9999] space-y-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="rounded-lg border border-surface-200 bg:white/95 px-3 py-2 text-sm shadow-lg backdrop-blur
                         dark:border-neutral-800 dark:bg-neutral-900"
            >
              {t.text}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
// FIN BLOC
