import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, Card, Field, Button, Muted, Row, useTheme } from '@/components/ui';
import { RADIUS } from '@/lib/theme';
import { useStore } from '@/lib/store';

export default function Login() {
  const s = useStore();
  const router = useRouter();
  const t = useTheme();
  const isLogin = s.hasAccount;

  const [name, setName] = useState('');
  const [empNo, setEmpNo] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  async function onRegister() {
    setErr('');
    if (!name.trim()) return setErr('이름을 입력해주세요.');
    if (hireDate && !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) return setErr('입사일 형식은 YYYY-MM-DD 입니다.');
    if (password.length < 4) return setErr('비밀번호는 4자 이상이어야 합니다.');
    if (password !== password2) return setErr('비밀번호가 일치하지 않습니다.');
    setBusy(true);
    await s.register({ name, empNo, hireDate: hireDate || undefined, password });
    setBusy(false);
    router.replace('/(tabs)');
  }

  async function onLogin() {
    setErr('');
    if (!password) return setErr('비밀번호를 입력해주세요.');
    setBusy(true);
    const ok = await s.login(password);
    setBusy(false);
    if (!ok) return setErr('비밀번호가 올바르지 않습니다.');
    router.replace('/(tabs)');
  }

  return (
    <Screen>
      <View style={{ height: 44 }} />
      <View style={{ alignItems: 'center', gap: 14, marginBottom: 10 }}>
        <LinearGradient
          colors={t.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[{ width: 74, height: 74, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, t.shadowMd]}
        >
          <Text style={{ fontSize: 38 }}>🕒</Text>
        </LinearGradient>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: t.text, letterSpacing: -0.6 }}>Bynarical Worktime</Text>
          <Muted>코어타임 근무제 · 위치 기반 근태 · 연차 관리</Muted>
        </View>
      </View>

      {isLogin ? (
        <Card>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>로그인</Text>
          <Muted>{s.user?.name}님, 다시 오신 것을 환영합니다.</Muted>
          <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry placeholder="비밀번호" onSubmitEditing={onLogin} />
          {err ? <Muted size={13} style={{ color: t.danger }}>{err}</Muted> : null}
          <Button label="로그인" onPress={onLogin} loading={busy} />
          {!confirmReset ? (
            <Button label="다른 계정으로 등록" variant="outline" small onPress={() => setConfirmReset(true)} />
          ) : (
            <>
              <Row>
                <Button label="계정 초기화" variant="danger" small style={{ flex: 1 }} onPress={() => s.resetAccount()} />
                <Button label="취소" variant="neutral" small style={{ flex: 1 }} onPress={() => setConfirmReset(false)} />
              </Row>
              <Muted size={12}>현재 계정 자격증명을 지우고 새 계정 등록 화면으로 이동합니다. (기록 데이터는 유지)</Muted>
            </>
          )}
        </Card>
      ) : (
        <Card>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>계정 등록</Text>
          <Field label="이름" value={name} onChangeText={setName} placeholder="홍길동" />
          <Field label="사번 (선택)" value={empNo} onChangeText={setEmpNo} placeholder="예: 2024001 · admin 입력 시 관리자" autoCapitalize="none" />
          <Field label="입사일 (선택, 연차 계산)" value={hireDate} onChangeText={setHireDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
          <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry placeholder="4자 이상" />
          <Field label="비밀번호 확인" value={password2} onChangeText={setPassword2} secureTextEntry placeholder="비밀번호 재입력" />
          {err ? <Muted size={13} style={{ color: t.danger }}>{err}</Muted> : null}
          <Button label="가입하기" onPress={onRegister} loading={busy} />
          <Muted size={12}>
            사번에 <Text style={{ fontWeight: '700', color: t.text }}>admin</Text> 을 입력하면 관리자 기능(근무지·정책·연차 승인)이 활성화됩니다.
          </Muted>
        </Card>
      )}

      <Row style={{ justifyContent: 'center', paddingHorizontal: 12 }}>
        <Muted size={12} style={{ textAlign: 'center' }}>🔒 비밀번호는 기기에 암호화(해시)되어 저장되며 평문은 저장되지 않습니다.</Muted>
      </Row>
    </Screen>
  );
}
