import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Hero,
  Card,
  Muted,
  Body,
  Button,
  Badge,
  Row,
  Divider,
  KV,
  Field,
} from '@/components/ui';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { getCurrentPoint, parseCoords } from '@/lib/geo';
import { WorkPolicy } from '@/lib/types';

export default function Settings() {
  const s = useStore();
  const t = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <Hero style={{ paddingVertical: 22 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ gap: 3 }}>
            <Text style={{ color: t.onHeroDim, fontSize: 13, fontWeight: '600' }}>설정</Text>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>{s.user?.name}님</Text>
            <Text style={{ color: t.onHeroDim, fontSize: 12 }}>{s.user?.empNo ? `사번 ${s.user.empNo}` : '사번 미등록'}</Text>
          </View>
          {s.user?.isAdmin && <Badge text="관리자 계정" color="#fff" soft="rgba(255,255,255,0.2)" />}
        </Row>
      </Hero>
      <ProfileCard />
      <WorkplacesCard />
      <AdminCard />
      <SyncCard />
      <DataCard />
      <Card>
        <Text style={{ fontWeight: '700', color: t.text }}>정보</Text>
        <KV k="앱" v="Bynarical Worktime v2" />
        <KV k="근무제" v={`코어타임 ${s.settings.workPolicy.coreStart}–${s.settings.workPolicy.coreEnd}`} />
        <Muted size={11}>근로계약서 제4조(코어타임)·제6조(연차/반반차) 반영</Muted>
      </Card>
      <Button label="로그아웃" variant="neutral" onPress={async () => { await s.logout(); router.replace('/(auth)/login'); }} />
    </Screen>
  );
}

function ProfileCard() {
  const s = useStore();
  const t = useTheme();
  const [name, setName] = useState(s.user?.name || '');
  const [empNo, setEmpNo] = useState(s.user?.empNo || '');
  const [msg, setMsg] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  async function save() {
    await s.updateProfile({ name: name.trim(), empNo: empNo.trim() || undefined });
    setMsg('✓ 저장되었습니다.');
  }

  async function doChangePw() {
    setPwMsg('');
    if (newPw.length < 6) return setPwMsg('새 비밀번호는 6자 이상이어야 합니다.');
    const r = await s.changePassword(newPw);
    if (!r.ok) return setPwMsg(r.error || '변경 실패');
    setNewPw(''); setPwMsg('✓ 비밀번호가 변경되었습니다.');
  }

  return (
    <Card>
      <Row><Badge text="프로필" color={t.primary} />{s.user?.isAdmin && <Badge text="관리자 계정" color={t.trip} />}</Row>
      <Field label="이름" value={name} onChangeText={setName} />
      <Field label="사번" value={empNo} onChangeText={setEmpNo} autoCapitalize="none" />
      <KV k="입사일 (연차 계산)" v={s.user?.hireDate || '미등록 · 관리자 설정'} vColor={s.user?.hireDate ? undefined : t.textFaint} />
      {msg ? <Muted size={12}>{msg}</Muted> : null}
      <Button label="프로필 저장" variant="primary" small onPress={save} />
      <Divider />
      <Text style={{ fontWeight: '700', color: t.textDim }}>비밀번호 변경</Text>
      <Field label="새 비밀번호" value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="6자 이상" />
      {pwMsg ? <Muted size={12}>{pwMsg}</Muted> : null}
      <Button label="비밀번호 변경" variant="neutral" small onPress={doChangePw} />
    </Card>
  );
}

