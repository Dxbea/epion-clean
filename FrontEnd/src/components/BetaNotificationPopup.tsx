import React, { useState, useEffect } from 'react';
import { Instagram, Info, ArrowRight, Github } from 'lucide-react';
import Modal from './ui/Modal';
import { useTranslation } from 'react-i18next';
import Button from './ui/Button';

export default function BetaNotificationPopup() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Show the popup on mount
    setIsOpen(true);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('beta_popup_title')}
    >
      <div className="flex flex-col gap-6 py-2">
        {/* Icon / Hero area */}
        <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-full bg-blue-50 dark:bg-blue-900/20">
          <Info className="w-8 h-8 text-blue-600 dark:text-blue-400" />
        </div>

        {/* Message */}
        <div className="space-y-4">
          <p className="text-base text-neutral-600 dark:text-neutral-300 text-center leading-relaxed">
            {/* We could use dangerouslySetInnerHTML if we want to render the **bold** parts, 
                but let's keep it safe or split the translation if needed. 
                For now, simple text or split. */}
            {t('beta_popup_message').split('**').map((part, i) => 
               i % 2 === 1 ? <strong key={i} className="text-neutral-900 dark:text-white font-semibold">{part}</strong> : part
            )}
          </p>
        </div>

        {/* Instagram promo */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/10 dark:to-pink-900/10 border border-purple-100 dark:border-purple-900/20">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-3 flex items-center gap-2">
            <Instagram className="w-4 h-4 text-pink-500" />
            {t('beta_popup_insta_label')}
          </p>
          <a
            href="https://www.instagram.com/epion.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between group bg-white dark:bg-neutral-800 p-3 rounded-xl border border-purple-100 dark:border-purple-900/30 hover:border-pink-300 dark:hover:border-pink-500/50 transition-all shadow-sm"
          >
            <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500">
              {t('beta_popup_insta_handle')}
            </span>
            <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-pink-500 group-hover:translate-x-1 transition-all" />
          </a>
        </div>

        {/* GitHub promo */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-50 to-neutral-50 dark:from-gray-900/10 dark:to-neutral-900/10 border border-gray-100 dark:border-gray-900/20">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-3 flex items-center gap-2">
            <Github className="w-4 h-4 text-neutral-900 dark:text-white" />
            {t('beta_popup_github_label')}
          </p>
          <a
            href="https://github.com/Dxbea/epion-clean"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between group bg-white dark:bg-neutral-800 p-3 rounded-xl border border-gray-100 dark:border-gray-900/30 hover:border-gray-300 dark:hover:border-gray-500/50 transition-all shadow-sm"
          >
            <span className="font-bold text-neutral-900 dark:text-white">
              {t('beta_popup_github_repo')}
            </span>
            <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white group-hover:translate-x-1 transition-all" />
          </a>
        </div>

        {/* CTA */}
        <div className="mt-2">
          <Button
            onClick={handleClose}
            className="w-full py-6 text-base font-semibold bg-neutral-900 dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity rounded-xl"
          >
            {t('beta_popup_cta')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
