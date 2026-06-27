import React from 'react';

import { Button } from '@/components/ui';
import { usePwaInstallPrompt } from '@/hooks/usePwaInstallPrompt';
import { useI18n } from '@/i18n/I18nContext';

type PwaInstallButtonProps = {
  className?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
  label?: string;
  showHint?: boolean;
};

export default function PwaInstallButton({
  className,
  variant = 'primary',
  label,
  showHint = true,
}: PwaInstallButtonProps) {
  const { t, locale } = useI18n();
  const { isInstalled, fallbackMessage, promptInstall } = usePwaInstallPrompt(locale);
  const defaultLabel = isInstalled
    ? t('pwa_installed_button')
    : t('pwa_install_button');

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Button
        type="button"
        variant={variant}
        size="auto"
        disabled={isInstalled}
        onClick={() => {
          void promptInstall();
        }}
        className={className}
      >
        {label || defaultLabel}
      </Button>
      {showHint && fallbackMessage ? (
        <p className="max-w-sm text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          {fallbackMessage}
        </p>
      ) : null}
    </div>
  );
}
