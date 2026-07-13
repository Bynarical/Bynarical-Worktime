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

export default function AdminSettings() {
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
          <Badge text="👑 관리자" color="#fff" soft="rgba(255,255,255,0.2)" />
        </Row>
      </Hero>

      <PolicyCard />
      <ConsentsCard />
      <HolidaysCard />
      <WorkplacesCard />
      <SyncCard />
      <PasswordCard />

      <Card>
        <Text style={{ fontWeight: '700', color: t.text }}>정보</Text>
        <KV k="앱" v="Bynarical Worktime v2" />
        <KV k="근무제" v={`코어타임 ${s.settings.workPolicy.coreStart}–${s.settings.workPolicy.coreEnd}`} />
      </Card>

      <Button label="로그아웃" variant="neutral" onPress={async () => { await s.logout(); router.replace('/(auth)/login'); }} />
    </Screen>
  );
}

function PolicyCard() {
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
      <Row><Badge text="근무·연차 정책" color={t.trip} /></Row>
      <Muted size={12}>전 직원에게 공통 적용됩니다.</Muted>

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

function ConsentsCard() {
  const s = useStore();
  const t = useTheme();
  const staff = Object.entries(s.profilesById)
    .map(([id, p]) => ({ id, ...p }))
    .filter((e) => e.id !== s.user?.id);
  const consentOf = (id: string) => s.consents.find((c) => c.userId === id);
  const agreedCount = staff.filter((e) => consentOf(e.id)).length;

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row><Badge text="위치정보 동의" color={t.primary} /></Row>
        <Badge text={`${agreedCount}/${staff.length} 동의`} color={agreedCount === staff.length ? t.success : t.warning} />
      </Row>
      <Muted size={12}>직원이 최초 출퇴근 전 동의하면 시각·IP·기기가 기록됩니다.</Muted>
      {staff.length === 0 && <Muted size={12}>직원이 없습니다.</Muted>}
      {staff.map((e) => {
        const c = consentOf(e.id);
        return (
          <View key={e.id} style={{ gap: 2 }}>
            <Divider />
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Body style={{ fontWeight: '600' }}>{e.name}</Body>
              {c ? <Badge text="동의함" color={t.success} /> : <Badge text="미동의" color={t.danger} />}
            </Row>
            {c ? (
              <Muted size={11}>
                {new Date(c.agreedAt).toLocaleString('ko-KR')} · IP {c.ip || '-'}
              </Muted>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

function HolidaysCard() {
  const s = useStore();
  const t = useTheme();
  const [day, setDay] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const thisYear = new Date().getFullYear();

  async function sync() {
    setSyncMsg('');
    setSyncBusy(true);
    const r = await s.adminSyncHolidays(thisYear, thisYear + 1);
    setSyncBusy(false);
    if (!r.ok) return setSyncMsg(r.error || '동기화 실패');
    setSyncMsg(`✓ ${thisYear}~${thisYear + 1}년 공휴일 ${r.count ?? 0}건을 불러왔습니다.`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...s.holidays].sort((a, b) => (a.day < b.day ? 1 : -1)); // 최신 먼저
  const upcoming = sorted.filter((h) => h.day >= today).sort((a, b) => (a.day < b.day ? -1 : 1));
  const shown = showAll ? sorted : upcoming.slice(0, 8);

  async function add() {
    setMsg('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return setMsg('날짜 형식은 YYYY-MM-DD 입니다.');
    if (!name.trim()) return setMsg('휴일 이름을 입력하세요.');
    await s.adminAddHoliday(day, name.trim());
    setDay(''); setName(''); setMsg('✓ 추가되었습니다.');
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row><Badge text="공휴일 / 휴무일" color={t.trip} /></Row>
        <Badge text={`${s.holidays.length}일`} color={t.textDim} />
      </Row>
      <Muted size={12}>연차 80% 출근율 계산 시 소정근로일에서 제외됩니다. 주말은 자동 제외되므로 평일 공휴일·대체공휴일·회사 휴무일만 관리하면 됩니다.</Muted>

      {/* 공공데이터포털 동기화 (자동 + 수동) */}
      <Muted size={11}>공휴일은 관리자 접속 시 공공데이터포털(한국천문연구원)에서 자동으로 최신화됩니다(하루 1회). 국경일·공휴일·대체공휴일·임시공휴일(선거일 포함) 포함. 바로 갱신하려면 아래 버튼을 누르세요.</Muted>
      <Button label={`🔄 지금 새로고침 (${thisYear}~${thisYear + 1}년)`} variant="outline" small loading={syncBusy} onPress={sync} />
      {syncMsg ? <Muted size={12} style={{ color: syncMsg.startsWith('✓') ? t.success : t.danger }}>{syncMsg}</Muted> : null}

      {shown.length === 0 && <Muted size={12}>등록된 휴일이 없습니다. 아래에서 추가하거나 supabase/holidays.sql을 실행하세요.</Muted>}
      {shown.map((h) => (
        <View key={h.day} style={{ gap: 2 }}>
          <Divider />
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Body style={{ fontWeight: '600' }}>{h.day}</Body>
              <Muted size={12}>{h.name}</Muted>
            </View>
            <Button label="삭제" variant="danger" small onPress={() => s.adminRemoveHoliday(h.day)} />
          </Row>
        </View>
      ))}
      {s.holidays.length > shown.length || (!showAll && sorted.length > upcoming.slice(0, 8).length) ? (
        <Button label={showAll ? '다가오는 휴일만' : `전체 보기 (${s.holidays.length})`} variant="neutral" small onPress={() => setShowAll((v) => !v)} />
      ) : null}

      <Divider />
      <Text style={{ fontWeight: '700', color: t.textDim }}>+ 휴일 추가</Text>
      <Row>
        <View style={{ flex: 1 }}><Field label="날짜" value={day} onChangeText={setDay} placeholder="2027-01-01" autoCapitalize="none" /></View>
        <View style={{ flex: 1 }}><Field label="이름" value={name} onChangeText={setName} placeholder="신정" /></View>
      </Row>
      {msg ? <Muted size={12} style={{ color: msg.startsWith('✓') ? t.success : t.danger }}>{msg}</Muted> : null}
      <Button label="휴일 추가" variant="primary" small onPress={add} />
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
      <Row><Badge text="근무지" color={t.primary} /></Row>
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

function PasswordCard() {
  const s = useStore();
  const t = useTheme();
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  async function doChangePw() {
    setPwMsg('');
    if (newPw.length < 6) return setPwMsg('새 비밀번호는 6자 이상이어야 합니다.');
    const r = await s.changePassword(newPw);
    if (!r.ok) return setPwMsg(r.error || '변경 실패');
    setNewPw(''); setPwMsg('✓ 비밀번호가 변경되었습니다.');
  }

  return (
    <Card>
      <Row><Badge text="내 계정" color={t.primary} /></Row>
      <KV k="이름" v={s.user?.name || '-'} />
      <KV k="사번" v={s.user?.empNo || '미등록'} vColor={s.user?.empNo ? undefined : t.textFaint} />
      <Divider />
      <Text style={{ fontWeight: '700', color: t.textDim }}>비밀번호 변경</Text>
      <Field label="새 비밀번호" value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="6자 이상" />
      {pwMsg ? <Muted size={12}>{pwMsg}</Muted> : null}
      <Button label="비밀번호 변경" variant="primary" small onPress={doChangePw} />
    </Card>
  );
}
