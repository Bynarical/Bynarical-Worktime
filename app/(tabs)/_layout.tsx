import React from 'react';
import { Text, View, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@/lib/theme';

function Icon({ emoji, focused }: { emoji: string; focused: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: 44,
        height: 30,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? t.primarySoft : 'transparent',
      }}
    >
      <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
        tabBarStyle: {
          backgroundColor: t.card,
          borderTopColor: t.border,
          borderTopWidth: 1,
          height: Platform.OS === 'web' ? 64 : undefined,
          paddingTop: 6,
        },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '오늘', tabBarIcon: ({ focused }) => <Icon emoji="🕒" focused={focused} /> }} />
      <Tabs.Screen name="history" options={{ title: '이력', tabBarIcon: ({ focused }) => <Icon emoji="📊" focused={focused} /> }} />
      <Tabs.Screen name="leave" options={{ title: '연차', tabBarIcon: ({ focused }) => <Icon emoji="🌴" focused={focused} /> }} />
      <Tabs.Screen name="settings" options={{ title: '설정', tabBarIcon: ({ focused }) => <Icon emoji="⚙️" focused={focused} /> }} />
    </Tabs>
  );
}
