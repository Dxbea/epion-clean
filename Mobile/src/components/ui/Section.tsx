import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Fonts, FontSize, Spacing } from '@/constants/theme';

type SectionProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
};

export function Section({ title, subtitle, actionLabel, onAction, children }: SectionProps) {
  const colors = useTheme();

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, { color: colors.text, fontFamily: Fonts.display }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8} style={[styles.actionPill, { borderColor: colors.border }]}>
            <Text style={[styles.actionText, { color: colors.text }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.md,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: '500',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: FontSize.sm,
  },
  actionPill: {
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  actionText: {
    fontSize: FontSize.base,
    fontWeight: '500',
  },
});
