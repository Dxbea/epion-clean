import { useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentType } from 'react';
import { Tabs, usePathname, useRouter, type Href } from 'expo-router';
import { MessageCircle, Newspaper, Settings, UserCircle, type LucideProps } from 'lucide-react-native';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabsProps = ComponentProps<typeof Tabs>;
type TabBarProps = Parameters<NonNullable<TabsProps['tabBar']>>[0];

type NavItem = {
  name: string;
  href: Href;
  label: string;
  icon: ComponentType<LucideProps>;
  isActive: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    name: 'news',
    href: '/news',
    label: 'Actualités',
    icon: Newspaper,
    isActive: (path) =>
      path === '/saved' ||
      path.startsWith('/news') ||
      path.startsWith('/article') ||
      path.startsWith('/create'),
  },
  {
    name: 'chat',
    href: '/chat',
    label: 'Chat',
    icon: MessageCircle,
    isActive: (path) => path.startsWith('/chat'),
  },
  {
    name: 'account',
    href: '/account',
    label: 'Compte',
    icon: UserCircle,
    isActive: (path) =>
      path.startsWith('/account') ||
      path.startsWith('/activity') ||
      path.startsWith('/u/'),
  },
  {
    name: 'settings',
    href: '/settings',
    label: 'Paramètres',
    icon: Settings,
    isActive: (path) =>
      path.startsWith('/settings') ||
      path.startsWith('/reset-password') ||
      path.startsWith('/verify-email'),
  },
];

function WebLikeTabBar({ navigation, state }: TabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const activeIndex = Math.max(0, NAV_ITEMS.findIndex((item) => item.isActive(pathname)));
  const itemWidth = trackWidth > 8 ? (trackWidth - 8) / NAV_ITEMS.length : 0;
  const capsuleX = useRef(new Animated.Value(0)).current;
  const dragStartX = useRef(0);

  const navigateToIndex = (index: number) => {
    const item = NAV_ITEMS[index];
    if (!item) return;

    const route = state.routes.find((tabRoute) => tabRoute.name === item.name);
    const event = navigation.emit({
      type: 'tabPress',
      target: route?.key ?? item.name,
      canPreventDefault: true,
    });

    if (!item.isActive(pathname) && !event.defaultPrevented) {
      router.push(item.href);
    }
  };

  const springCapsuleTo = (index: number) => {
    if (!itemWidth) return;
    Animated.spring(capsuleX, {
      toValue: index * itemWidth,
      useNativeDriver: true,
      damping: 22,
      stiffness: 260,
      mass: 0.8,
    }).start();
  };

  useEffect(() => {
    springCapsuleTo(activeIndex);
  }, [activeIndex, itemWidth]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          itemWidth > 0 && Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.4,
        onPanResponderGrant: () => {
          dragStartX.current = activeIndex * itemWidth;
          capsuleX.stopAnimation();
        },
        onPanResponderMove: (_event, gestureState) => {
          const maxX = itemWidth * (NAV_ITEMS.length - 1);
          const nextX = Math.max(0, Math.min(maxX, dragStartX.current + gestureState.dx));
          capsuleX.setValue(nextX);
        },
        onPanResponderRelease: (_event, gestureState) => {
          const maxIndex = NAV_ITEMS.length - 1;
          const targetIndex = Math.max(0, Math.min(maxIndex, Math.round((dragStartX.current + gestureState.dx) / itemWidth)));
          navigateToIndex(targetIndex);
          springCapsuleTo(targetIndex);
        },
        onPanResponderTerminate: () => springCapsuleTo(activeIndex),
      }),
    [activeIndex, itemWidth, navigation, pathname, router, state.routes],
  );

  return (
    <View style={[styles.tabBarShell, { backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }]}>
      <View
        {...panResponder.panHandlers}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        style={[styles.tabBarTrack, { backgroundColor: colors.tabBarBackground, borderColor: colors.border, shadowColor: colors.shadow }]}
      >
        {itemWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabBarCapsule,
              {
                backgroundColor: colors.tabBarActive,
                transform: [{ translateX: capsuleX }],
                width: itemWidth,
              },
            ]}
          />
        ) : null}
        {NAV_ITEMS.map((item, index) => {
          const active = item.isActive(pathname);
          const Icon = item.icon;

          return (
            <Pressable
              key={item.name}
              accessibilityRole="tab"
              accessibilityState={active ? { selected: true } : undefined}
              accessibilityLabel={item.label}
              onPress={() => navigateToIndex(index)}
              style={({ pressed }) => [
                styles.tabBarItem,
                pressed && !active ? { backgroundColor: colors.tabBarPressed } : null,
              ]}
            >
              <Icon
                size={20}
                color={active ? colors.text : colors.textMuted}
                strokeWidth={active ? 2.4 : 2}
                opacity={active ? 1 : 0.72}
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={[styles.tabBarLabel, { color: active ? colors.text : colors.textMuted }]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="news"
      tabBar={(props) => <WebLikeTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen
        name="news"
        options={{
          title: 'Actualités',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          href: null,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Compte',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Paramètres',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarShell: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  tabBarTrack: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(0,0,0,0.10)',
    borderRadius: 999,
    borderWidth: 1,
    elevation: 12,
    flexDirection: 'row',
    maxWidth: 416,
    minHeight: 64,
    padding: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 34,
    width: '92%',
  },
  tabBarCapsule: {
    bottom: 4,
    borderRadius: 999,
    left: 4,
    position: 'absolute',
    top: 4,
  },
  tabBarItem: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 6,
    paddingVertical: 8,
    zIndex: 1,
  },
  tabBarItemActive: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  tabBarItemPressed: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 13,
    maxWidth: '100%',
  },
});
