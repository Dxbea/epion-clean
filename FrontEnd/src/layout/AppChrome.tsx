import * as React from 'react';

type Ctx = {
  showHeader: boolean;
  showFooter: boolean;
  setShowHeader: (v: boolean) => void;
  setShowFooter: (v: boolean) => void;
};

const ChromeCtx = React.createContext<Ctx | null>(null);

export function AppChromeProvider({ children }: { children: React.ReactNode }) {
  const [showHeader, setShowHeader] = React.useState(true);
  const [showFooter, setShowFooter] = React.useState(true);
  return (
    <ChromeCtx.Provider value={{ showHeader, showFooter, setShowHeader, setShowFooter }}>
      {children}
    </ChromeCtx.Provider>
  );
}

export function useAppChrome() {
  const ctx = React.useContext(ChromeCtx);
  if (!ctx) throw new Error('useAppChrome must be used inside <AppChromeProvider>');
  return ctx;
}