function WorkplacesCard() {
  const s = useStore();
  const t = useTheme();
  const [name, setName] = useState('');
  const [coords, setCoords] = useState('');
  const [radius, setRadius] = useState('150');
  const [msg, setMsg] = useState('');

  async function useCurrent() {
    setMsg('위치 확인 중...');
    const p = await getCurrentPoint();
    if (p) {
      setCoords(`${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`);
      setMsg('현재 위치를 입력했습니다.');
    } else setMsg('위치를 가져오지 못했습니다.');
  }

  async function add() {
    const p = parseCoords(coords);
    if (!name.trim()) return setMsg('근무지 이름을 입력하세요.');
    if (!p) return setMsg('좌표 또는 Google Maps 링크를 확인하세요.');
    const r = parseInt(radius, 10) || 150;
    await s.addWorkplace({ name: name.trim(), lat: p.lat, lng: p.lng, radius: r });
    setName(''); setCoords(''); setRadius('150'); setMsg('✓ 근무지가 추가되었습니다.');
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row><Badge text="근무지" color={t.primary} /></Row>
        {!s.adminUnlocked && <Badge text="관리자 전용" color={t.textDim} />}
      </Row>
      {s.settings.workplaces.length === 0 && <Muted>등록된 근무지가 없습니다</Muted>}
      {s.settings.workplaces.map((w) => (
        <View key={w.id} style={{ gap: 4 }}>
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '600' }}>{w.name}</Body>
            {s.adminUnlocked && <Button label="삭제" variant="danger" small onPress={() => s.removeWorkplace(w.id)} />}
          </Row>
          <Muted size={12}>{w.lat.toFixed(5)}, {w.lng.toFixed(5)} · 반경 {w.radius}m</Muted>
        </View>
      ))}
      {s.adminUnlocked ? (
        <>
          <Divider />
          <Text style={{ fontWeight: '700', color: t.textDim }}>+ 근무지 추가</Text>
          <Field label="근무지 이름" value={name} onChangeText={setName} placeholder="예: 본사" />
          <Field label="좌표 또는 Google Maps 링크" value={coords} onChangeText={setCoords} placeholder="37.561, 126.828" autoCapitalize="none" />
          <Field label="반경 (m)" value={radius} onChangeText={setRadius} keyboardType="number-pad" />
          {msg ? <Muted size={12}>{msg}</Muted> : null}
          <Row>
            <Button label="📍 현재 위치로" variant="outline" small style={{ flex: 1 }} onPress={useCurrent} />
            <Button label="추가" variant="primary" small style={{ flex: 1 }} onPress={add} />
          </Row>
        </>
      ) : (
        <Muted size={12}>근무지 등록·수정·삭제는 관리자만 할 수 있습니다. (아래 관리자 설정에서 잠금 해제)</Muted>
      )}
    </Card>
  );
}

function AdminCard() {
  const s = useTheme();
  const store = useStore();
  if (!store.adminUnlocked) {
    return (
      <Card>
        <Row><Badge text="관리자 설정" color={s.trip} /></Row>
        <Muted size={12}>관리자 계정이 아닙니다. 관리자 권한은 Supabase에서 부여됩니다.</Muted>
      </Card>
    );
  }
  return <AdminUnlocked />;
}

