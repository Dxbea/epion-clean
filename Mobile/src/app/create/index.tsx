import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function CreateArticleScreen() {
  return (
    <PlaceholderScreen
      title="Create"
      subtitle="Creation d'article Epion."
      status="Placeholder: la generation et l'edition d'article restent cote web pour cette premiere version mobile."
      links={[{ href: '/news', title: 'Retour aux news' }]}
    />
  );
}
