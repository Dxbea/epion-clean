import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function HelpScreen() {
  return <PlaceholderScreen title="Help" subtitle="Aide et support." status="Placeholder: aide mobile de premier niveau." links={[{ href: '/news', title: 'News' }]} />;
}
