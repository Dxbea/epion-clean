// src/components/chat/ChatSidebar.tsx
import React from 'react';
import { createPortal } from 'react-dom';
import { fetchFolders, deleteFolder, renameFolder } from '@/api/chatFolders';
import NewFolderModal from './NewFolderModal';
import {
  FiChevronLeft, FiChevronRight, FiPlus, FiSearch,
  FiFolderPlus, FiSettings, FiTrash2, FiHome, FiGrid, FiSliders,
  FiChevronRight as Chevron, FiFolder, FiMoreHorizontal
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import RenameDialog from '@/components/chat/RenameDialog';
import { API_BASE } from '@/config/api';


/* ========================= Types ========================= */
type Conversation = { id: string; title: string };

type Props = {
  open: boolean;
  collapsed: boolean;
  onCollapseToggle: () => void;
  onClose: () => void;
  conversations: Conversation[];
  currentId?: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onRename?: (id: string, title: string) => void;
  onSearch: () => void;
  onCreateFolder: () => void;
  onOpenSettings?: () => void;
  onOpenFolder?: (id: string) => void;
};
// === Helpers API sessions (dossiers) ========================

type FolderSessionItem = { id: string; title: string };

/**
 * Liste les sessions dans un dossier donné.
 * Utilise GET /api/chat/sessions?folderId=...&take=50
 */
async function listSessionsByFolder(folderId: string): Promise<FolderSessionItem[]> {
  const params = new URLSearchParams({
    folderId,
    take: '50',
  });

  const res = await fetch(`${API_BASE}/api/chat/sessions?${params.toString()}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Failed to list sessions by folder');
  }

  const data = (await res.json()) as {
    items: { id: string; title?: string | null }[];
  };

  return data.items.map((i) => ({
    id: i.id,
    title: i.title ?? 'New chat',
  }));
}

/**
 * Déplace une session vers un dossier (ou la retire du dossier).
 * Utilise PATCH /api/chat/sessions/:id { folderId }
 */
async function moveSessionToFolder(sessionId: string, folderId: string | null): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Failed to move session to folder');
  }
}

/**
 * Renomme une session (titre).
 * Utilise PATCH /api/chat/sessions/:id { title }
 */
async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Failed to rename session');
  }
}


function IconBtn({
  children, onClick, title, size = 'md',
}: { children: React.ReactNode; onClick?: () => void; title?: string; size?: 'sm'|'md' }) {
  const cls = size === 'sm' ? 'h-9 w-9 rounded-md' : 'h-10 w-10 rounded-md';
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center border border-surface-200 bg-white/80 hover:bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/70 dark:hover:bg-neutral-900 ${cls}`}
    >{children}</button>
  );
}

function PrimaryAction({
  onClick, icon, label,
}: { onClick?: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg border border-surface-200 bg-white/80 px-3 py-2 text-left text-sm font-medium text-black hover:bg-black/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:border-neutral-800 dark:bg-neutral-900/70 dark:text-white dark:hover:bg-white/10"
    >
      <span className="opacity-80">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function SecondaryAction({ onClick, icon, label }: { onClick?: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md border border-surface-200 px-3 py-2 text-left text-[13px] hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:border-neutral-800 dark:hover:bg-white/10"
    >
      <span className="opacity-80">{icon}</span><span>{label}</span>
    </button>
  );
}

/* -------- menu ancré utilitaire -------- */
function useSmartMenuPosition(
  anchor: HTMLElement | null,
  menuRef: React.RefObject<HTMLDivElement>,
  width = 300
) {
  const [style, setStyle] = React.useState<React.CSSProperties>({
    position: 'fixed',
    zIndex: 110,
    left: 0,
    top: 0,
    width,
  });

  const place = React.useCallback(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 10;

    const menuH = menuRef.current?.offsetHeight ?? 0;

    let left = Math.min(Math.max(8, r.left), vw - width - 8);
    let top = r.bottom + gap;

    if (menuH && top + menuH > vh - 8) {
      top = Math.max(8, r.top - menuH - gap);
    }

    setStyle({ position: 'fixed', zIndex: 110, left, top, width });
  }, [anchor, menuRef, width]);

  React.useLayoutEffect(place, [place]);
  React.useEffect(() => {
    const handler = () => place();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [place]);

  return style;
}

function RowMenu({
  anchorEl, onClose, children,
}: { anchorEl: HTMLElement | null; onClose: () => void; children: React.ReactNode }) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const style = useSmartMenuPosition(anchorEl, menuRef);

  React.useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (anchorEl?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('mousedown', fn);
    return () => window.removeEventListener('mousedown', fn);
  }, [anchorEl, onClose]);

  if (!anchorEl) return null;

  const node = (
    <div
      ref={menuRef}
      style={style}
      className="z-[130] rounded-lg border border-surface-200 bg-white/95 p-1 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900"
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {children}
    </div>
  );

  return createPortal(node, document.body);
}

