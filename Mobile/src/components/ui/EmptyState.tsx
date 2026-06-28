import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Button } from './Button';
import { FontSize, Radius, Spacing } from '@/constants/theme';

type EmptyStateProps = {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  const colors = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundSubtle, borderColor: colors.borderSubtle }]}>
      {title ? <Text style={[styles.title, { color: colors.textTertiary }]}>{title}</Text> : null}
      {message ? <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="secondary" size="sm" rounded style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: Radius.xl,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: Spacing['3xl'],
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '500',
    textAlign: 'center',
  },
  message: {
    fontSize: FontSize.base,
    lineHeight: 20,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing.lg,
  },
});
