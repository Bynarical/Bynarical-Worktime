import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Card,
  Title,
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
      <Title>설정</Title>
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
  const [hireDate, setHireDate] = useState(s.user?.hireDate || '');
  const [msg, setMsg] = useState('');

  async function save() {
    if (hireDate && !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) {
      setMsg('입사일 형식은 YYYY-MM-DD 입니다.');
      return;
    }
    await s.updateProfile({ name: name.trim(), empNo: empNo.trim() || undefined, hireDate: hireDate || undefined });
    setMsg('✓ 저장되었습니다.');
  }

  return (
    <Card>
      <Row><Badge text="프로필" color={t.primary} />{s.user?.isAdmin && <Badge text="관리자 계정" color={t.trip} />}</Row>
      <Field label="이름" value={name} onChangeText={setName} />
      <Field label="사번" value={empNo} onChangeText={setEmpNo} autoCapitalize="none" />
      <Field label="입사일 (연차 계산)" value={hireDate} onChangeText={setHireDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
      {msg ? <Muted size={12}>{msg}</Muted> : null}
      <Button label="프로필 저장" variant="primary" small onPress={save} />
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
      <Row><Badge text="근무지 관리" color={t.primary} /></Row>
      {s.settings.workplaces.length === 0 && <Muted>등록된 근무지가 없습니다</Muted>}
      {s.settings.workplaces.map((w) => (
        <View key={w.id} style={{ gap: 4 }}>
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '600' }}>{w.name}</Body>
            <Button label="삭제" variant="danger" small onPress={() => s.removeWorkplace(w.id)} />
          </Row>
          <Muted size={12}>{w.lat.toFixed(5)}, {w.lng.toFixed(5)} · 반경 {w.radius}m</Muted>
        </View>
      ))}
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
    </Card>
  );
}

function AdminCard() {
  const s = useStore();
  const t = useTheme();
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');

  async function unlock() {
    const ok = await s.verifyAdmin(pw);
    setMsg(ok ? '' : '비밀번호가 올바르지 않습니다.');
    setPw('');
  }

  if (!s.adminUnlocked) {
    return (
      <Card>
        <Row><Badge text="관리자 설정" color={t.trip} /></Row>
        <Muted size={12}>{s.hasAdminPassword ? '관리자 비밀번호를 입력하세요.' : '최초 비밀번호를 설정하면 관리자로 잠금 해제됩니다.'}</Muted>
        <Field label={s.hasAdminPassword ? '관리자 비밀번호' : '새 관리자 비밀번호'} value={pw} onChangeText={setPw} secureTextEntry />
        {msg ? <Muted size={12}><Text style={{ color: t.danger }}>{msg}</Text></Muted> : null}
        <Button label={s.hasAdminPassword ? '확인' : '비밀번호 설정'} variant="primary" small onPress={unlock} />
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
  const [newPw, setNewPw] = useState('');
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
      <Row style={{ justifyContent: 'space-between' }}>
        <Row><Badge text="관리자" color={t.trip} /><Text style={{ fontWeight: '800', color: t.text }}>근무·연차 정책</Text></Row>
        <Button label="잠금" variant="neutral" small onPress={s.lockAdmin} />
      </Row>
      <Muted size={12}>근로계약서 제4조 5항: 회사는 휴게시간을 조정할 수 있습니다.</Muted>

      <Row><View style={{ flex: 1 }}><Field label="코어 시작" value={f.coreStart} onChangeText={set('coreStart')} /></View><View style={{ flex: 1 }}><Field label="코어 종료" value={f.coreEnd} onChangeText={set('coreEnd')} /></View></Row>
      <Row><View style={{ flex: 1 }}><Field label="최소 출근" value={f.earliestClockIn} onChangeText={set('earliestClockIn')} /></View><View style={{ flex: 1 }}><Field label="최대 출근" value={f.latestClockIn} onChangeText={set('latestClockIn')} /></View></Row>
      <Row><View style={{ flex: 1 }}><Field label="휴게 시작" value={f.breakStart} onChangeText={set('breakStart')} /></View><View style={{ flex: 1 }}><Field label="휴게 종료" value={f.breakEnd} onChangeText={set('breakEnd')} /></View></Row>
      <Row><View style={{ flex: 1 }}><Field label="출근 단위(분)" value={f.step} onChangeText={set('step')} keyboardType="number-pad" /></View><View style={{ flex: 1 }}><Field label="소정근로(시간)" value={f.daily} onChangeText={set('daily')} keyboardType="numbers-and-punctuation" /></View></Row>
      <Row><View style={{ flex: 1 }}><Field label="연차 기본(일)" value={f.baseDays} onChangeText={set('baseDays')} keyboardType="number-pad" /></View><View style={{ flex: 1 }}><Field label="연차 상한(일)" value={f.maxDays} onChangeText={set('maxDays')} keyboardType="number-pad" /></View></Row>
      {msg ? <Muted size={12}>{msg}</Muted> : null}
      <Button label="정책 저장" variant="primary" small onPress={saveWork} />

      <Divider />
      <Text style={{ fontWeight: '700', color: t.text }}>관리자 비밀번호 변경</Text>
      <Field label="새 비밀번호" value={newPw} onChangeText={setNewPw} secureTextEntry />
      <Button label="비밀번호 변경" variant="neutral" small onPress={async () => { if (newPw) { await s.setAdminPassword(newPw); setNewPw(''); setMsg('✓ 비밀번호가 변경되었습니다.'); } }} />
    </Card>
  );
}

function SyncCard() {
  const s = useStore();
  const t = useTheme();
  const [url, setUrl] = useState(s.settings.sheetsUrl || '');
  const [msg, setMsg] = useState('');

  return (
    <Card>
      <Row><Badge text="동기화" color={t.primary} />{s.pendingSync > 0 && <Badge text={`대기 ${s.pendingSync}건`} color={t.warning} />}</Row>
      <Field label="Google Apps Script 웹앱 URL" value={url} onChangeText={setUrl} placeholder="https://script.google.com/macros/s/.../exec" autoCapitalize="none" />
      <Row>
        <Button label="URL 저장" variant="neutral" small style={{ flex: 1 }} onPress={async () => { await s.setSheetsUrl(url.trim()); setMsg('✓ 저장'); }} />
        <Button label="지금 동기화" variant="primary" small style={{ flex: 1 }} onPress={async () => { await s.sync(); setMsg('동기화 시도 완료'); }} />
      </Row>
      {msg ? <Muted size={12}>{msg}</Muted> : null}
      <Muted size={11}>서버가 없어도 앱은 정상 동작하며, 기록은 기기에 저장됩니다.</Muted>
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
