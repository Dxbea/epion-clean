import React, { useState, useEffect } from 'react';
import { Instagram, ArrowRight, Github, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui';

/**
 * BetaNotificationPopup - Theme-aware Compact version.
 * Now supports both Light and Dark modes using Tailwind's dark: classes.
 * Follows the 90/10 design rule: 90% neutral structure, 10% vivid branding.
 */
export default function BetaNotificationPopup() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Smooth reveal
    const timer = setTimeout(() => setIsOpen(true), 150);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsOpen(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Dynamic backdrop - keeps focus with a darkened blur in both modes */}
      <div 
        className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xl transition-opacity animate-in fade-in duration-500" 
        onClick={handleClose} 
      />

      {/* Theme-aware Modal Container */}
      <div 
        className="relative w-full max-w-[440px] max-h-[95vh] bg-brand-white dark:bg-black border border-black/10 dark:border-white/10 rounded-[2rem] px-10 py-10 shadow-[0_64px_128px_-16px_rgba(0,0,0,0.3)] dark:shadow-[0_64px_128px_-16px_rgba(0,0,0,1)] flex flex-col items-stretch overflow-hidden animate-in zoom-in-95 fade-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col h-full overflow-y-auto thin-scroll pr-1">
          {/* Header Section */}
          <div className="flex items-center justify-between mb-8 flex-shrink-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight leading-none">
              {t('beta_popup_title')}
            </h1>
            <Button 
              variant="ghost"
              size="icon"
              onClick={handleClose}
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-400 dark:text-neutral-600" />
            </Button>
          </div>

          {/* Theme-aware Message Section */}
          <div className="mb-10 flex-shrink-0">
            <p className="text-[17px] text-gray-600 dark:text-neutral-400 leading-[1.6] font-light text-left">
              {t('beta_popup_message').split('**').map((part, i) => 
                i % 2 === 1 ? (
                  <span key={i} className="text-gray-900 dark:text-white font-bold tracking-tight">{part}</span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </p>
          </div>

          {/* Social Action Cards - Theme-aware */}
          <div className="space-y-6 mb-10 flex-shrink-0">
            {/* Instagram Entry */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5 text-gray-500 dark:text-neutral-400 text-[11px] font-bold tracking-widest uppercase opacity-80">
                <Instagram className="w-3.5 h-3.5 text-[#D946EF]" />
                {t('beta_popup_insta_label')}
              </div>
              <a 
                href="https://www.instagram.com/epion.app" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-between bg-white dark:bg-neutral-900/50 hover:bg-gray-50 dark:hover:bg-neutral-900 p-4 rounded-xl transition-all border border-black/5 dark:border-white/[0.06] group active:scale-[0.98]"
              >
                <span className="text-[17px] font-bold text-[#D946EF] tracking-tight">
                  {t('beta_popup_insta_handle')}
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 dark:text-neutral-700 group-hover:text-black dark:group-hover:text-white transition-all transform group-hover:translate-x-1" />
              </a>
            </div>

            {/* GitHub Entry */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5 text-gray-500 dark:text-neutral-400 text-[11px] font-bold tracking-widest uppercase opacity-80">
                <Github className="w-3.5 h-3.5 text-gray-900 dark:text-white" />
                {t('beta_popup_github_label')}
              </div>
              <a 
                href="https://github.com/Dxbea/epion-clean" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-between bg-white dark:bg-neutral-900/50 hover:bg-gray-50 dark:hover:bg-neutral-900 p-4 rounded-xl transition-all border border-black/5 dark:border-white/[0.06] group active:scale-[0.98]"
              >
                <span className="text-[17px] font-bold text-gray-900 dark:text-white tracking-tight">
                  {t('beta_popup_github_repo')}
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 dark:text-neutral-700 group-hover:text-black dark:group-hover:text-white transition-all transform group-hover:translate-x-1" />
              </a>
            </div>
          </div>

          {/* Theme-aware CTA Button */}
          <div className="mt-auto pt-4 flex-shrink-0">
            <Button 
              variant="primary"
              size="auto"
              onClick={handleClose}
              className="w-full py-4 rounded-xl text-lg font-bold"
            >
              {t('beta_popup_cta')}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
