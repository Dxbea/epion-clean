import { Colors, type ThemeColors } from '@/constants/theme';
import { useSettingsPreferences } from '@/context/SettingsPreferencesContext';

export function useTheme(): ThemeColors {
  const { effectiveTheme, accessibility } = useSettingsPreferences();
  const base = Colors[effectiveTheme];

  if (!accessibility.contrast) {
    return base;
  }

  return {
    ...base,
    textSecondary: effectiveTheme === 'dark' ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.9)',
    textTertiary: effectiveTheme === 'dark' ? '#D4D4D4' : '#262626',
    textMuted: effectiveTheme === 'dark' ? '#BDBDBD' : '#404040',
    border: effectiveTheme === 'dark' ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.24)',
    borderSubtle: effectiveTheme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)',
  };
}