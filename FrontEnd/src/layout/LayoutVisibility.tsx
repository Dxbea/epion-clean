import React from 'react';

type State = {
  header: boolean;
  footer: boolean;
};
type Ctx = State & {
  setVisibility: (p: Partial<State>) => void;
};

const LayoutVisibilityContext = React.createContext<Ctx | null>(null);

export function LayoutVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>({ header: true, footer: true });
  const setVisibility = React.useCallback((p: Partial<State>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);
  const value = React.useMemo<Ctx>(() => ({ ...state, setVisibility }), [state, setVisibility]);
  return <LayoutVisibilityContext.Provider value={value}>{children}</LayoutVisibilityContext.Provider>;
}

export function useLayoutVisibility() {
  const ctx = React.useContext(LayoutVisibilityContext);
  if (!ctx) throw new Error('useLayoutVisibility must be used within LayoutVisibilityProvider');
  return ctx;
}

