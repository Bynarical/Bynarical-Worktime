import React, { useEffect, useState } from 'react';
import { Modal, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Button, Body, Muted, Badge, Row, Divider } from './ui';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { getItem, setItem } from '@/lib/storage';
import { dateKey, weekStartKey, addDaysKey } from '@/lib/time';
import { STORAGE_KEYS, ASSURANCE_NOTICE_ID, ASSURANCE_NOTICE_UNTIL } from '@/lib/config';
import { unsignedPastWeeks } from '@/lib/confirmation';

// 안심 공지 팝업이 노출될 수 있는 기간에만 "겹침 대기"를 적용한다(그 이후엔 기다릴 필요 없음).
const ASSURANCE_BLOCK_UNTIL = ASSURANCE_NOTICE_UNTIL;

// 주간 서명 리마인드 팝업 — 출퇴근(출근 체크) 화면에서 주 1회 노출.
// 월요일이 되면 지난 주 출근부를 확인·서명하도록 알린다. 월요일에 앱을 열지 않았으면
// (연차·공휴일 등) 그 주에 처음 여는 날 뜬다 → 주 1회 보장.
export function SignReminderPopup() {
  const s = useStore();
  const t = useTheme();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [recheck, setRecheck] = useState(0); // 안심 공지 팝업이 닫히길 기다리며 재확인

  const today = dateKey();
  const thisWeekStart = weekStartKey(today);
  const pending = unsignedPastWeeks(s.records, s.leaves, s.confirmations, s.user?.id, today);
  const eligible = s.authed && !s.user?.isAdmin && s.passwordChanged && pending.length > 0;

  useEffect(() => {
    let alive = true;
    if (!eligible) {
      setShow(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const seenWeek = await getItem<string>(STORAGE_KEYS.SIGN_REMIND_SEEN);
      if (seenWeek === thisWeekStart) return; // 이번 주엔 이미 안내함
      // 안심 공지 팝업이 떠 있으면 모달이 겹치므로, 그게 닫힐 때까지 기다렸다가 띄운다.
      const assurance = await getItem<string>(STORAGE_KEYS.ASSURANCE_SEEN);
      if (assurance !== ASSURANCE_NOTICE_ID && dateKey() <= ASSURANCE_BLOCK_UNTIL) {
        if (alive) timer = setTimeout(() => setRecheck((v) => v + 1), 1500);
        return;
      }
      if (alive) setShow(true);
    })();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [eligible, thisWeekStart, pending.length, recheck]);

  if (!eligible || !show) return null;

  async function close() {
    await setItem(STORAGE_KEYS.SIGN_REMIND_SEEN, thisWeekStart);
    setShow(false);
  }
  async function goSign() {
    await close();
    router.push('/(tabs)/history');
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>
          <Card style={{ borderColor: t.primary, borderWidth: 1 }}>
            <Body style={{ fontWeight: '800', fontSize: 17 }}>✍️ 지난 출근부를 확인·서명해 주세요</Body>
            <Divider />
            <Muted size={13} style={{ lineHeight: 20 }}>
              아직 서명하지 않은 주가 <Text style={{ fontWeight: '800', color: t.text }}>{pending.length}주</Text> 있습니다.
              [이력] 탭에서 근무기록을 확인하고 서명해 주세요.
            </Muted>
            <Row style={{ flexWrap: 'wrap', gap: 6 }}>
              {pending.slice(0, 4).map((ws) => (
                <Badge key={ws} text={`${ws} ~ ${addDaysKey(ws, 6)}`} color={t.primary} soft={t.primarySoft} />
              ))}
              {pending.length > 4 ? <Muted size={11}>외 {pending.length - 4}주</Muted> : null}
            </Row>
            <Muted size={12} style={{ color: t.success }}>
              🔒 서명하면 그 주 기록이 잠겨 관리자도 수정할 수 없습니다.
            </Muted>
            <Button label="지금 서명하러 가기" variant="primary" onPress={goSign} />
            <Button label="나중에" variant="neutral" small onPress={close} />
          </Card>
        </View>
      </View>
    </Modal>
  );
}
