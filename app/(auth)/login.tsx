import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, Card, Field, Button, Muted, Row, Chip, useTheme } from '@/components/ui';
import { useStore } from '@/lib/store';

export default function Login() {
  const s = useStore();
  const router = useRouter();
  const t = useTheme();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [empNo, setEmpNo] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  async function onRegister() {
    setErr(''); setInfo('');
    if (!name.trim()) return setErr('이름을 입력해주세요.');
    if (!emailOk(email)) return setErr('올바른 이메일을 입력해주세요.');
    if (password.length < 6) return setErr('비밀번호는 6자 이상이어야 합니다.');
    if (password !== password2) return setErr('비밀번호가 일치하지 않습니다.');
    setBusy(true);
    const r = await s.register({ email, password, name, empNo });
    setBusy(false);
    if (!r.ok) return setErr(r.error || '가입에 실패했습니다.');
    if (r.needConfirm) return setInfo('가입 완료! 이메일 인증 링크를 확인한 뒤 로그인하세요.');
    router.replace('/(tabs)');
  }

  async function onLogin() {
    setErr(''); setInfo('');
    if (!emailOk(email)) return setErr('올바른 이메일을 입력해주세요.');
    if (!password) return setErr('비밀번호를 입력해주세요.');
    setBusy(true);
    const r = await s.login(email, password);
    setBusy(false);
    if (!r.ok) return setErr(r.error || '로그인에 실패했습니다.');
    router.replace('/(tabs)');
  }

  return (
    <Screen>
      <View style={{ height: 40 }} />
      <View style={{ alignItems: 'center', gap: 14, marginBottom: 8 }}>
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

      {s.needsConfig && (
        <Card>
          <Muted size={13} style={{ color: t.danger }}>백엔드(Supabase)가 아직 설정되지 않았습니다. 관리자에게 문의하세요.</Muted>
        </Card>
      )}

      <Card>
        <Row style={{ gap: 8 }}>
          <Chip label="로그인" active={mode === 'login'} onPress={() => { setMode('login'); setErr(''); setInfo(''); }} />
          <Chip label="계정 등록" active={mode === 'register'} onPress={() => { setMode('register'); setErr(''); setInfo(''); }} />
        </Row>

        <Field label="이메일" value={email} onChangeText={setEmail} placeholder="you@company.com" autoCapitalize="none" keyboardType="email-address" />

        {mode === 'register' && (
          <>
            <Field label="이름" value={name} onChangeText={setName} placeholder="홍길동" />
            <Field label="사번 (선택)" value={empNo} onChangeText={setEmpNo} placeholder="예: 2024001" autoCapitalize="none" />
            <Muted size={12}>입사일(연차 계산)은 가입 후 관리자가 등록합니다.</Muted>
          </>
        )}

        <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry placeholder={mode === 'register' ? '6자 이상' : '비밀번호'} onSubmitEditing={mode === 'login' ? onLogin : undefined} />
        {mode === 'register' && (
          <Field label="비밀번호 확인" value={password2} onChangeText={setPassword2} secureTextEntry placeholder="비밀번호 재입력" />
        )}

        {err ? <Muted size={13} style={{ color: t.danger }}>{err}</Muted> : null}
        {info ? <Muted size={13} style={{ color: t.success }}>{info}</Muted> : null}

        {mode === 'login' ? (
          <Button label="로그인" onPress={onLogin} loading={busy} />
        ) : (
          <Button label="가입하기" onPress={onRegister} loading={busy} />
        )}
      </Card>

      <Row style={{ justifyContent: 'center', paddingHorizontal: 12 }}>
        <Muted size={12} style={{ textAlign: 'center' }}>🔒 계정·비밀번호는 Supabase 인증으로 안전하게 관리되며, 데이터는 권한(RLS)으로 보호됩니다.</Muted>
      </Row>
    </Screen>
  );
}
