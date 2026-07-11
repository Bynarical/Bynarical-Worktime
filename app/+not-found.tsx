import React from 'react';
import { View, Text } from 'react-native';
import { Link, Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

export default function NotFound() {
  const t = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: '페이지 없음' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, gap: 12 }}>
        <Text style={{ fontSize: 40 }}>🕒</Text>
        <Text style={{ color: t.text, fontSize: 16 }}>페이지를 찾을 수 없습니다.</Text>
        <Link href="/(tabs)" style={{ color: t.primary, fontWeight: '700' }}>
          홈으로 이동
        </Link>
      </View>
    </>
  );
}
