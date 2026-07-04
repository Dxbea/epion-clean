import { Link, type Href } from 'expo-router';
import { Bell, ChevronRight, Database, Eye, Lock, Palette, Shield, UserCircle } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen, StateBox } from '@/components/screen';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';

type SettingsIcon = typeof UserCircle;

type SettingsCategory = {
  href: Href;
  title: string;
  description: string;
  icon: SettingsIcon;
};

const signedInCategories = [
  { href: '/settings/account' as Href, title: 'Account', description: 'Profil, email et acces au compte.', icon: UserCircle },
  { href: '/settings/security' as Href, title: 'Security', description: 'Mot de passe et sessions actives.', icon: Shield },
  { href: '/settings/privacy' as Href, title: 'Privacy', description: 'Visibilite et preferences de suivi.', icon: Lock },
  { href: '/settings/data' as Href, title: 'Data', description: 'Export et donnees locales.', icon: Database },
  { href: '/settings/appearance' as Href, title: 'Appearance', description: 'Theme et affichage mobile.', icon: Palette },
  { href: '/settings/notifications' as Href, title: 'Notifications', description: 'Preferences email et push.', icon: Bell },
  { href: '/settings/accessibility' as Href, title: 'Accessibility', description: 'Contraste et confort de lecture.', icon: Eye },
] as const satisfies readonly SettingsCategory[];

export default function SettingsScreen() {
  const { user, loading } = useAuth();
  const categories = user ? signedInCategories : signedInCategories.slice(0, 1);

  return (
    <Screen title="Settings" subtitle="Reglages, securite et preferences du compte Epion.">
      {loading ? <StateBox title="Verification de la session..." /> : null}
      {!user ? <StateBox title="Non connecte" text="Comme sur le web, seule la section Account est disponible sans session." /> : null}

      <View style={styles.categoryList}>
        {categories.map((category) => (
          <SettingsCategoryLink key={category.title} category={category} />
        ))}
      </View>
    </Screen>
  );
}

function SettingsCategoryLink({ category }: { category: SettingsCategory }) {
  const colors = useTheme();
  const Icon = category.icon;

  return (
    <Link href={category.href} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.categoryCard,
          { backgroundColor: colors.scheme === 'dark' ? colors.backgroundElevated : '#FFFFFF', borderColor: colors.border, shadowColor: colors.shadow },
          pressed ? styles.pressed : null,
        ]}
      >
        <View style={styles.cardRow}>
          <View style={[styles.iconWrap, { backgroundColor: colors.backgroundSubtle, borderColor: colors.borderSubtle }]}>
            <Icon size={21} color={colors.text} strokeWidth={2} />
          </View>
          <View style={styles.categoryCopy}>
            <Text numberOfLines={1} style={[styles.categoryTitle, { color: colors.text }]}>{category.title}</Text>
            <Text numberOfLines={2} style={[styles.categoryDescription, { color: colors.textSecondary }]}>{category.description}</Text>
          </View>
          <View style={[styles.chevronWrap, { backgroundColor: colors.backgroundSubtle, borderColor: colors.borderSubtle }]}>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={2.2} />
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  categoryList: {
    gap: Spacing.xl,
  },
  categoryCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    minHeight: 90,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    width: '100%',
  },
  cardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: Spacing.md,
    minHeight: 62,
    width: '100%',
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    flexShrink: 0,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  categoryCopy: {
    flex: 1,
    gap: Spacing.xs,
    minWidth: 0,
  },
  categoryTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    lineHeight: 22,
  },
  categoryDescription: {
    fontSize: FontSize.base,
    lineHeight: 20,
  },
  chevronWrap: {
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    flexShrink: 0,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
});
