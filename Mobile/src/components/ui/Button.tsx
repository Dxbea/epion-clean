import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, Radius, Spacing } from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  rounded?: boolean;
  style?: ViewStyle;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  rounded = false,
  style,
}: ButtonProps) {
  const colors = useTheme();

  const variants = {
    primary: {
      bg: colors.primary,
      text: colors.background,
      border: colors.primary,
    },
    secondary: {
      bg: colors.backgroundElevated,
      text: colors.text,
      border: colors.border,
    },
    ghost: {
      bg: 'transparent',
      text: colors.text,
      border: 'transparent',
    },
  } as const;

  const sizes = {
    sm: { paddingH: Spacing.md, paddingV: 6, fontSize: FontSize.xs },
    md: { paddingH: Spacing.lg, paddingV: 10, fontSize: FontSize.base },
    lg: { paddingH: Spacing['2xl'], paddingV: Spacing.md, fontSize: FontSize.md },
  } as const;

  const v = variants[variant];
  const s = sizes[size];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          paddingHorizontal: s.paddingH,
          paddingVertical: s.paddingV,
          borderRadius: rounded ? Radius.full : Radius.lg,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        <Text style={[styles.text, { color: v.text, fontSize: s.fontSize }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  text: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
