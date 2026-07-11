import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Title, Field, Button, Muted, Row } from '@/components/ui';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

export default function Login() {
  const { login } = useStore();
  const router = useRouter();
  const t = useTheme();
  const [name, setName] = useState('');
  const [empNo, setEmpNo] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [err, setErr] = useState('');

  const onSubmit = async () => {
    if (!name.trim()) {
      setErr('이름을 입력해주세요.');
      return;
    }
    if (hireDate && !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) {
      setErr('입사일 형식은 YYYY-MM-DD 입니다.');
      return;
    }
    await login(name, empNo, hireDate || undefined);
    router.replace('/(tabs)');
  };

  return (
    <Screen>
      <View style={{ height: 40 }} />
      <View style={{ alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Text style={{ fontSize: 40 }}>🕒</Text>
        <Title>BYnarical Worktime</Title>
        <Muted>코어타임 근무제 · 위치 기반 근태 · 연차 관리</Muted>
      </View>

      <Card>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>계정 등록 / 로그인</Text>
        <Field label="이름" value={name} onChangeText={setName} placeholder="홍길동" />
        <Field label="사번 (선택)" value={empNo} onChangeText={setEmpNo} placeholder="예: 2024001 · admin 입력 시 관리자" autoCapitalize="none" />
        <Field label="입사일 (선택, 연차 계산)" value={hireDate} onChangeText={setHireDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        {err ? <Muted size={13}><Text style={{ color: t.danger }}>{err}</Text></Muted> : null}
        <Button label="시작하기" onPress={onSubmit} />
        <Muted size={12}>
          사번에 <Text style={{ fontWeight: '700' }}>admin</Text> 을 입력하면 관리자 기능(연차 승인·정책 설정)이 활성화됩니다.
        </Muted>
      </Card>

      <Row style={{ justifyContent: 'center' }}>
        <Muted size={12}>데이터는 기기에 저장되며, 설정된 경우 Google Sheets로 동기화됩니다.</Muted>
      </Row>
    </Screen>
  );
}
