import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from '@/hooks/use-color-scheme';

export type ThemePreference = 'system' | 'light' | 'dark';
export type VisibilityPreference = 'public' | 'private';

export type NotificationPreferences = {
  emailNews: boolean;
  emailMentions: boolean;
  pushAll: boolean;
};

export type PrivacyPreferences = {
  profileVisibility: VisibilityPreference;
  tracking: boolean;
};

export type AccessibilityPreferences = {
  contrast: boolean;
};

type SettingsPreferencesValue = {
  themePreference: ThemePreference;
  setThemePreference: (value: ThemePreference) => void;
  effectiveTheme: 'light' | 'dark';
  privacy: PrivacyPreferences;
  setPrivacy: (value: PrivacyPreferences) => void;
  notifications: NotificationPreferences;
  setNotifications: (value: NotificationPreferences) => void;
  accessibility: AccessibilityPreferences;
  setAccessibility: (value: AccessibilityPreferences) => void;
  resetLocalPreferences: () => void;
  exportLocalPreferences: () => Record<string, unknown>;
};

const defaultPrivacy: PrivacyPreferences = { profileVisibility: 'public', tracking: false };
const defaultNotifications: NotificationPreferences = { emailNews: true, emailMentions: false, pushAll: false };
const defaultAccessibility: AccessibilityPreferences = { contrast: false };

const SettingsPreferencesContext = createContext<SettingsPreferencesValue | null>(null);

export function SettingsPreferencesProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [privacy, setPrivacy] = useState<PrivacyPreferences>(defaultPrivacy);
  const [notifications, setNotifications] = useState<NotificationPreferences>(defaultNotifications);
  const [accessibility, setAccessibility] = useState<AccessibilityPreferences>(defaultAccessibility);

  const effectiveTheme = themePreference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themePreference;

  const value = useMemo<SettingsPreferencesValue>(() => ({
    themePreference,
    setThemePreference,
    effectiveTheme,
    privacy,
    setPrivacy,
    notifications,
    setNotifications,
    accessibility,
    setAccessibility,
    resetLocalPreferences: () => {
      setThemePreference('system');
      setPrivacy(defaultPrivacy);
      setNotifications(defaultNotifications);
      setAccessibility(defaultAccessibility);
    },
    exportLocalPreferences: () => ({
      privacy,
      notifications,
      theme: themePreference,
      a11y: accessibility,
      exportedAt: new Date().toISOString(),
    }),
  }), [accessibility, notifications, privacy, themePreference, effectiveTheme]);

  return <SettingsPreferencesContext.Provider value={value}>{children}</SettingsPreferencesContext.Provider>;
}

export function useSettingsPreferences() {
  const context = useContext(SettingsPreferencesContext);
  if (!context) {
    return {
      themePreference: 'system' as ThemePreference,
      setThemePreference: () => {},
      effectiveTheme: 'light' as const,
      privacy: defaultPrivacy,
      setPrivacy: () => {},
      notifications: defaultNotifications,
      setNotifications: () => {},
      accessibility: defaultAccessibility,
      setAccessibility: () => {},
      resetLocalPreferences: () => {},
      exportLocalPreferences: () => ({
        privacy: defaultPrivacy,
        notifications: defaultNotifications,
        theme: 'system',
        a11y: defaultAccessibility,
        exportedAt: new Date().toISOString(),
      }),
    } satisfies SettingsPreferencesValue;
  }
  return context;
}