import React from 'react';

import {
  type BeforeInstallPromptEvent,
  getPwaInstallFallbackMessage,
  isStandalonePwa,
  type PwaInstallLocale,
} from '@/lib/pwa-install';

export function usePwaInstallPrompt(locale: PwaInstallLocale) {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = React.useState(false);
  const [fallbackMessage, setFallbackMessage] = React.useState('');

  React.useEffect(() => {
    const installed = isStandalonePwa();
    setIsInstalled(installed);
    if (installed) {
      setFallbackMessage(
        getPwaInstallFallbackMessage({
          isInstalled: true,
          userAgent: window.navigator.userAgent,
          locale,
        }),
      );
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setFallbackMessage('');
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setFallbackMessage(
        getPwaInstallFallbackMessage({
          isInstalled: true,
          userAgent: window.navigator.userAgent,
          locale,
        }),
      );
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [locale]);

  const promptInstall = React.useCallback(async () => {
    if (isInstalled) {
      const message = getPwaInstallFallbackMessage({
        isInstalled: true,
        userAgent: window.navigator.userAgent,
        locale,
      });
      setFallbackMessage(message);
      return { prompted: false, message };
    }

    if (!deferredPrompt) {
      const message = getPwaInstallFallbackMessage({
        isInstalled: false,
        userAgent: window.navigator.userAgent,
        locale,
      });
      setFallbackMessage(message);
      return { prompted: false, message };
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === 'accepted') {
      setFallbackMessage('');
    }

    return { prompted: true, outcome: choice.outcome };
  }, [deferredPrompt, isInstalled, locale]);

  return {
    canInstall: Boolean(deferredPrompt && !isInstalled),
    isInstalled,
    fallbackMessage,
    promptInstall,
  };
}
