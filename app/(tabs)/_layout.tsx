import React from 'react';
import { Text, ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@/lib/theme';

function Icon({ emoji, color }: { emoji: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTitleStyle: { color: t.text, fontWeight: '800' },
        headerShadowVisible: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textFaint,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: '오늘', tabBarIcon: ({ color }) => <Icon emoji="🕒" color={color} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: '이력', tabBarIcon: ({ color }) => <Icon emoji="📋" color={color} /> }}
      />
      <Tabs.Screen
        name="leave"
        options={{ title: '연차', tabBarIcon: ({ color }) => <Icon emoji="🌴" color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: '설정', tabBarIcon: ({ color }) => <Icon emoji="⚙️" color={color} /> }}
      />
    </Tabs>
  );
}
