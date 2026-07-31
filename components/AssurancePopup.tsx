import React, { useEffect, useState } from 'react';
import { Modal, View, Text } from 'react-native';
import { Card, Button, Body, Muted, Divider } from './ui';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { getItem, setItem } from '@/lib/storage';
import { dateKey } from '@/lib/time';
import { STORAGE_KEYS, ASSURANCE_NOTICE_ID, ASSURANCE_NOTICE_UNTIL } from '@/lib/config';

// 직원 "안심" 팝업 공지: 주간 확인·서명을 하면 그 주 기록이 잠겨 관리자도 못 바꾼다는 안내.
// - 직원(비관리자)만, 온보딩(비번변경) 완료 후에만 노출 → 첫 로그인 모달과 겹치지 않음.
// - 기기별 1회(확인하면 공지 ID 저장), 종료일 이후엔 신규 노출 없음(일시적).
export function AssurancePopup() {
  const s = useStore();
  const t = useTheme();
  const [show, setShow] = useState(false);

  const eligible =
    s.authed && !s.user?.isAdmin && s.passwordChanged && dateKey() <= ASSURANCE_NOTICE_UNTIL;

  useEffect(() => {
    let alive = true;
    if (!eligible) {
      setShow(false);
      return;
    }
    (async () => {
      const seen = await getItem<string>(STORAGE_KEYS.ASSURANCE_SEEN);
      if (alive && seen !== ASSURANCE_NOTICE_ID) setShow(true);
    })();
    return () => {
      alive = false;
    };
  }, [eligible]);

  if (!eligible || !show) return null;

  async function done() {
    await setItem(STORAGE_KEYS.ASSURANCE_SEEN, ASSURANCE_NOTICE_ID);
    setShow(false);
  }

  const bold = { fontWeight: '800' as const, color: t.text };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={done}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>
          <Card style={{ borderColor: t.success, borderWidth: 1 }}>
            <Body style={{ fontWeight: '800', fontSize: 17 }}>🔒 내 출퇴근부는 내가 지킵니다</Body>
            <Divider />
            <Muted size={13} style={{ lineHeight: 20 }}>
              이제 <Text style={bold}>[이력] 탭에서 지난 주를 확인·서명</Text>하면 그 주의 출퇴근·연차 기록이{' '}
              <Text style={bold}>잠깁니다.</Text>
            </Muted>
            <Muted size={13} style={{ lineHeight: 21 }}>
              • 서명한 주는 <Text style={bold}>관리자도 임의로 수정할 수 없습니다.</Text>
              {'\n'}• 고칠 일이 생기면 <Text style={bold}>본인이 직접 '서명 해제'</Text>를 해야만 다시 열립니다(관리자는 해제 불가).
              {'\n'}• 진행 중인 이번 주는 <Text style={bold}>주가 끝난 뒤</Text> 서명할 수 있어요.
            </Muted>
            <Muted size={12} style={{ color: t.success }}>안심하고 근무하세요. 한번 확정한 기록은 그대로 보존됩니다. 🙂</Muted>
            <Button label="확인했어요" variant="primary" onPress={done} />
          </Card>
        </View>
      </View>
    </Modal>
  );
}
