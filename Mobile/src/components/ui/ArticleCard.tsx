import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { resolveArticleImageUrl } from '@/lib/article-images';
import { Badge } from './Badge';

type ArticleCardProps = {
  title: string;
  excerpt?: string;
  category?: string;
  imageUrl?: string;
  date?: string;
  views?: number;
  compact?: boolean;
  hero?: boolean;
  onPress?: () => void;
};

export function ArticleCard({ title, excerpt, category, imageUrl, date, views, compact = false, hero = false, onPress }: ArticleCardProps) {
  const colors = useTheme();
  const source = resolveArticleImageUrl({ imageUrl, category, title });

  if (compact) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.compactCard,
          { backgroundColor: colors.backgroundElevated, borderColor: colors.border, shadowColor: colors.shadow },
          pressed ? styles.pressed : null,
        ]}
        onPress={onPress}
      >
        <Image source={{ uri: source }} style={[styles.compactImage, { backgroundColor: colors.imagePlaceholder }]} contentFit="cover" transition={180} />
        <View style={styles.compactContent}>
          {category ? <Badge label={category} variant="category" category={category} /> : null}
          <Text style={[styles.compactTitle, { color: colors.text }]} numberOfLines={2}>{title}</Text>
          <View style={styles.metaRow}>
            {date ? <Text style={[styles.meta, { color: colors.textMuted }]}>{date}</Text> : null}
            {typeof views === 'number' ? <Text style={[styles.meta, { color: colors.textMuted }]}>{views} vues</Text> : null}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        hero ? styles.heroCard : styles.card,
        { backgroundColor: colors.backgroundElevated, borderColor: colors.border, shadowColor: colors.shadow },
        pressed ? styles.pressed : null,
      ]}
      onPress={onPress}
    >
      <Image source={{ uri: source }} style={[hero ? styles.heroImage : styles.image, { backgroundColor: colors.imagePlaceholder }]} contentFit="cover" transition={180} />
      <View style={hero ? styles.heroBody : styles.body}>
        {category ? <Badge label={category} variant="category" category={category} style={styles.badge} /> : null}
        <Text style={[hero ? styles.heroTitle : styles.title, { color: colors.text }]}>{title}</Text>
        {excerpt ? (
          <Text style={[styles.excerpt, { color: colors.textSecondary }]} numberOfLines={hero ? 4 : 2}>{excerpt}</Text>
        ) : null}
        <View style={styles.metaRow}>
          {date ? <Text style={[styles.meta, { color: colors.textMuted }]}>{date}</Text> : null}
          {typeof views === 'number' ? <Text style={[styles.meta, { color: colors.textMuted }]}>{views} vues</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    elevation: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  heroCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    elevation: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  image: {
    aspectRatio: 16 / 9,
    backgroundColor: '#F3F4F6',
    width: '100%',
  },
  heroImage: {
    backgroundColor: '#F3F4F6',
    height: 224,
    width: '100%',
  },
  body: {
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  heroBody: {
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  badge: {
    marginBottom: 2,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    lineHeight: 23,
  },
  heroTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: '700',
    lineHeight: 30,
  },
  excerpt: {
    fontSize: FontSize.base,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: 2,
  },
  meta: {
    fontSize: FontSize.sm,
  },
  compactCard: {
    alignItems: 'stretch',
    borderRadius: Radius.xl,
    borderWidth: 1,
    elevation: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    overflow: 'hidden',
    padding: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  compactImage: {
    alignSelf: 'stretch',
    backgroundColor: '#F3F4F6',
    borderRadius: Radius.lg,
    minHeight: 86,
    width: 112,
  },
  compactContent: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  compactTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.85,
  },
});