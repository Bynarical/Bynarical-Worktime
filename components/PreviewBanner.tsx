import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

// 관리자가 직원 화면을 미리보는 동안 맨 위에 고정 — 지금 누구 화면인지, 저장되지 않는다는 것, 돌아가는 버튼.
export function PreviewBanner() {
  const s = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  if (!s.previewAs) return null;

  async function back() {
    setBusy(true);
    await s.stopPreview();
    setBusy(false);
  }

  return (
    <View
      style={{
        backgroundColor: t.warning,
        paddingTop: insets.top + 8,
        paddingBottom: 8,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>👀 {s.user?.name}님 화면 미리보기</Text>
        <Text style={{ color: '#fff', fontSize: 11.5, opacity: 0.9 }}>여기서 누른 출퇴근·휴가 신청·서명은 저장되지 않습니다.</Text>
      </View>
      <Pressable
        onPress={busy ? undefined : back}
        hitSlop={8}
        style={({ pressed }) => ({
          backgroundColor: 'rgba(255,255,255,0.22)',
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 7,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12.5 }}>관리자로 돌아가기</Text>
        )}
      </Pressable>
    </View>
  );
}
