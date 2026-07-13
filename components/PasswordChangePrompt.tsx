import React, { useState } from 'react';
import { Modal, View } from 'react-native';
import { Card, Button, Field, Muted, Body } from './ui';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

// 초기(관리자 지정) 비밀번호를 아직 바꾸지 않은 사용자에게 변경을 유도하는 팝업.
// 변경할 때까지 로그인 세션마다 다시 뜬다. ('나중에'는 이번 세션만 접어둠)
export function PasswordChangePrompt() {
  const s = useStore();
  const t = useTheme();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [snoozed, setSnoozed] = useState(false);

  if (!s.authed || s.passwordChanged || snoozed) return null;

  async function submit() {
    setMsg('');
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
    setPw('');
    setPw2('');
    // passwordChanged가 true로 바뀌며 팝업이 자동으로 닫힘
  }

  return (
    <Modal transparent animationType="fade" visible>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <Card>
            <Body style={{ fontWeight: '800', fontSize: 16 }}>🔒 비밀번호를 변경해주세요</Body>
            <Muted size={12}>초기(관리자 지정) 비밀번호를 사용 중입니다. 보안을 위해 본인만 아는 비밀번호로 바꿔주세요.</Muted>
            <Field label="새 비밀번호" value={pw} onChangeText={setPw} secureTextEntry placeholder="6자 이상" autoCapitalize="none" />
            <Field label="새 비밀번호 확인" value={pw2} onChangeText={setPw2} secureTextEntry placeholder="다시 입력" autoCapitalize="none" />
            {msg ? <Muted size={12} style={{ color: t.danger }}>{msg}</Muted> : null}
            <Button label="비밀번호 변경" variant="primary" loading={busy} onPress={submit} />
            <Button label="나중에" variant="neutral" small onPress={() => setSnoozed(true)} />
          </Card>
        </View>
      </View>
    </Modal>
  );
}
