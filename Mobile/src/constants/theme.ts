import { Platform } from 'react-native';

export const Brand = {
  blue: '#2563EB',
  blueDeep: '#1D4ED8',
  lightBlue: '#85CCFF',
  indigo: '#222C66',
  turquoise: '#38A6A6',
  turquoiseLight: '#58C6C6',
  cyan: '#78DCE3',
  lime: '#CBEA62',
  limeLight: '#B7E87C',
  white: '#FAFAF5',
  black: '#000000',
} as const;

export type ThemeColors = {
  text: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  background: string;
  backgroundElevated: string;
  backgroundSubtle: string;
  border: string;
  borderSubtle: string;
  primary: string;
  accent: string;
  error: string;
  errorBackground: string;
  success: string;
};

export const Colors: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    text: '#000000',
    textSecondary: 'rgba(0,0,0,0.8)',
    textTertiary: '#525252',
    textMuted: '#737373',
    background: '#FAFAF5',
    backgroundElevated: '#FFFFFF',
    backgroundSubtle: 'rgba(0,0,0,0.02)',
    border: 'rgba(0,0,0,0.10)',
    borderSubtle: 'rgba(0,0,0,0.05)',
    primary: '#000000',
    accent: Brand.blue,
    error: '#DC2626',
    errorBackground: '#FEF2F2',
    success: '#059669',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.8)',
    textTertiary: '#A3A3A3',
    textMuted: '#737373',
    background: '#0A0A0A',
    backgroundElevated: '#0A0A0A',
    backgroundSubtle: 'rgba(255,255,255,0.02)',
    border: 'rgba(255,255,255,0.10)',
    borderSubtle: 'rgba(255,255,255,0.05)',
    primary: '#FFFFFF',
    accent: '#60A5FA',
    error: '#EF4444',
    errorBackground: 'rgba(127,29,29,0.2)',
    success: '#34D399',
  },
};

export type ThemeColor = keyof ThemeColors;

export const CategoryColors: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  monde: { bg: '#E0E7FF', text: '#3730A3', darkBg: 'rgba(99,102,241,0.15)', darkText: '#A5B4FC' },
  politique: { bg: '#F1F5F9', text: '#1E293B', darkBg: 'rgba(100,116,139,0.15)', darkText: '#CBD5E1' },
  économie: { bg: '#DBEAFE', text: '#1E40AF', darkBg: 'rgba(59,130,246,0.15)', darkText: '#93C5FD' },
  economie: { bg: '#DBEAFE', text: '#1E40AF', darkBg: 'rgba(59,130,246,0.15)', darkText: '#93C5FD' },
  société: { bg: '#FEF3C7', text: '#92400E', darkBg: 'rgba(245,158,11,0.15)', darkText: '#FCD34D' },
  societe: { bg: '#FEF3C7', text: '#92400E', darkBg: 'rgba(245,158,11,0.15)', darkText: '#FCD34D' },
  tech: { bg: '#EDE9FE', text: '#5B21B6', darkBg: 'rgba(139,92,246,0.15)', darkText: '#C4B5FD' },
  sciences: { bg: '#FAE8FF', text: '#86198F', darkBg: 'rgba(217,70,239,0.15)', darkText: '#F0ABFC' },
  santé: { bg: '#CCFBF1', text: '#115E59', darkBg: 'rgba(20,184,166,0.15)', darkText: '#5EEAD4' },
  sante: { bg: '#CCFBF1', text: '#115E59', darkBg: 'rgba(20,184,166,0.15)', darkText: '#5EEAD4' },
  environnement: { bg: '#D1FAE5', text: '#065F46', darkBg: 'rgba(16,185,129,0.15)', darkText: '#6EE7B7' },
  culture: { bg: '#FFE4E6', text: '#9F1239', darkBg: 'rgba(244,63,94,0.15)', darkText: '#FDA4AF' },
  sport: { bg: '#FFEDD5', text: '#9A3412', darkBg: 'rgba(249,115,22,0.15)', darkText: '#FDBA74' },
  lifestyle: { bg: '#CFFAFE', text: '#155E75', darkBg: 'rgba(6,182,212,0.15)', darkText: '#67E8F9' },
  insolite: { bg: '#FEF9C3', text: '#854D0E', darkBg: 'rgba(234,179,8,0.15)', darkText: '#FDE047' },
};

export const Fonts = Platform.select({
  ios: {
    display: 'Georgia' as string,
    body: 'system-ui' as string,
    mono: 'ui-monospace' as string,
  },
  default: {
    display: 'serif' as string,
    body: 'normal' as string,
    mono: 'monospace' as string,
  },
  web: {
    display: 'var(--font-display)' as string,
    body: 'var(--font-body)' as string,
    mono: 'var(--font-mono)' as string,
  },
})!;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
} as const;

export const Radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 14,
  md: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 34,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
