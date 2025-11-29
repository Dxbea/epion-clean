// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import React from 'react';
import PageContainer from '@/components/ui/PageContainer';
import { H2, Lead, Body } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';
import { Link } from 'react-router-dom';

type Row = { name: string; type: 'cookie' | 'storage'; purpose: string; duration: string; notes?: string };

export default function Cookies() {
  const { t } = useI18n();

  const cookies: Row[] = [
    {
      name: 'epion_session',
      type: 'cookie',
      purpose: 'Session d’authentification (strictement nécessaire).',
      duration: '7 jours',
      notes: 'HttpOnly, SameSite=Lax, path=/, secure en production.',
    },
  ];

  const storage: Row[] = [
    { name: 'theme', type: 'storage', purpose: 'Préférence de thème (clair/sombre).', duration: 'Persistant', notes: 'localStorage' },
    { name: 'lang', type: 'storage', purpose: 'Langue de l’interface.', duration: 'Persistant', notes: 'localStorage' },
    { name: 'a11y', type: 'storage', purpose: 'Accessibilité (texte + grand, contraste).', duration: 'Persistant', notes: 'localStorage' },
    { name: 'privacy', type: 'storage', purpose: 'Préférences de confidentialité.', duration: 'Persistant', notes: 'localStorage' },
    { name: 'notif', type: 'storage', purpose: 'Préférences de notifications.', duration: 'Persistant', notes: 'localStorage' },
    { name: 'sessions', type: 'storage', purpose: 'Liste des sessions affichée dans les réglages.', duration: 'Persistant', notes: 'localStorage' },
    { name: 'account', type: 'storage', purpose: 'Données visibles dans “Mon compte” (démo locale).', duration: 'Persistant', notes: 'localStorage' },
  ];

  function clearLocalData() {
    const keys = ['theme','lang','a11y','privacy','notif','sessions','account'];
    keys.forEach(k => localStorage.removeItem(k));
    alert('Les données locales ont été supprimées (les cookies httpOnly de session ne sont pas touchés).');
  }

  return (
    <PageContainer className="py-10 space-y-4">
  <H2>Cookies</H2>
  <Lead>Comment et pourquoi nous utilisons des cookies (et stockage local).</Lead>

  <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
    <Body className="mb-3">
      Nous utilisons un cookie strictement nécessaire pour l’authentification. Aucune publicité, aucun tracking tiers.
    </Body>

    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="py-2 pr-4">Nom</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Finalité</th>
            <th className="py-2 pr-4">Durée</th>
            <th className="py-2 pr-4">Détail</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-black/10 dark:border-white/10">
            <td className="py-2 pr-4 font-mono">epion_session</td>
            <td className="py-2 pr-4">Cookie (httpOnly)</td>
            <td className="py-2 pr-4">Maintenir la session utilisateur</td>
            <td className="py-2 pr-4">7 jours</td>
            <td className="py-2 pr-4">Sécurisé, httpOnly, SameSite=Lax. Aucun usage publicitaire.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Body className="mt-6 mb-2 font-semibold">Stockage local (localStorage)</Body>
    <Body className="mb-2">
      Ces éléments ne sont pas des cookies, mais sont stockés dans votre navigateur pour votre confort :
    </Body>
    <ul className="list-disc pl-6 text-sm">
      <li><code>theme</code> – thème clair/sombre</li>
      <li><code>lang</code> – langue choisie</li>
      <li><code>notif</code>, <code>privacy</code>, <code>a11y</code> – préférences</li>
      <li><code>sessions</code> – liste des sessions locales affichées dans Paramètres</li>
      <li><code>account</code> – cache UI basique côté client</li>
    </ul>

    <Body className="mt-6">
      Vous pouvez supprimer ces données dans <strong>Settings → Data & compliance</strong> (“Delete account” supprime le stockage local).
    </Body>
  </div>
</PageContainer>

  );
}
// FIN BLOC
