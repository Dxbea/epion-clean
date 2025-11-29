// src/components/Footer.tsx
import React from 'react';
import { Link } from 'react-router-dom';

type FooterLink = { label: string; to: string; external?: boolean };
type FooterSection = { title?: string; links?: FooterLink[] };

const defaultSections: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { label: 'Download', to: '/download' },
      { label: 'Chat', to: '/chat' },
      { label: 'Actuality', to: '/actuality' },
      { label: 'Fact-check', to: '/fact-check' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help / FAQ', to: '/help' },
      { label: 'Guide', to: '/guide' },
      { label: 'Blog', to: '/blog' },
      { label: 'Changelog', to: '/changelog' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Our transparency', to: '/transparency' },
      { label: 'Press', to: '/press' },
      { label: 'Contact', to: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', to: '/legal/privacy' },
      { label: 'Terms', to: '/legal/terms' },
      { label: 'Cookies', to: '/legal/cookies' },
      { label: 'Moderation policy', to: '/legal/moderation' },
    ],
  },
];

const defaultCategories = [
  'Politics',
  'World',
  'Economy',
  'Tech',
  'Science',
  'Environment',
  'Business',
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
  sections = defaultSections,
  categories = defaultCategories,
  showCategories = false,
  className = '',
  ...rest
}: Props) {
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
              L’information, sans le bruit. Vérifie. Comprends. Discute.
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
              Categories
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {categories.map((c) => (
                <Link
                  key={c}
                  to={`/actuality/${c.toLowerCase()}`}
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
          <div>© {new Date().getFullYear()} Epion. Tous droits réservés.</div>
          <div className="flex flex-wrap gap-4">
            <Link to="/legal/privacy" className="hover:text-white">
              Confidentialité
            </Link>
            <Link to="/legal/terms" className="hover:text-white">
              Conditions
            </Link>
            <Link to="/legal/cookies" className="hover:text-white">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
