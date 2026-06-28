import { StaticInfoScreen } from '@/components/static-info-screen';

export default function TransparencyScreen() {
  return (
    <StaticInfoScreen
      title="Our transparency"
      subtitle="How we source, rank and fund."
      sections={[
        {
          title: 'Sources',
          paragraphs: ['Sources: reputable outlets and verified feeds.'],
        },
        {
          title: 'Funding',
          paragraphs: ['Funding: currently self-funded; details soon.'],
        },
      ]}
      note="The web page only contains these high-level transparency blocks for now."
      links={[{ href: '/about', title: 'About Epion' }]}
    />
  );
}
