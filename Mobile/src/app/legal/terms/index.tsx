import { StaticInfoScreen } from '@/components/static-info-screen';

export default function TermsScreen() {
  return (
    <StaticInfoScreen
      title="Terms of Service"
      subtitle="Terms that apply when using Epion."
      sections={[
        {
          title: 'Use of Epion',
          paragraphs: [
            'By using Epion, you agree to our terms and conditions. Please read them carefully.',
            'These terms apply to all users of Epion, including those accessing via web or mobile.',
          ],
        },
      ]}
      links={[{ href: '/legal', title: 'Legal' }, { href: '/legal/privacy', title: 'Privacy' }]}
    />
  );
}
