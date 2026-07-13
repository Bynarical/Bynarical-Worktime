import React from 'react';
import { Text, View, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useStore } from '@/lib/store';

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

export default function AdminLayout() {
  const t = useTheme();
  const s = useStore();
  // 승인 대기(복귀 전 외출 제외) 건수 — 탭 배지
  const pendingCount = s.leaves.filter(
    (l) => l.status === 'REQUESTED' && !(l.segment === 'CUSTOM' && !l.endTime)
  ).length;
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
      <Tabs.Screen name="index" options={{ title: '대시보드', tabBarIcon: ({ focused }) => <Icon emoji="📋" focused={focused} /> }} />
      <Tabs.Screen name="employees" options={{ title: '직원관리', tabBarIcon: ({ focused }) => <Icon emoji="👥" focused={focused} /> }} />
      <Tabs.Screen name="approvals" options={{ title: '승인·근태', tabBarBadge: pendingCount > 0 ? pendingCount : undefined, tabBarIcon: ({ focused }) => <Icon emoji="✅" focused={focused} /> }} />
      <Tabs.Screen name="settings" options={{ title: '설정', tabBarIcon: ({ focused }) => <Icon emoji="⚙️" focused={focused} /> }} />
    </Tabs>
  );
}
