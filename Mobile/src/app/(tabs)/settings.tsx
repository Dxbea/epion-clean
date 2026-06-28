import { ActionLink, Screen, Section, StateBox } from '@/components/screen';
import { useAuth } from '@/context/AuthContext';

const signedInCategories = [
  { href: '/settings/account', title: 'Account', description: 'Profil, email, verification et acces au compte.' },
  { href: '/settings/security', title: 'Security', description: 'Mot de passe, sessions actives et protection du compte.' },
  { href: '/settings/privacy', title: 'Privacy', description: 'Visibilite du profil et preferences de suivi.' },
  { href: '/settings/data', title: 'Data', description: 'Export local, donnees et suppression locale.' },
  { href: '/settings/appearance', title: 'Appearance', description: 'Theme et langue, en version mobile simple.' },
  { href: '/settings/notifications', title: 'Notifications', description: 'Preferences email/push locales.' },
  { href: '/settings/accessibility', title: 'Accessibility', description: 'Texte large et contraste, placeholders mobiles.' },
];

export default function SettingsScreen() {
  const { user, loading } = useAuth();
  const categories = user ? signedInCategories : signedInCategories.slice(0, 1);

  return (
    <Screen title="Settings" subtitle="Reglages, securite et preferences du compte Epion.">
      {loading ? <StateBox title="Verification de la session..." /> : null}
      {!user ? <StateBox title="Non connecte" text="Comme sur le web, seule la section Account est disponible sans session." /> : null}

      <Section title="Sections">
        {categories.map((category) => (
          <ActionLink key={category.href} href={category.href} title={category.title} description={category.description} />
        ))}
      </Section>

      <Section title="Raccourcis">
        <ActionLink href="/account" title="My account" description="Profil, session et liens de compte." />
        <ActionLink href="/account/articles" title="My articles" description="Articles crees depuis votre compte." />
        <ActionLink href="/activity" title="Activity" description="Interactions et commentaires." />
      </Section>
    </Screen>
  );
}
