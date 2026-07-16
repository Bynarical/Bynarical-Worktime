import React, { useState } from 'react';
import { Modal, View, Text } from 'react-native';
import { Card, Button, Field, Muted, Body, Row, Divider } from './ui';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { HelpManual } from './HelpManual';

// 첫 로그인(초기 비밀번호 미변경) 신규 직원 온보딩.
// ① 근태 관련 안내사항 필독 ② 비밀번호 변경 — 둘 다 완료해야 넘어갈 수 있음(건너뛰기 없음).
// 관리자 계정은 예외.
export function PasswordChangePrompt() {
  const s = useStore();
  const t = useTheme();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [manualRead, setManualRead] = useState(false);
  const [showManual, setShowManual] = useState(false);

  if (!s.authed || s.user?.isAdmin || s.passwordChanged) return null;

  // 안내사항을 여는 동안은 온보딩 모달을 숨기고 안내사항만 표시(모달 중첩 방지). 닫으면 읽음 처리.
  if (showManual) {
    return (
      <HelpManual
        onClose={() => {
          setShowManual(false);
          setManualRead(true);
        }}
      />
    );
  }

  async function submit() {
    setMsg('');
    if (!manualRead) {
      setMsg('먼저 근태 관련 안내사항을 확인해 주세요.');
      return;
    }
    if (pw.length < 6) {
      setMsg('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (pw !== pw2) {
      setMsg('비밀번호가 일치하지 않습니다.');
      return;
    }
    setBusy(true);
    const r = await s.changePassword(pw);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error || '변경에 실패했습니다.');
      return;
    }
    // passwordChanged가 true로 바뀌며 온보딩이 자동으로 닫힘
  }

  return (
    <Modal transparent animationType="fade" visible>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>
          <Card>
            <Body style={{ fontWeight: '800', fontSize: 17 }}>👋 환영합니다! 시작 전 두 가지만 완료해 주세요</Body>

            <Divider />
            <Text style={{ fontWeight: '700', color: t.text, fontSize: 14 }}>① 근태 관련 안내사항 확인 {manualRead ? '✅' : ''}</Text>
            <Muted size={12}>앱 사용법과 근무 규칙을 담았습니다. 꼭 한 번 읽어 주세요.</Muted>
            <Button
              label={manualRead ? '📋 안내사항 다시 보기' : '📋 근태 관련 안내사항 읽기'}
              variant={manualRead ? 'neutral' : 'primary'}
              small
              onPress={() => setShowManual(true)}
            />

            <Divider />
            <Text style={{ fontWeight: '700', color: t.text, fontSize: 14 }}>② 비밀번호 변경</Text>
            <Muted size={12}>초기(관리자 지정) 비밀번호를 본인만 아는 것으로 바꿔주세요.</Muted>
            <Field label="새 비밀번호" value={pw} onChangeText={setPw} secureTextEntry placeholder="6자 이상" autoCapitalize="none" />
            <Field label="새 비밀번호 확인" value={pw2} onChangeText={setPw2} secureTextEntry placeholder="다시 입력" autoCapitalize="none" />

            {msg ? <Muted size={12} style={{ color: t.danger }}>{msg}</Muted> : null}
            <Row style={{ marginTop: 2 }}>
              <View style={{ flex: 1 }}>
                <Button label="완료하고 시작하기" variant="primary" loading={busy} onPress={submit} />
              </View>
            </Row>
            {!manualRead ? <Muted size={11}>* 안내사항을 먼저 확인해야 완료할 수 있습니다.</Muted> : null}
          </Card>
        </View>
      </View>
    </Modal>
  );
}