function AdminUnlocked() {
  const s = useStore();
  const t = useTheme();
  const wp = s.settings.workPolicy;
  const lp = s.settings.leavePolicy;

  const [f, setF] = useState<Record<string, string>>({
    coreStart: wp.coreStart,
    coreEnd: wp.coreEnd,
    latestClockIn: wp.latestClockIn,
    earliestClockIn: wp.earliestClockIn,
    step: String(wp.clockInStepMinutes),
    daily: String(wp.dailyWorkMinutes / 60),
    breakStart: wp.breakStart,
    breakEnd: wp.breakEnd,
    baseDays: String(lp.baseAnnualDays),
    maxDays: String(lp.maxAnnualDays),
  });
  const [msg, setMsg] = useState('');
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function saveWork() {
    const hm = /^\d{1,2}:\d{2}$/;
    for (const k of ['coreStart', 'coreEnd', 'latestClockIn', 'earliestClockIn', 'breakStart', 'breakEnd']) {
      if (!hm.test(f[k])) return setMsg(`${k} 형식(HH:MM)을 확인하세요.`);
    }
    const patch: Partial<WorkPolicy> = {
      coreStart: f.coreStart,
      coreEnd: f.coreEnd,
      latestClockIn: f.latestClockIn,
      earliestClockIn: f.earliestClockIn,
      clockInStepMinutes: parseInt(f.step, 10) || 30,
      dailyWorkMinutes: Math.round((parseFloat(f.daily) || 8) * 60),
      breakStart: f.breakStart,
      breakEnd: f.breakEnd,
      breakMinutes: Math.max(0, (parseInt(f.breakEnd.split(':')[0]) * 60 + parseInt(f.breakEnd.split(':')[1])) - (parseInt(f.breakStart.split(':')[0]) * 60 + parseInt(f.breakStart.split(':')[1]))),
    };
    await s.updateWorkPolicy(patch);
    await s.updateLeavePolicy({ baseAnnualDays: parseInt(f.baseDays, 10) || 15, maxAnnualDays: parseInt(f.maxDays, 10) || 25 });
    setMsg('✓ 정책이 저장되었습니다.');
  }

  return (
    <Card>
      <Row><Badge text="관리자" color={t.trip} /><Text style={{ fontWeight: '800', color: t.text }}>근무·연차 정책</Text></Row>
      <Muted size={12}>근로계약서 제4조 5항: 회사는 휴게시간을 조정할 수 있습니다. (전 직원 공통 적용)</Muted>

      <Row><View style={{ flex: 1 }}><Field label="코어 시작" value={f.coreStart} onChangeText={set('coreStart')} /></View><View style={{ flex: 1 }}><Field label="코어 종료" value={f.coreEnd} onChangeText={set('coreEnd')} /></View></Row>
      <Row><View style={{ flex: 1 }}><Field label="최소 출근" value={f.earliestClockIn} onChangeText={set('earliestClockIn')} /></View><View style={{ flex: 1 }}><Field label="최대 출근" value={f.latestClockIn} onChangeText={set('latestClockIn')} /></View></Row>
      <Row><View style={{ flex: 1 }}><Field label="휴게 시작" value={f.breakStart} onChangeText={set('breakStart')} /></View><View style={{ flex: 1 }}><Field label="휴게 종료" value={f.breakEnd} onChangeText={set('breakEnd')} /></View></Row>
      <Row><View style={{ flex: 1 }}><Field label="출근 단위(분)" value={f.step} onChangeText={set('step')} keyboardType="number-pad" /></View><View style={{ flex: 1 }}><Field label="소정근로(시간)" value={f.daily} onChangeText={set('daily')} keyboardType="numbers-and-punctuation" /></View></Row>
      <Row><View style={{ flex: 1 }}><Field label="연차 기본(일)" value={f.baseDays} onChangeText={set('baseDays')} keyboardType="number-pad" /></View><View style={{ flex: 1 }}><Field label="연차 상한(일)" value={f.maxDays} onChangeText={set('maxDays')} keyboardType="number-pad" /></View></Row>
      {msg ? <Muted size={12}>{msg}</Muted> : null}
      <Button label="정책 저장" variant="primary" small onPress={saveWork} />
    </Card>
  );
}

function SyncCard() {
  const s = useStore();
  const t = useTheme();
  const [msg, setMsg] = useState('');
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row><Badge text="동기화" color={t.primary} /></Row>
        <Badge text={s.needsConfig ? '미연결' : '● Supabase 연결됨'} color={s.needsConfig ? t.danger : t.success} />
      </Row>
      <Muted size={12}>데이터는 Supabase(Postgres)에 저장되고 권한(RLS)으로 보호됩니다. 여러 기기에서 자동 동기화됩니다.</Muted>
      <Button
        label="새로고침"
        variant="neutral"
        small
        onPress={async () => {
          await s.refresh();
          setMsg('✓ 최신 데이터로 갱신했습니다.');
        }}
      />
      {msg ? <Muted size={12}>{msg}</Muted> : null}
    </Card>
  );
}

function DataCard() {
  const s = useStore();
  const t = useTheme();
  const [confirm, setConfirm] = useState(false);
  return (
    <Card>
      <Row><Badge text="데이터 관리" color={t.danger} /></Row>
      {!confirm ? (
        <Button label="내 근태 기록 전체 삭제" variant="outline" small onPress={() => setConfirm(true)} />
      ) : (
        <Row>
          <Button label="정말 삭제" variant="danger" small style={{ flex: 1 }} onPress={async () => { await s.clearAllRecords(); setConfirm(false); }} />
          <Button label="취소" variant="neutral" small style={{ flex: 1 }} onPress={() => setConfirm(false)} />
        </Row>
      )}
      <Muted size={11}>연차 신청/승인 내역은 유지됩니다. 근태 기록만 삭제됩니다.</Muted>
    </Card>
  );
}
