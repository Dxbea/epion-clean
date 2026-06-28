import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Badge } from './Badge';
import { FontSize, Radius, Spacing } from '@/constants/theme';

type ArticleCardProps = {
  title: string;
  excerpt?: string;
  category?: string;
  date?: string;
  views?: number;
  compact?: boolean;
  onPress?: () => void;
};

export function ArticleCard({ title, excerpt, category, date, views, compact = false, onPress }: ArticleCardProps) {
  const colors = useTheme();

  if (compact) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.compactCard,
          { backgroundColor: colors.backgroundElevated, borderColor: colors.borderSubtle },
          pressed ? styles.pressed : null,
        ]}
        onPress={onPress}
      >
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
        styles.card,
        { backgroundColor: colors.backgroundElevated, borderColor: colors.borderSubtle },
        pressed ? styles.pressed : null,
      ]}
      onPress={onPress}
    >
      <View style={styles.body}>
        {category ? <Badge label={category} variant="category" category={category} style={styles.badge} /> : null}
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {excerpt ? (
          <Text style={[styles.excerpt, { color: colors.textSecondary }]} numberOfLines={3}>{excerpt}</Text>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  body: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  badge: {
    marginBottom: 2,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    lineHeight: 23,
  },
  excerpt: {
    fontSize: FontSize.base,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 2,
  },
  meta: {
    fontSize: FontSize.sm,
  },
  compactCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  compactContent: {
    gap: 4,
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
