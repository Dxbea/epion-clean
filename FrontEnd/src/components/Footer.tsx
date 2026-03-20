// src/components/Footer.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';

type FooterLink = { label: string; to: string; external?: boolean };
type FooterSection = { title?: string; links?: FooterLink[] };


const defaultCategories = [
  'Monde',
  'Politique',
  'Économie',
  'Tech',
  'Sciences',
  'Santé',
  'Culture',
  'Sport',
  'National',
  'Opinions',
  'Trending',
  'Weather',
  'Other',
];

function FooterLinkItem({ to, label, external }: FooterLink) {
  const base =
    'text-sm text-white/80 hover:text-white hover:underline underline-offset-4 transition';
  if (external) {
    return (
      <a href={to} target="_blank" rel="noreferrer" className={base}>
        {label}
      </a>
    );
  }
  return (
    <Link to={to} className={base}>
      {label}
    </Link>
  );
}

type Props = React.ComponentProps<'footer'> & {
  logoLight?: string;
  logoDark?: string;
  sections?: FooterSection[];
  categories?: string[];
  /** tu peux l’activer ponctuellement sur une page, mais PLUS dans le layout */
  showCategories?: boolean;
};

export default function Footer({
  logoLight,
  logoDark,
  sections: propsSections,
  categories: propsCategories,
  showCategories = false,
  className = '',
  ...rest
}: Props) {
  const { t } = useI18n();

  const sections = propsSections ?? [
    {
      title: t('footer_product'),
      links: [
        { label: t('download'), to: '/download' },
        { label: t('chat'), to: '/chat' },
        { label: t('news'), to: '/news' },
        { label: t('fact_check'), to: '/fact-check' },
      ],
    },
    {
      title: t('footer_resources'),
      links: [
        { label: t('faq'), to: '/help' },
        { label: t('guide'), to: '/guide' },
        { label: t('blog'), to: '/blog' },
        { label: t('changelog'), to: '/changelog' },
      ],
    },
    {
      title: t('footer_company'),
      links: [
        { label: t('about'), to: '/about' },
        { label: t('transparency'), to: '/transparency' },
        { label: t('press'), to: '/press' },
        { label: t('contact'), to: '/contact' },
      ],
    },
    {
      title: t('footer_legal'),
      links: [
        { label: t('privacy'), to: '/legal/privacy' },
        { label: t('terms'), to: '/legal/terms' },
        { label: t('cookies'), to: '/legal/cookies' },
        { label: t('moderation_policy'), to: '/legal/moderation' },
      ],
    },
  ];

  const categories = propsCategories ?? defaultCategories;

  return (
    <footer
      {...rest}
      className={`w-full bg-black text-white pt-10 pb-6 ${className}`}
      data-footer="epion"
    >
      {/* top */}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
        {/* brand + cols */}
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
          {/* brand */}
          <div className="space-y-4">
            {logoLight || logoDark ? (
              <img
                src={logoLight || logoDark}
                alt="Epion"
                className="h-9 w-auto"
                loading="lazy"
              />
            ) : (
              <div className="text-xl font-semibold">Epion</div>
            )}
            <p className="max-w-sm text-sm text-white/70">
              {t('footer_tagline')}
            </p>
          </div>

          {/* sections */}
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
            {sections.map((col, idx) => (
              <div key={idx}>
                {col.title ? (
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/50 mb-3">
                    {col.title}
                  </div>
                ) : null}
                <div className="flex flex-col gap-2">
                  {col.links?.map((l, i) => (
                    <FooterLinkItem key={`${idx}-${i}`} {...l} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* categories actu (optionnel) */}
        {showCategories ? (
          <div className="border-t border-white/5 pt-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/50 mb-3">
              {t('categories')}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {categories.map((c) => (
                <Link
                  key={c}
                  to={`/news/${c.toLowerCase()}`}
                  className="text-sm text-white/70 hover:text-white transition"
                >
                  {c}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* bottom bar */}
      <div className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 border-t border-white/5 pt-4 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <div>© {new Date().getFullYear()} Epion. {t('footer_rights')}</div>
          <div className="flex flex-wrap gap-4">
            <Link to="/legal/privacy" className="hover:text-white">
              {t('privacy')}
            </Link>
            <Link to="/legal/terms" className="hover:text-white">
              {t('terms')}
            </Link>
            <Link to="/legal/cookies" className="hover:text-white">
              {t('cookies')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
