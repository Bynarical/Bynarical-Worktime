import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import {
  Screen,
  Hero,
  Card,
  Muted,
  Body,
  Button,
  Badge,
  Chip,
  Row,
  Divider,
  Field,
  Switch,
  StatTile,
} from '@/components/ui';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { computeBalance, hoursToDayLabel } from '@/lib/leave';
import { LeaveYearBreakdown } from '@/components/LeaveYearBreakdown';
import { User } from '@/lib/types';

export default function Employees() {
  const s = useStore();
  const t = useTheme();
  const leavePolicy = s.settings.leavePolicy;

  const employees = useMemo(
    () => Object.entries(s.profilesById).map(([id, p]) => ({ id, ...p })),
    [s.profilesById]
  );
  const adminCount = employees.filter((e) => e.isAdmin).length;

  const balanceFor = (id: string) => {
    const p = s.profilesById[id];
    if (!p) return null;
    const u: User = { id, name: p.name, hireDate: p.hireDate, empNo: p.empNo, isAdmin: p.isAdmin, createdAt: '' };
    return computeBalance(u, s.leaves, s.adjustments, leavePolicy, undefined, {
      records: s.records,
      workPolicy: s.settings.workPolicy,
      holidays: s.holidaySet,
    });
  };

  // 신규 직원 등록
  const [cEmail, setCEmail] = useState('');
  const [cName, setCName] = useState('');
  const [cEmpNo, setCEmpNo] = useState('');
  const [cHire, setCHire] = useState('');
  const [cPw, setCPw] = useState('');
  const [cMsg, setCMsg] = useState('');
  const [cBusy, setCBusy] = useState(false);

  // 직원 편집/조정
  const [adjUser, setAdjUser] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmpNo, setEditEmpNo] = useState('');
  const [hireInput, setHireInput] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [adjHours, setAdjHours] = useState('');
  const [adjMsg, setAdjMsg] = useState('');

  async function createEmployee() {
    setCMsg('');
    if (!cName.trim()) return setCMsg('이름을 입력하세요.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cEmail.trim())) return setCMsg('올바른 이메일(계정 식별용)을 입력하세요.');
    if (cPw.length < 6) return setCMsg('초기 비밀번호는 6자 이상이어야 합니다.');
    if (cHire && !/^\d{4}-\d{2}-\d{2}$/.test(cHire)) return setCMsg('입사일 형식은 YYYY-MM-DD 입니다.');
    setCBusy(true);
    const r = await s.adminCreateEmployee({ email: cEmail, name: cName, empNo: cEmpNo || undefined, hireDate: cHire || undefined, password: cPw });
    setCBusy(false);
    if (!r.ok) return setCMsg(r.error || '등록 실패');
    setCMsg(`✓ ${cName} 등록 완료 (초기 비밀번호를 본인에게 전달하세요)`);
    setCEmail(''); setCName(''); setCEmpNo(''); setCHire(''); setCPw('');
  }

  function pickEmployee(id: string) {
    setAdjUser(id);
    setEditName(s.profilesById[id]?.name || '');
    setEditEmpNo(s.profilesById[id]?.empNo || '');
    setHireInput(s.profilesById[id]?.hireDate || '');
    setInfoMsg(''); setAdjMsg('');
  }

  async function saveInfo() {
    setInfoMsg('');
    if (!adjUser) return;
    if (!editName.trim()) return setInfoMsg('이름은 비울 수 없습니다.');
    if (hireInput && !/^\d{4}-\d{2}-\d{2}$/.test(hireInput)) return setInfoMsg('입사일 형식은 YYYY-MM-DD 입니다.');
    await s.adminUpdateProfile(adjUser, { name: editName.trim(), empNo: editEmpNo.trim() || undefined, hireDate: hireInput || undefined });
    setInfoMsg('✓ 직원 정보 저장');
  }

  async function grant() {
    const h = parseFloat(adjHours);
    if (!adjUser || Number.isNaN(h)) return setAdjMsg('시간을 입력하세요.');
    await s.addAdjustment(adjUser, h, '관리자 조정');
    setAdjMsg(`✓ ${s.profilesById[adjUser]?.name || ''} 에 ${h}h 조정 반영`);
    setAdjHours('');
  }

  return (
    <Screen>
      <Hero style={{ paddingVertical: 22 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 3 }}>
            <Text style={{ color: t.onHeroDim, fontSize: 13, fontWeight: '600' }}>직원 관리</Text>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>{employees.length}명</Text>
          </View>
          <Badge text="👥 직원" color="#fff" soft="rgba(255,255,255,0.2)" />
        </Row>
        <Row style={{ gap: 8 }}>
          <StatTile onHero label="전체" value={`${employees.length}명`} />
          <StatTile onHero label="관리자" value={`${adminCount}명`} />
          <StatTile onHero label="입사일 미등록" value={`${employees.filter((e) => e.id !== s.user?.id && !e.hireDate).length}명`} />
        </Row>
      </Hero>

      {/* 직원 연차 현황 */}
      <Card>
        <Text style={{ fontWeight: '700', color: t.text }}>직원 연차 현황</Text>
        <Muted size={12}>발생분에서 승인 사용·대기 신청을 뺀 잔여입니다. (8시간 = 1일)</Muted>
        {employees.length === 0 && <Muted size={12}>등록된 직원이 없습니다.</Muted>}
        {employees.map((e) => {
          const b = balanceFor(e.id);
          return (
            <View key={e.id} style={{ gap: 4 }}>
              <Divider />
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Body style={{ fontWeight: '600' }}>{e.name}{e.empNo ? ` (${e.empNo})` : ''}</Body>
                {!e.hireDate ? (
                  <Badge text="입사일 미등록" color={t.warning} />
                ) : (
                  <Text style={{ fontWeight: '800', color: b && b.remainingHours < 0 ? t.danger : t.trip }}>
                    {b ? `${hoursToDayLabel(b.remainingHours, leavePolicy.fullDayHours)} (${b.remainingHours}h)` : '-'}
                  </Text>
                )}
              </Row>
              {e.hireDate && b && (
                <Muted size={11}>발생 {b.entitledHours}h · 사용 {b.usedHours}h · 대기 {b.pendingHours}h{b.adjustmentHours !== 0 ? ` · 조정 ${b.adjustmentHours > 0 ? '+' : ''}${b.adjustmentHours}h` : ''}</Muted>
              )}
            </View>
          );
        })}
      </Card>

      {/* 신규 직원 등록 */}
      <Card>
        <Text style={{ fontWeight: '700', color: t.text }}>신규 직원 등록</Text>
        <Muted size={12}>관리자가 계정을 생성합니다. 직원은 <Text style={{ fontWeight: '700' }}>이름 + 비밀번호</Text>로 로그인하며, 이후 비밀번호를 스스로 변경할 수 있습니다.</Muted>
        <Field label="이름 (로그인 ID)" value={cName} onChangeText={setCName} placeholder="홍길동" />
        <Field label="이메일 (계정 식별용)" value={cEmail} onChangeText={setCEmail} placeholder="hong@company.com" autoCapitalize="none" keyboardType="email-address" />
        <Row>
          <View style={{ flex: 1 }}><Field label="사번" value={cEmpNo} onChangeText={setCEmpNo} placeholder="2024001" autoCapitalize="none" /></View>
          <View style={{ flex: 1 }}><Field label="입사일" value={cHire} onChangeText={setCHire} placeholder="YYYY-MM-DD" autoCapitalize="none" /></View>
        </Row>
        <Field label="초기 비밀번호" value={cPw} onChangeText={setCPw} secureTextEntry placeholder="6자 이상" />
        {cMsg ? <Muted size={12} style={{ color: cMsg.startsWith('✓') ? t.success : t.danger }}>{cMsg}</Muted> : null}
        <Button label="직원 등록" variant="primary" loading={cBusy} onPress={createEmployee} />
      </Card>

      {/* 직원 편집/조정 */}
      <Card>
        <Text style={{ fontWeight: '700', color: t.text }}>직원 정보 · 연차 조정</Text>
        <View style={{ gap: 6 }}>
          <Text style={{ color: t.textDim, fontSize: 12.5, fontWeight: '600' }}>직원 선택 ({employees.length}명)</Text>
          <Row style={{ flexWrap: 'wrap' }}>
            {employees.length === 0 && <Muted size={12}>직원이 없습니다</Muted>}
            {employees.map((e) => (
              <Chip key={e.id} label={`${e.name}${e.empNo ? ` (${e.empNo})` : ''}${e.hireDate ? '' : ' ⚠'}`} active={adjUser === e.id} onPress={() => pickEmployee(e.id)} small />
            ))}
          </Row>
        </View>

        {adjUser ? (
          <>
            <Divider />
            <Field label="이름" value={editName} onChangeText={setEditName} />
            <Row>
              <View style={{ flex: 1 }}><Field label="사번" value={editEmpNo} onChangeText={setEditEmpNo} autoCapitalize="none" /></View>
              <View style={{ flex: 1 }}><Field label="입사일 (연차 기준)" value={hireInput} onChangeText={setHireInput} placeholder="YYYY-MM-DD" autoCapitalize="none" /></View>
            </Row>
            {infoMsg ? <Muted size={12} style={{ color: infoMsg.startsWith('✓') ? t.success : t.danger }}>{infoMsg}</Muted> : null}
            <Button label="직원 정보 저장" variant="primary" small onPress={saveInfo} />
            <Divider />
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '600' }}>관리자 권한</Body>
                <Muted size={12}>{adjUser === s.user?.id ? '본인 권한은 해제할 수 없습니다' : '이 직원을 관리자로 지정/해제'}</Muted>
              </View>
              <Switch
                value={!!s.profilesById[adjUser]?.isAdmin}
                color={t.trip}
                onValueChange={(v) => {
                  if (adjUser === s.user?.id) { setInfoMsg('본인 관리자 권한은 해제할 수 없습니다.'); return; }
                  s.adminUpdateProfile(adjUser, { isAdmin: v });
                  setInfoMsg(v ? '✓ 관리자로 지정' : '✓ 관리자 해제');
                }}
              />
            </Row>
            <Divider />
            {(() => {
              const b = balanceFor(adjUser);
              if (!s.profilesById[adjUser]?.hireDate) return <Muted size={12} style={{ color: t.warning }}>입사일이 없어 연차가 계산되지 않습니다. 위에서 입사일을 먼저 등록하세요.</Muted>;
              return b ? (
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Body style={{ fontWeight: '600' }}>현재 잔여 연차</Body>
                  <Text style={{ fontWeight: '800', color: b.remainingHours < 0 ? t.danger : t.trip }}>
                    {hoursToDayLabel(b.remainingHours, leavePolicy.fullDayHours)} ({b.remainingHours}h)
                  </Text>
                </Row>
              ) : null;
            })()}
            <Row style={{ alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}><Field label="연차 조정(h) · 양수=부여, 음수=차감" value={adjHours} onChangeText={setAdjHours} placeholder="예: 8 또는 -2" keyboardType="numbers-and-punctuation" /></View>
              <Button label="조정" variant="trip" small onPress={grant} />
            </Row>
            {adjMsg ? <Muted size={12}>{adjMsg}</Muted> : null}
            {(() => {
              const b = balanceFor(adjUser);
              return b && b.buckets.length > 0 ? (
                <LeaveYearBreakdown buckets={b.buckets} fullDay={leavePolicy.fullDayHours} title="연차 연도별 내역" />
              ) : null;
            })()}
          </>
        ) : (
          <Muted size={12}>편집하거나 연차를 조정할 직원을 선택하세요.</Muted>
        )}
      </Card>
    </Screen>
  );
}