function MoveMenu({
  anchorEl,
  folders,
  currentFolderId,
  onMoveTo,
  onClose,
}: {
  anchorEl: HTMLElement | null;
  folders: { id: string; name: string }[];
  currentFolderId?: string | null;
  onMoveTo: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const style = useSmartMenuPosition(anchorEl, menuRef, 260);

  React.useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (anchorEl?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('mousedown', fn);
    return () => window.removeEventListener('mousedown', fn);
  }, [anchorEl, onClose]);

  if (!anchorEl) return null;

  const node = (
    <div
      ref={menuRef}
      style={style}
      className="z-[131] rounded-lg border border-surface-200 bg-white/95 p-1 shadow-xl backdrop-blur-sm
                 dark:border-neutral-800 dark:bg-neutral-900"
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-black/60 dark:text-white/60">
        Déplacer vers…
      </div>

      <button
        onClick={() => onMoveTo(null)}
        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10`}
      >
        <span>(Sans dossier)</span>
        {currentFolderId == null ? <span className="text-xs opacity-70">•</span> : null}
      </button>

      <div className="my-1"></div>
      {folders.length === 0 ? (
        <div className="px-3 py-2 text-sm opacity-60">Aucun dossier</div>
      ) : (
        folders.map(f => (
          <button
            key={f.id}
            onClick={() => onMoveTo(f.id)}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            title={f.name}
          >
            <span className="truncate">{f.name || '(Sans nom)'}</span>
            {currentFolderId === f.id ? <span className="text-xs opacity-70">•</span> : null}
          </button>
        ))
      )}
    </div>
  );

  return createPortal(node, document.body);
}

function MenuItem({ onClick, label, icon }: { onClick: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10">
      {icon ? <span className="opacity-80">{icon}</span> : null}
      <span>{label}</span>
    </button>
  );
}

/* --------- MENU DÉROULANT PRINCIPAL (QuickMenu) --------- */
function QuickMenu({
  anchorEl, onClose, onHome, onActuality,
  hideAppHeader, setHideAppHeader, hideAppFooter, setHideAppFooter,
  onSettings,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onHome: () => void;
  onActuality: () => void;
  hideAppHeader: boolean; setHideAppHeader: (v: boolean) => void;
  hideAppFooter: boolean; setHideAppFooter: (v: boolean) => void;
  onSettings: () => void;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const style = useSmartMenuPosition(anchorEl, menuRef, 300);
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (anchorEl?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [anchorEl, onClose]);
  const run = (fn: () => void) => () => { fn(); onClose(); };
  if (!anchorEl) return null;
  return (
    <div style={style} onMouseDown={(e) => e.stopPropagation()} className="rounded-xl border border-surface-200 bg-white/95 p-2 shadow-xl backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-black/60 dark:text-white/60">Navigation</div>
      <MenuItem onClick={run(onHome)} icon={<FiHome />} label="Accueil" />
      <MenuItem onClick={run(onActuality)} icon={<FiGrid />} label="Actuality" />
      <div className="mt-2 px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-black/60 dark:text-white/60">Layout</div>
      <label className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10">
        <span className="flex items-center gap-2"><FiSliders className="opacity-80" />Masquer le header de l’app</span>
        <input type="checkbox" checked={hideAppHeader} onChange={(e) => setHideAppHeader(e.target.checked)} />
      </label>
      <label className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10">
        <span className="flex items-center gap-2"><FiSliders className="opacity-80" />Masquer le footer</span>
        <input type="checkbox" checked={hideAppFooter} onChange={(e) => setHideAppFooter(e.target.checked)} />
      </label>
      <div className="mt-2 px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-black/60 dark:text-white/60">App</div>
      <MenuItem onClick={run(onSettings)} icon={<FiSettings />} label="Paramètres" />
    </div>
  );
}

/* ======================= Component ======================= */
export default function ChatSidebar(props: Props) {
  const { open, collapsed, onCollapseToggle, conversations, currentId,
          onSelect, onNewChat, onDelete, onSearch, onOpenSettings } = props;

  const nav = useNavigate();

  // états menu principal (dropdown)
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const [hideAppHeader, setHideAppHeader] = React.useState(false);
  const [hideAppFooter, setHideAppFooter] = React.useState(false);
  React.useEffect(() => {
  document.body.classList.toggle('chat-hide-app-header', hideAppHeader);
  document.body.classList.toggle('chat-hide-app-footer', hideAppFooter);

  return () => {
    // garanti que ça ne "fuitera" pas en dehors de la page chat
    document.body.classList.remove('chat-hide-app-header');
    document.body.classList.remove('chat-hide-app-footer');
  };
}, [hideAppHeader, hideAppFooter]);

  const [moveMenu, setMoveMenu] = React.useState<{
    chatId: string;
    anchor: HTMLElement | null;
  } | null>(null);

  // dossiers
  const [folders, setFolders] = React.useState<{ id: string; name: string }[]>([]);
  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>({});
  const [folderItems, setFolderItems] = React.useState<Record<string, { loading: boolean; items: Conversation[] }>>({});

  // modal "tous les dossiers"
  const [showAllFolders, setShowAllFolders] = React.useState(false);

  // ⚠️ ICI (pas en haut du fichier)
  const [foldersCollapsed, setFoldersCollapsed] = React.useState(false);

  const [showNewFolder, setShowNewFolder] = React.useState(false);

  // menu contextuel (dossier/chat)
  const [menu, setMenu] = React.useState<{ kind: 'folder'|'chat'; id: string; anchor: HTMLElement | null } | null>(null);

  const [renaming, setRenaming] = React.useState<{ id: string; current: string; kind: 'chat' | 'folder' } | null>(null);

  type Toast = { id: number; text: string };
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const pushToast = React.useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2500);
  }, []);

  // load dossiers
  React.useEffect(() => { fetchFolders().then(setFolders).catch(console.error); }, []);

  // handlers
  const toggleFolder = async (id: string) => {
    setOpenMap((m) => ({ ...m, [id]: !m[id] }));
    if (!openMap[id] && !folderItems[id]) {
      setFolderItems((s) => ({ ...s, [id]: { loading: true, items: [] } }));
      try {
        const items = await listSessionsByFolder(id);
        setFolderItems((s) => ({ ...s, [id]: { loading: false, items: items.map(i => ({ id: i.id, title: i.title })) } }));
      } catch {
        setFolderItems((s) => ({ ...s, [id]: { loading: false, items: [] } }));
      }
    }
  };

  React.useEffect(() => {
    if (!showNewFolder) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [showNewFolder]);

  const handleRenameFolder = async (id: string) => {
    const current = folders.find(f => f.id === id)?.name ?? '';
    setRenaming({ id, current, kind: 'folder' });
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Supprimer ce dossier ? Les chats resteront dans la liste générale.')) return;
    try {
      await deleteFolder(id);
      setFolders((arr) => arr.filter(f => f.id !== id));
      const { [id]: _, ...rest } = folderItems;
      setFolderItems(rest);
      pushToast('Dossier supprimé');
    } catch { alert('Suppression impossible.'); }
  };

  const handleRenameChat = async (id: string) => {
    const current = (
      Object.values(folderItems).flatMap(f => f.items).find(c => c.id === id)?.title ||
      conversations.find(c => c.id === id)?.title ||
      ''
    );
    setRenaming({ id, current, kind: 'chat' });
  };

  const handleMoveChat = async (chatId: string, destFolderId: string | null) => {
    try {
      await moveSessionToFolder(chatId, destFolderId);

      // mise à jour instantanée côté front
      setFolderItems((map) => {
        const copy = { ...map } as typeof map;
        let movedItem: Conversation | null = null;

        for (const fid of Object.keys(copy)) {
          const before = copy[fid]?.items ?? [];
          const idx = before.findIndex(c => c.id === chatId);
          if (idx >= 0) {
            movedItem = before[idx];
            copy[fid] = { ...copy[fid], items: [...before.slice(0, idx), ...before.slice(idx + 1)] };
          }
        }

        // Si on vient de la liste "Chats" (pas encore présente dans folderItems),
        // on crée un item à partir des conversations du bas pour MAJ instantanée
        if (!movedItem) {
          const fromFlat = conversations.find(c => c.id === chatId);
          if (fromFlat) movedItem = { id: fromFlat.id, title: fromFlat.title || 'Sans titre' } as Conversation;
        }

        if (destFolderId && movedItem) {
          const dest = copy[destFolderId] ?? { loading: false, items: [] as Conversation[] };
          copy[destFolderId] = { ...dest, items: [movedItem, ...dest.items] };
        }

        return copy;
      });

      pushToast(destFolderId ? 'Chat déplacé dans le dossier' : 'Chat retiré du dossier');
    } catch (e) {
      console.error(e);
      pushToast('Déplacement impossible');
    } finally {
      setMoveMenu(null);
    }
  };

  if (!open) return null;

  /* ============== RAIL (fermé) ============== */
  if (collapsed) {
    return (
      <aside
        className="sticky z-40 w-14 shrink-0 overflow-hidden border-r border-surface-200 bg-white/80 text-neutral-900 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80 dark:text-white"
        style={{ top: 'var(--app-header-h,64px)', height: 'calc(100dvh - var(--app-header-h,64px))' }}
        aria-label="Chat sidebar (collapsed)"
      >
        <div className="flex h-full min-h-0 flex-col items-center gap-3 py-3">
          <IconBtn size="sm" onClick={onCollapseToggle} title="Déployer"><FiChevronRight /></IconBtn>

          <button
            ref={menuBtnRef}
            onClick={() => setMenuOpen(v => !v)}
            title="Menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-surface-200 bg-white/80 hover:bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/70 dark:hover:bg-neutral-900"
          >
            <FiGrid className="h-4 w-4 opacity-80" />
          </button>

          {menuOpen && createPortal(
            <QuickMenu
              anchorEl={menuBtnRef.current}
              onClose={() => setMenuOpen(false)}
              onHome={() => nav('/')}
              onActuality={() => nav('/actuality')}
              hideAppHeader={hideAppHeader} setHideAppHeader={setHideAppHeader}
              hideAppFooter={hideAppFooter} setHideAppFooter={setHideAppFooter}
              onSettings={() => (onOpenSettings ? onOpenSettings() : nav('/settings'))}
            />,
            document.body
          )}

          <div className="mt-1 flex flex-col items-center gap-2">
            <IconBtn size="sm" onClick={onNewChat} title="Nouveau chat"><FiPlus className="opacity-80" /></IconBtn>
            <IconBtn size="sm" onClick={onSearch} title="Rechercher"><FiSearch className="opacity-80" /></IconBtn>
            <IconBtn size="sm" onClick={() => setShowNewFolder(true)} title="Nouveau dossier"><FiFolderPlus className="opacity-80" /></IconBtn>
          </div>

          <div className="mt-auto pb-2 text-[11px] opacity-60">© 2025 Epion</div>
        </div>

        {showNewFolder && (
          <NewFolderModal
            onClose={() => setShowNewFolder(false)}
            onCreated={(folder) => { setFolders(prev => [...prev, folder]); pushToast(`Dossier “${folder.name}” créé`); }}
          />
        )}
      </aside>
    );
  }

  /* ============== VERSION LARGE (ouverte) ============== */
  const visibleFolders = folders.slice(0, 3);

  return (
    <aside
      className="sticky z-40 w-72 shrink-0 overflow-hidden border-r border-surface-200 bg-white/80 text-neutral-900 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80 dark:text-white"
      style={{ top: 'var(--app-header-h,64px)', height: 'calc(100dvh - var(--app-header-h,64px))' }}
      aria-label="Chat sidebar"
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <IconBtn size="sm" onClick={onCollapseToggle} title="Réduire"><FiChevronLeft /></IconBtn>

          <button
            ref={menuBtnRef}
            onClick={() => setMenuOpen(v => !v)}
            className="inline-flex items-center gap-2 rounded-md border border-surface-200 bg-white/80 px-3 py-2 text-sm hover:bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/70 dark:hover:bg-neutral-900"
            title="Menu"
          >
            <FiGrid className="opacity-80" /><span>Menu</span>
          </button>

          {menuOpen && createPortal(
            <QuickMenu
              anchorEl={menuBtnRef.current}
              onClose={() => setMenuOpen(false)}
              onHome={() => nav('/')}
              onActuality={() => nav('/actuality')}
              hideAppHeader={hideAppHeader} setHideAppHeader={setHideAppHeader}
              hideAppFooter={hideAppFooter} setHideAppFooter={setHideAppFooter}
              onSettings={() => { setMenuOpen(false); nav('/settings'); }}
            />,
            document.body
          )}
        </div>

        {/* ======== SCROLL WRAPPER (unique) ======== */}
        <div className="flex-1 min-h-0 overflow-y-auto thin-scroll px-3 pb-3" style={{ paddingBottom: 'calc(var(--footer-offset,0px) + var(--chat-input-h,0px) + 8px)' }}>
          {/* Actions */}
          <PrimaryAction onClick={() => { setMenuOpen(false); onNewChat(); pushToast('Nouveau chat'); }} icon={<FiPlus />} label="Nouveau chat" />
          <div className="mt-3 space-y-2">
            <SecondaryAction onClick={onSearch} icon={<FiSearch />} label="Rechercher" />
            <SecondaryAction onClick={() => setShowNewFolder(true)} icon={<FiFolderPlus />} label="Nouveau dossier" />
          </div>

          {/* Dossiers */}
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setFoldersCollapsed(v => !v)}
                className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                aria-expanded={!foldersCollapsed}
              >
                <Chevron className={`h-4 w-4 transition-transform ${foldersCollapsed ? '' : 'rotate-90'}`} />
                <span className="font-medium text-black/70 dark:text-white/70">Dossiers</span>
              </button>
              {folders.length > 3 && (
                <button
                  onClick={() => setShowAllFolders(true)}
                  className="text-xs px-2 py-1 rounded-md border border-surface-200 hover:bg-black/5 dark:border-neutral-800 dark:hover:bg-white/10"
                >
                  Afficher plus
                </button>
              )}
            </div>

            {!foldersCollapsed && (
              <>
                {folders.length === 0 ? (
                  <div className="mt-2 rounded-xl border border-surface-200 px-3 py-2 text-sm opacity-70 dark:border-neutral-800">
                    Aucun dossier
                  </div>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {visibleFolders.map((f) => {
                      const opened  = !!openMap[f.id];
                      const items   = folderItems[f.id]?.items ?? [];
                      const loading = folderItems[f.id]?.loading;
                      return (
                        <li key={f.id} className="relative">
                          <div
  role="button"
  aria-expanded={opened}
  onClick={() => props.onOpenFolder(f.id)}   // ⬅️ Ouvrir la « page dossier » dans le panneau droit
  className={`group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition cursor-pointer ${opened ? 'bg-black/5 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
>
  <Chevron
    className={`h-4 w-4 transition-transform ${opened ? 'rotate-90' : ''}`}
    onClick={(e) => { e.stopPropagation(); toggleFolder(f.id); }} // ⬅️ ne fait QUE plier/déplier
    title={opened ? 'Replier' : 'Dérouler'}
  />
  <FiFolder className="h-4 w-4 opacity-80" />
  <span className="min-w-0 flex-1 truncate">{f.name?.trim() || '(Sans nom)'}</span>
                            <button
                              className="ml-1 flex h-8 w-8 items-center justify-center rounded-md border border-surface-200 hover:bg-black/5 dark:border-neutral-800 dark:hover:bg-white/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); setMenu({ kind: 'folder', id: f.id, anchor: e.currentTarget }); }}
                              aria-label="Menu du dossier"
                            >
                              <FiMoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>

                          {opened && (
                            <div className="mt-1 pl-7">
                              {loading ? (
                                <div className="text-sm opacity-70 px-2 py-1">Chargement…</div>
                              ) : items.length === 0 ? (
                                <div className="text-sm opacity-70 px-2 py-1">Aucun chat dans ce dossier</div>
                              ) : (
                                <ul className="space-y-1">
                                  {items.map((c) => (
                                    <li key={c.id} className="group flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/10">
                                      <button className="min-w-0 flex-1 text-left truncate" onClick={() => onSelect(c.id)} title={c.title}>
                                        {c.title || 'Sans titre'}
                                      </button>
                                      <button
                                        className="flex h-7 w-7 items-center justify-center rounded-md border border-surface-200 hover:bg-black/5 dark:border-neutral-800 dark:hover:bg-white/10"
                                        onClick={(e) => { e.stopPropagation(); setMenu({ kind: 'chat', id: c.id, anchor: e.currentTarget }); }}
                                        aria-label="Menu du chat"
                                      >
                                        <FiMoreHorizontal className="h-4 w-4" />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* Chats */}
          <div className="mt-5 text-sm font-medium text-black/70 dark:text-white/70">Chats</div>
          <ul className="mt-2 space-y-2">
  {conversations.map((c) => {
    const isActive = c.id === currentId;   // ⬅️ AJOUT

    return (
      <li
        key={c.id}
        className={`group flex items-center gap-2 rounded-lg px-2 py-1 text-sm
                    ${isActive ? 'bg-black/5 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
      >
        <button
          className={`min-w-0 flex-1 text-left truncate ${
  isActive ? 'text-black/70 dark:text-white/70 font-medium' : ''
}`}

          onClick={() => onSelect(c.id)}
          title={c.title}
          aria-current={isActive ? 'page' : undefined}
        >
          {c.title || 'Sans titre'}
        </button>

        <button
          className={`flex h-7 w-7 items-center justify-center rounded-md border border-surface-200
                      ${isActive ? 'opacity-40' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}
                      dark:border-neutral-800 dark:hover:bg-white/10 transition-opacity`}
          onClick={(e) => { e.stopPropagation(); setMenu({ kind: 'chat', id: c.id, anchor: e.currentTarget }); }}
          aria-label="Menu du chat"
        >
          <FiMoreHorizontal className="h-4 w-4" />
        </button>
      </li>
    );
  })}
</ul>

          {/* Footer dans la zone scroll */}
          <div className="mt-6 text-[11px] text-black/60 dark:text-white/60">© 2025 Epion</div>
        </div>

        {/* Modal nouveau dossier */}
        {showNewFolder && (
          <NewFolderModal
            onClose={() => setShowNewFolder(false)}
            onCreated={(folder) => { setFolders((prev) => [...prev, folder]); pushToast(`Dossier “${folder.name}” créé`); }}
          />
        )}

        {/* Menu contextuel */}
        <RowMenu anchorEl={menu?.anchor ?? null} onClose={() => setMenu(null)}>
          {menu?.kind === 'folder' ? (
            <>
              <MenuItem onClick={() => { if (!menu) return; handleRenameFolder(menu.id); setMenu(null); }} label="Renommer" />
              <MenuItem onClick={() => { if (!menu) return; handleDeleteFolder(menu.id); setMenu(null); }} icon={<FiTrash2 />} label="Supprimer le dossier" />
            </>
          ) : menu?.kind === 'chat' ? (
            <>
              <MenuItem onClick={() => { if (!menu) return; onSelect(menu.id); setMenu(null); }} label="Ouvrir" />
              <MenuItem onClick={() => { if (!menu) return; handleRenameChat(menu.id); setMenu(null); }} label="Renommer" />
              <MenuItem onClick={() => { if (!menu) return; onDelete(menu.id); setMenu(null); }} icon={<FiTrash2 />} label="Supprimer" />
              <MenuItem
                onClick={() => {
                  if (!menu) return;
                  setMoveMenu({ chatId: menu.id, anchor: menu.anchor });
                  setMenu(null);
                }}
                label="Déplacer vers…"
              />
            </>
          ) : null}
        </RowMenu>

        {/* Sous-menu déplacement */}
        <MoveMenu
          anchorEl={moveMenu?.anchor ?? null}
          folders={folders}
          currentFolderId={
            Object.keys(folderItems).find(fid => folderItems[fid]?.items?.some(c => c.id === moveMenu?.chatId)) ?? null
          }
          onMoveTo={(fid) => moveMenu && handleMoveChat(moveMenu.chatId, fid)}
          onClose={() => setMoveMenu(null)}
        />

        {/* Dialog rename (chat ou dossier) */}
{createPortal(
  renaming ? (
    <RenameDialog
      title={renaming.kind === 'folder' ? 'Renommer le dossier' : 'Renommer le chat'}
      initialValue={renaming.current}
      open={true}
      onCancel={() => setRenaming(null)}
      onSubmit={async (value) => {
        if (!renaming) return;
        try {
          if (renaming.kind === 'folder') {
            await renameFolder(renaming.id, value);
            setFolders((arr) => arr.map(f => f.id === renaming.id ? { ...f, name: value } : f));
            pushToast('Dossier renommé');
          } else {
            await updateSessionTitle(renaming.id, value);
            setFolderItems((map) => {
            const copy = { ...map } as typeof map;
            for (const fid of Object.keys(copy)) {
              copy[fid] = {
                ...copy[fid],
                items: (copy[fid]?.items ?? []).map(c => (c.id === renaming.id ? { ...c, title: value } : c)),
              } as any;
            }
            return copy;
          });
          props.onRename?.(renaming.id, value);
            pushToast('Chat renommé');
            
          }
        } catch (e) {
          console.error(e);
          pushToast('Erreur: impossible de renommer');
        } finally {
          setRenaming(null);
        }
      }}
    />
  ) : null,
  document.body
)}

        {/* Modal Tous les dossiers */}
        {showAllFolders && createPortal(
          <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm" onClick={() => setShowAllFolders(false)}>
            <div className="absolute left-1/2 top-24 w-full max-w-md -translate-x-1/2 rounded-2xl border border-black/10 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-lg font-semibold">Tous les dossiers</div>
                <button onClick={() => setShowAllFolders(false)} className="rounded-md border border-surface-200 px-2 py-1 text-sm hover:bg-black/5 dark:border-neutral-800 dark:hover:bg-white/10">Fermer</button>
              </div>
              <ul className="max-h-[60vh] overflow-y-auto thin-scroll space-y-2">
                {folders.map((f) => (
                  <li key={f.id}>
    <button
      onClick={() => {
        props.onOpenFolder?.(f.id);   // ouvre le panel dossier dans la page chat
        setShowAllFolders(false);     // ferme le modal
      }}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
      title={f.name}
    >
      <FiFolder className="opacity-80" />
      <span className="truncate">{f.name}</span>
    </button>
  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body
        )}

        {/* Toasts */}
        {createPortal(
          <div className="fixed bottom-4 left-4 z-[9999] space-y-2">
            {toasts.map(t => (
              <div key={t.id} className="rounded-lg border border-surface-200 bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-900">
                {t.text}
              </div>
            ))}
          </div>,
          document.body
        )}
      </div>
    </aside>
  );
}
