import { StaticInfoScreen } from '@/components/static-info-screen';

export default function GuideScreen() {
  return (
    <StaticInfoScreen
      title="User guide"
      subtitle="How to get the most from Epion."
      sections={[
        {
          title: 'Read clearly',
          paragraphs: ['Search and read articles with clear sections.'],
        },
        {
          title: 'Ask with sources',
          paragraphs: ['Ask Epion in chat for summaries and sources.'],
        },
      ]}
      links={[
        { href: '/news', title: 'News' },
        { href: '/chat', title: 'Chat' },
      ]}
    />
  );
}
