import * as React from 'react';
import { useLocation } from 'react-router-dom';

type State = {
  appHeaderVisible: boolean;
  footerVisible: boolean;
  setAppHeaderVisible: (v: boolean) => void;
  setFooterVisible: (v: boolean) => void;
};

const Ctx = React.createContext<State | null>(null);
const KEY = 'epion_chat_layout_v1';

function load(): { appHeaderVisible: boolean; footerVisible: boolean } {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { appHeaderVisible: true, footerVisible: true };
}

function save(v: { appHeaderVisible: boolean; footerVisible: boolean }) {
  try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch {}
}

export function LayoutUIProvider({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isChat = pathname.startsWith('/chat');

  const [state, setState] = React.useState(load);

  // On persiste à chaque changement
  React.useEffect(() => { save(state); }, [state]);

  const value = React.useMemo<State>(() => ({
    appHeaderVisible: state.appHeaderVisible,
    footerVisible: state.footerVisible,
    setAppHeaderVisible: (v) => setState(s => ({ ...s, appHeaderVisible: v })),
    setFooterVisible: (v) => setState(s => ({ ...s, footerVisible: v })),
  }), [state]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLayoutUI() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useLayoutUI must be used inside <LayoutUIProvider>');
  return ctx;
}
