import React from 'react';

import PageContainer from '@/components/ui/PageContainer';
import { Body, Button, H2, Lead } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';

type Row = {
  name: string;
  type: 'cookie' | 'storage';
  purpose: string;
  duration: string;
  notes?: string;
};

export default function Cookies() {
  const { t } = useI18n();

  const cookies: Row[] = [
    {
      name: 'better-auth.session_token',
      type: 'cookie',
      purpose: "Session d'authentification strictement necessaire.",
      duration: '7 jours',
      notes: 'HttpOnly, SameSite=Lax, path=/, secure en production.',
    },
  ];

  const storage: Row[] = [
    { name: 'theme', type: 'storage', purpose: "Preference de theme (clair/sombre).", duration: 'Persistant', notes: 'localStorage' },
    { name: 'lang', type: 'storage', purpose: "Langue de l'interface.", duration: 'Persistant', notes: 'localStorage' },
    { name: 'a11y', type: 'storage', purpose: 'Accessibilite (texte plus grand, contraste).', duration: 'Persistant', notes: 'localStorage' },
    { name: 'privacy', type: 'storage', purpose: 'Preferences de confidentialite.', duration: 'Persistant', notes: 'localStorage' },
    { name: 'notif', type: 'storage', purpose: 'Preferences de notifications.', duration: 'Persistant', notes: 'localStorage' },
    { name: 'sessions', type: 'storage', purpose: 'Liste des sessions affichee dans les reglages.', duration: 'Persistant', notes: 'localStorage' },
    { name: 'account', type: 'storage', purpose: 'Donnees visibles dans Mon compte (demo locale).', duration: 'Persistant', notes: 'localStorage' },
  ];

  function clearLocalData() {
    const keys = ['theme', 'lang', 'a11y', 'privacy', 'notif', 'sessions', 'account'];
    keys.forEach((key) => localStorage.removeItem(key));
    alert("Les donnees locales ont ete supprimees (les cookies httpOnly de session ne sont pas touches).");
  }

  return (
    <PageContainer className="space-y-6 py-8 sm:py-10">
      <H2>{t('cookies') || 'Cookies'}</H2>
      <Lead>Comment et pourquoi nous utilisons des cookies et du stockage local.</Lead>

      <div className="rounded-3xl border border-black/10 p-5 dark:border-white/10 sm:p-6">
        <Body className="mb-4">
          Nous utilisons uniquement les elements necessaires au fonctionnement du produit et a vos preferences d'interface. Aucun tracking tiers ni publicite comportementale.
        </Body>

        <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10">
                <th className="py-3 pr-4 font-medium">Nom</th>
                <th className="py-3 pr-4 font-medium">Type</th>
                <th className="py-3 pr-4 font-medium">Finalite</th>
                <th className="py-3 pr-4 font-medium">Duree</th>
                <th className="py-3 pr-4 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {cookies.map((row) => (
                <tr key={row.name} className="border-b border-black/5 align-top dark:border-white/5">
                  <td className="py-3 pr-4 font-mono">{row.name}</td>
                  <td className="py-3 pr-4 capitalize">{row.type}</td>
                  <td className="py-3 pr-4">{row.purpose}</td>
                  <td className="py-3 pr-4">{row.duration}</td>
                  <td className="py-3 pr-4">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 p-5 dark:border-white/10 sm:p-6">
        <Body className="mb-4 font-semibold">Stockage local</Body>

        <div className="space-y-3">
          {storage.map((row) => (
            <div key={row.name} className="flex flex-col gap-1 rounded-2xl border border-black/5 p-4 dark:border-white/5">
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-black/5 px-2 py-1 text-[12px] dark:bg-white/10">{row.name}</code>
                <span className="text-xs uppercase tracking-wide opacity-60">{row.duration}</span>
              </div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">{row.purpose}</p>
              {row.notes ? <p className="text-xs opacity-70">{row.notes}</p> : null}
            </div>
          ))}
        </div>

        <Body className="mt-6">
          Vous pouvez supprimer ces donnees dans <strong>Settings - Data & compliance</strong>, ou vider localement les preferences d'interface ci-dessous.
        </Body>

        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            size="auto"
            onClick={clearLocalData}
            className="min-h-[44px] rounded-full px-5 py-2.5 text-sm"
          >
            Clear local preferences
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
