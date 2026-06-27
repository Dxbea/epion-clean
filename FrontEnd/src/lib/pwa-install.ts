export type PwaInstallLocale = 'en' | 'fr';

export type PwaInstallFallbackInput = {
  isInstalled: boolean;
  userAgent: string;
  locale: PwaInstallLocale;
};

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isIosUserAgent(userAgent: string): boolean {
  return /iphone|ipad|ipod/i.test(userAgent);
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;

  const standaloneDisplay = window.matchMedia?.('(display-mode: standalone)').matches;
  const navigatorStandalone = 'standalone' in window.navigator
    ? Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
    : false;

  return Boolean(standaloneDisplay || navigatorStandalone);
}

export function getPwaInstallFallbackMessage({
  isInstalled,
  userAgent,
  locale,
}: PwaInstallFallbackInput): string {
  if (isInstalled) {
    return locale === 'fr'
      ? 'Epion est deja installe sur cet appareil.'
      : 'Epion is already installed on this device.';
  }

  if (isIosUserAgent(userAgent)) {
    return locale === 'fr'
      ? "Sur iPhone, ouvrez Partager puis choisissez Ajouter a l'ecran d'accueil."
      : 'On iPhone, open Share, then choose Add to Home Screen.';
  }

  return locale === 'fr'
    ? "Ouvrez le menu du navigateur, puis choisissez Installer l'application."
    : 'Open the browser menu, then choose Install app.';
}
