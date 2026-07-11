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
  KV,
  StatTile,
  Field,
  Switch,
} from '@/components/ui';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { computeBalance, hoursToDayLabel, validateRequest, SEGMENT_LABELS, STATUS_LABELS } from '@/lib/leave';
import { dateKey, addDaysKey, hmToMinutes } from '@/lib/time';
import { LeaveSegment, LeaveUnit, LeaveRequest } from '@/lib/types';

export default function Leave() {
  const s = useStore();
  const t = useTheme();
  const policy = s.settings.leavePolicy;

  const balance = useMemo(
    () => (s.user ? computeBalance(s.user, s.leaves, s.adjustments, policy) : null),
    [s.user, s.leaves, s.adjustments, policy]
  );

  const [date, setDate] = useState(dateKey());
  const [segment, setSegment] = useState<LeaveSegment>('AM');
  const [hours, setHours] = useState<LeaveUnit>(2);
  const [startTime, setStartTime] = useState('13:00');
  const [endTime, setEndTime] = useState('15:00');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');

  const myLeaves = useMemo(
    () => s.leaves.filter((l) => l.userId === s.user?.id).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [s.leaves, s.user]
  );

  function pickSegment(seg: LeaveSegment) {
    setSegment(seg);
    if (seg === 'FULL') setHours(8);
    else if (hours === 8) setHours(4);
  }

  async function submit() {
    setMsg('');
    if (!s.user) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setMsg('날짜 형식은 YYYY-MM-DD 입니다.');
      return;
    }
    let effHours = hours;
    if (segment === 'CUSTOM') {
      const diff = (hmToMinutes(endTime) - hmToMinutes(startTime)) / 60;
      if (diff <= 0) {
        setMsg('종료 시각이 시작보다 늦어야 합니다.');
        return;
      }
      const rounded = Math.round(diff / 2) * 2;
      if (![2, 4, 6, 8].includes(rounded)) {
        setMsg('직접 지정은 2/4/6/8시간 단위로만 가능합니다. (현재 ' + diff + 'h)');
        return;
      }
      effHours = rounded as LeaveUnit;
    }
    const v = validateRequest(s.user, { date, hours: effHours }, s.leaves, s.adjustments, policy);
    if (!v.ok) {
      setMsg(v.reason || '신청할 수 없습니다.');
      return;
    }
    await s.requestLeave({
      date,
      hours: effHours,
      segment,
      startTime: segment === 'CUSTOM' ? startTime : undefined,
      endTime: segment === 'CUSTOM' ? endTime : undefined,
      reason: reason.trim() || undefined,
    });
    setMsg('✓ 연차 신청이 접수되었습니다.');
    setReason('');
  }

  return (
    <Screen>
      {/* 잔액 히어로 */}
      {balance && (
        <Hero>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={{ color: t.onHeroDim, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 }}>내 연차 잔여</Text>
            <Badge text="🌴 연차" color="#fff" soft="rgba(255,255,255,0.2)" />
          </Row>
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1 }}>
            {hoursToDayLabel(balance.remainingHours, policy.fullDayHours)}
          </Text>
          <Row style={{ gap: 8 }}>
            <StatTile onHero label="발생" value={hoursToDayLabel(balance.entitledHours)} sub={`${balance.entitledHours}h`} />
            <StatTile onHero label="사용" value={hoursToDayLabel(balance.usedHours)} sub={`${balance.usedHours}h`} />
            <StatTile onHero label="대기" value={hoursToDayLabel(balance.pendingHours)} sub={`${balance.pendingHours}h`} />
          </Row>
          <Text style={{ color: t.onHeroDim, fontSize: 12 }}>{balance.accrual.basis}</Text>
          {balance.adjustmentHours !== 0 && (
            <Text style={{ color: t.onHeroDim, fontSize: 12 }}>관리자 조정: {balance.adjustmentHours > 0 ? '+' : ''}{balance.adjustmentHours}h</Text>
          )}
        </Hero>
      )}
      {!s.user?.hireDate && (
        <Card><Muted size={12} style={{ color: t.warning }}>입사일이 등록되지 않았습니다. 관리자가 입사일을 등록하면 연차가 자동 계산됩니다.</Muted></Card>
      )}

      {/* 신청 폼 */}
      <Card>
        <Text style={{ fontWeight: '700', color: t.text }}>연차/반반차 신청</Text>
        <Muted size={12}>제6조: 2시간 단위(2/4/6/8h)로 분할 사용 가능. 사용한 시간만큼 차감됩니다.</Muted>

        <View style={{ gap: 6 }}>
          <Text style={{ color: t.textDim, fontSize: 13, fontWeight: '600' }}>날짜</Text>
          <Row style={{ flexWrap: 'wrap' }}>
            <Chip label="오늘" active={date === dateKey()} onPress={() => setDate(dateKey())} />
            <Chip label="내일" active={date === addDaysKey(dateKey(), 1)} onPress={() => setDate(addDaysKey(dateKey(), 1))} />
            <View style={{ flex: 1, minWidth: 130 }}>
              <Field value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            </View>
          </Row>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ color: t.textDim, fontSize: 13, fontWeight: '600' }}>구분</Text>
          <Row style={{ flexWrap: 'wrap' }}>
            {(['AM', 'PM', 'FULL', 'CUSTOM'] as LeaveSegment[]).map((seg) => (
              <Chip key={seg} label={SEGMENT_LABELS[seg]} active={segment === seg} onPress={() => pickSegment(seg)} color={t.trip} />
            ))}
          </Row>
        </View>

        {segment !== 'FULL' && segment !== 'CUSTOM' && (
          <View style={{ gap: 6 }}>
            <Text style={{ color: t.textDim, fontSize: 13, fontWeight: '600' }}>사용 시간</Text>
            <Row>
              {([2, 4, 6] as LeaveUnit[]).map((h) => (
                <Chip key={h} label={h === 2 ? '2h(반반차)' : h === 4 ? '4h(반차)' : '6h'} active={hours === h} onPress={() => setHours(h)} />
              ))}
            </Row>
          </View>
        )}

        {segment === 'CUSTOM' && (
          <Row>
            <View style={{ flex: 1 }}><Field label="시작" value={startTime} onChangeText={setStartTime} placeholder="13:00" /></View>
            <View style={{ flex: 1 }}><Field label="종료" value={endTime} onChangeText={setEndTime} placeholder="15:00" /></View>
          </Row>
        )}

        <Field label="사유 (선택)" value={reason} onChangeText={setReason} placeholder="예: 병원 방문" />
        {msg ? <Muted size={13}><Text style={{ color: msg.startsWith('✓') ? t.success : t.danger }}>{msg}</Text></Muted> : null}
        <Button label="연차 신청" variant="trip" onPress={submit} />
      </Card>

      {/* 내 신청 내역 */}
      <Text style={{ fontWeight: '700', color: t.text }}>내 신청 내역</Text>
      {myLeaves.length === 0 && <Card><Muted>신청 내역이 없습니다</Muted></Card>}
      {myLeaves.map((l) => (
        <Card key={l.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '700' }}>{l.date}</Body>
            <StatusBadge status={l.status} />
          </Row>
          <KV k="구분 / 시간" v={`${SEGMENT_LABELS[l.segment]} · ${l.hours}시간`} />
          {l.reason ? <KV k="사유" v={l.reason} /> : null}
          {l.decidedBy ? <Muted size={12}>{STATUS_LABELS[l.status]} · {l.decidedBy}{l.decisionNote ? ` (${l.decisionNote})` : ''}</Muted> : null}
          {l.status === 'REQUESTED' && (
            <Button label="신청 취소" variant="neutral" small onPress={() => s.cancelLeave(l.id)} />
          )}
        </Card>
      ))}

      {/* 관리자: 승인 대기 */}
      {s.adminUnlocked && <AdminApproval />}
    </Screen>
  );
}

