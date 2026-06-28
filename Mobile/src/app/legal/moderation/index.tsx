import { StaticInfoScreen } from '@/components/static-info-screen';

export default function ModerationScreen() {
  return (
    <StaticInfoScreen
      title="Moderation policy"
      subtitle="Clear rules to keep conversations constructive."
      sections={[
        {
          title: 'Policy status',
          paragraphs: ['High-level rules placeholder. Full policy soon.'],
        },
      ]}
      note="The web page is still a short provisional moderation policy, so the mobile version does not invent detailed rules."
      links={[{ href: '/legal', title: 'Legal' }]}
    />
  );
}
