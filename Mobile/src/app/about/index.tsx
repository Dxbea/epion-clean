import { StaticInfoScreen } from '@/components/static-info-screen';

export default function AboutScreen() {
  return (
    <StaticInfoScreen
      title="About Epion"
      subtitle="Verify, understand and discuss information."
      sections={[
        {
          title: 'Mission',
          paragraphs: [
            'Epion is an AI-powered platform designed to help you verify, understand, and discuss information quickly and clearly.',
            'Our mission is to make information more accessible and reliable for everyone.',
          ],
        },
      ]}
      links={[
        { href: '/guide', title: 'User guide', description: 'How to get the most from Epion.' },
        { href: '/transparency', title: 'Transparency', description: 'How sources, ranking and funding are presented.' },
      ]}
    />
  );
}