function StatusBadge({ status }: { status: LeaveRequest['status'] }) {
  const t = useTheme();
  const color =
    status === 'APPROVED' ? t.success : status === 'REJECTED' ? t.danger : status === 'CANCELED' ? t.textFaint : t.warning;
  return <Badge text={STATUS_LABELS[status]} color={color} />;
}

function AdminApproval() {
  const s = useStore();
  const t = useTheme();
  const pending = s.leaves.filter((l) => l.status === 'REQUESTED');
  const employees = Object.entries(s.profilesById).map(([id, p]) => ({ id, ...p }));

  // 직원 등록
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
    <>
      <Divider />
      <Row><Badge text="관리자" color={t.primary} /><Text style={{ fontWeight: '800', color: t.text }}>연차 승인 / 직원 관리</Text></Row>

      {/* 승인 대기 */}
      <Text style={{ fontWeight: '700', color: t.textDim }}>승인 대기 ({pending.length})</Text>
      {pending.length === 0 && <Card><Muted>대기 중인 신청이 없습니다</Muted></Card>}
      {pending.map((l) => (
        <Card key={l.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '700' }}>{l.userName} · {l.date}</Body>
            <Badge text={`${l.hours}h`} color={t.trip} />
          </Row>
          <Muted size={12}>{SEGMENT_LABELS[l.segment]}{l.reason ? ` · ${l.reason}` : ''}</Muted>
          <Row>
            <Button label="승인" variant="success" small style={{ flex: 1 }} onPress={() => s.decideLeave(l.id, true)} />
            <Button label="반려" variant="danger" small style={{ flex: 1 }} onPress={() => s.decideLeave(l.id, false)} />
          </Row>
        </Card>
      ))}

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
            <Row style={{ alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}><Field label="연차 조정(h) · 양수=부여, 음수=차감" value={adjHours} onChangeText={setAdjHours} placeholder="예: 8 또는 -2" keyboardType="numbers-and-punctuation" /></View>
              <Button label="조정" variant="trip" small onPress={grant} />
            </Row>
            {adjMsg ? <Muted size={12}>{adjMsg}</Muted> : null}
          </>
        ) : (
          <Muted size={12}>편집하거나 연차를 조정할 직원을 선택하세요.</Muted>
        )}
      </Card>
    </>
  );
}
