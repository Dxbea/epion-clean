import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

type TabIconProps = {
  color: ColorValue;
};

function TabIcon({ color, children }: TabIconProps & { children: string }) {
  return <Text style={{ color, fontSize: 20, fontWeight: '800' }}>{children}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="news"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#6B7280',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E7EB',
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
      }}>
      <Tabs.Screen
        name="news"
        options={{
          title: 'News',
          tabBarIcon: ({ color }) => <TabIcon color={color}>N</TabIcon>,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color }) => <TabIcon color={color}>C</TabIcon>,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          tabBarIcon: ({ color }) => <TabIcon color={color}>S</TabIcon>,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color }) => <TabIcon color={color}>A</TabIcon>,
        }}
      />
    </Tabs>
  );
}
