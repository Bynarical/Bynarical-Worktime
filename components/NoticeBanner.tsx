import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { dateKey } from '@/lib/time';
import { NOTICE_UNTIL } from '@/lib/config';
import { HelpManual } from './HelpManual';

// 근태 안내사항을 일정 기간(NOTICE_UNTIL까지) 모든 사용자에게 부드럽게 안내하는 하단 배너.
// 화면을 막지 않으며(비침습), 이번 세션에 닫으면 사라지고 다음 접속 때 다시 표시된다.
export function NoticeBanner() {
  const s = useStore();
  const t = useTheme();
  const [dismissed, setDismissed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  if (!s.authed) return null;
  const expired = dateKey() > NOTICE_UNTIL;
  if (expired) return null;

  return (
    <>
      {!dismissed && !showHelp && (
        <View
          style={{ position: 'absolute', left: 12, right: 12, bottom: 80, alignItems: 'center', zIndex: 9998 }}
          pointerEvents="box-none"
        >
          <View
            style={{
              width: '100%',
              maxWidth: 460,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: t.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: t.primary,
              paddingVertical: 11,
              paddingHorizontal: 14,
              ...t.shadowSm,
            }}
          >
            <Text style={{ flex: 1, color: t.text, fontSize: 13, fontWeight: '600' }}>
              📋 근태 관련 안내사항이 있어요. 한 번 확인해 주세요.
            </Text>
            <Pressable
              onPress={() => setShowHelp(true)}
              style={{ backgroundColor: t.primary, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 12 }}
            >
              <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>확인</Text>
            </Pressable>
            <Pressable onPress={() => setDismissed(true)} hitSlop={8}>
              <Text style={{ color: t.textDim, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
        </View>
      )}
      {showHelp && <HelpManual onClose={() => setShowHelp(false)} />}
    </>
  );
}
