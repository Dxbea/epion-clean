import { StyleSheet, Text, type TextStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { CategoryColors, FontSize, Radius, Spacing } from '@/constants/theme';

type BadgeVariant = 'default' | 'category';
type BadgeSize = 'sm' | 'md';

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  category?: string;
  style?: TextStyle;
};

export function Badge({ label, variant = 'default', size = 'sm', category, style }: BadgeProps) {
  const colors = useTheme();

  let bg = colors.backgroundSubtle;
  let fg = colors.textTertiary;

  if (variant === 'category' && category) {
    const slug = category.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const cat = CategoryColors[slug];
    if (cat) {
      bg = cat.bg;
      fg = cat.text;
    }
  }

  const sizeValues = size === 'sm'
    ? { paddingH: Spacing.sm, paddingV: 3, fontSize: FontSize.xs }
    : { paddingH: 10, paddingV: Spacing.xs, fontSize: FontSize.sm };

  return (
    <Text
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          color: fg,
          paddingHorizontal: sizeValues.paddingH,
          paddingVertical: sizeValues.paddingV,
          fontSize: sizeValues.fontSize,
        },
        style,
      ]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: Radius.full,
    fontWeight: '500',
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
});
