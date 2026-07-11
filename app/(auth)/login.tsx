import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, Card, Field, Button, Muted, Row, useTheme } from '@/components/ui';
import { useStore } from '@/lib/store';

export default function Login() {
  const s = useStore();
  const router = useRouter();
  const t = useTheme();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onLogin() {
    setErr('');
    if (!name.trim()) return setErr('이름을 입력해주세요.');
    if (!password) return setErr('비밀번호를 입력해주세요.');
    setBusy(true);
    const r = await s.login(name, password);
    setBusy(false);
    if (!r.ok) return setErr(r.error || '로그인에 실패했습니다.');
    router.replace('/(tabs)');
  }

  return (
    <Screen>
      <View style={{ height: 52 }} />
      <View style={{ alignItems: 'center', gap: 14, marginBottom: 10 }}>
        <LinearGradient
          colors={t.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[{ width: 78, height: 78, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, t.shadowMd]}
        >
          <Text style={{ fontSize: 40 }}>🕒</Text>
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
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>로그인</Text>
        <Field label="이름" value={name} onChangeText={setName} placeholder="홍길동" />
        <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry placeholder="비밀번호" onSubmitEditing={onLogin} />
        {err ? <Muted size={13} style={{ color: t.danger }}>{err}</Muted> : null}
        <Button label="로그인" onPress={onLogin} loading={busy} />
        <Muted size={12}>계정은 관리자가 생성합니다. 로그인이 안 되면 관리자에게 문의하세요. 비밀번호는 로그인 후 설정에서 변경할 수 있습니다.</Muted>
      </Card>

      <Row style={{ justifyContent: 'center', paddingHorizontal: 12 }}>
        <Muted size={12} style={{ textAlign: 'center' }}>🔒 계정·비밀번호는 Supabase 인증으로 안전하게 관리되며, 데이터는 권한(RLS)으로 보호됩니다.</Muted>
      </Row>
    </Screen>
  );
}
