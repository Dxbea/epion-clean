import { StaticInfoScreen } from '@/components/static-info-screen';

export default function CookiesScreen() {
  return (
    <StaticInfoScreen
      title="Cookies"
      subtitle="How and why Epion uses cookies and local storage."
      sections={[
        {
          title: 'Essential session cookie',
          bullets: [
            'better-auth.session_token: strictly necessary authentication session cookie.',
            'Duration: 7 days.',
            'Details: HttpOnly, SameSite=Lax, path=/, secure in production.',
          ],
        },
        {
          title: 'Local storage on web',
          bullets: [
            'theme: light or dark interface preference.',
            'lang: interface language.',
            'a11y: accessibility preferences such as larger text or contrast.',
            'privacy: privacy preferences.',
            'notif: notification preferences.',
            'sessions: list of sessions shown in settings.',
            'account: visible account data for local demo behavior.',
          ],
        },
      ]}
      note="The web page states that Epion uses only product and interface preferences here, with no third-party tracking or behavioral advertising. Mobile-specific storage controls remain to be completed."
      links={[{ href: '/legal', title: 'Legal' }, { href: '/settings/data', title: 'Data settings' }]}
    />
  );
}
