import { StaticInfoScreen } from '@/components/static-info-screen';

export default function LegalScreen() {
  return (
    <StaticInfoScreen
      title="Legal Notice"
      subtitle="Mandatory legal information for Epion."
      sections={[
        {
          title: 'Legal notice',
          paragraphs: [
            'Epion is provided as-is. This page contains the mandatory legal mentions.',
            'Company name, contact email, and registered address should be listed here.',
          ],
        },
      ]}
      note="The web page still asks for company name, contact email and registered address."
      links={[
        { href: '/legal/privacy', title: 'Privacy' },
        { href: '/legal/terms', title: 'Terms' },
        { href: '/legal/cookies', title: 'Cookies' },
        { href: '/legal/moderation', title: 'Moderation' },
      ]}
    />
  );
}