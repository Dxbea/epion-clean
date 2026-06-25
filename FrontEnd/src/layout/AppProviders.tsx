import React from 'react';

import BetaNotificationPopup from '@/components/BetaNotificationPopup';
import { ToasterProvider } from '@/components/ui/Toast';
import { AuthPromptProvider } from '@/contexts/AuthPromptContext';

type AppProvidersProps = {
  children: React.ReactNode;
};

export default function AppProviders({ children }: AppProvidersProps): React.JSX.Element {
  return (
    <AuthPromptProvider>
      <ToasterProvider>
        <BetaNotificationPopup />
        {children}
      </ToasterProvider>
    </AuthPromptProvider>
  );
}
