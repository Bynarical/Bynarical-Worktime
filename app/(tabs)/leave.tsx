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
import { useStore, isTestAccount } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import {
  computeBalance,
  hoursToDayLabel,
  validateRequest,
  deductsBalance,
  leaveCategoryLabel,
  SEGMENT_LABELS,
  STATUS_LABELS,
  LEAVE_CATEGORY_ICONS,
  LEAVE_CATEGORY_NOTES,
} from '@/lib/leave';
import { leaveStyle } from '@/lib/palette';
import { LeaveYearBreakdown } from '@/components/LeaveYearBreakdown';
import { dateKey, addDaysKey, hmToMinutes } from '@/lib/time';
import { LeaveSegment, LeaveUnit, LeaveRequest, LeaveCategory } from '@/lib/types';

export default function Leave() {
  const s = useStore();
  const t = useTheme();
  const policy = s.settings.leavePolicy;

  const leaveCtx = useMemo(
    () => ({ records: s.records, workPolicy: s.settings.workPolicy, holidays: s.holidaySet }),
    [s.records, s.settings.workPolicy, s.holidaySet]
  );
  const balance = useMemo(
    () => (s.user ? computeBalance(s.user, s.leaves, s.adjustments, policy, undefined, leaveCtx) : null),
    [s.user, s.leaves, s.adjustments, policy, leaveCtx]
  );

  const [date, setDate] = useState(dateKey());
  const [category, setCategory] = useState<LeaveCategory>('ANNUAL');
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

  // 올해 사용한 특별휴가(유급·무급) — 연차 잔여에 안 잡히니 따로 보여준다.
  const special = useMemo(() => {
    const yr = dateKey().slice(0, 4);
    const mine = s.leaves.filter((l) => l.userId === s.user?.id && l.status === 'APPROVED' && l.date.startsWith(yr));
    const sum = (c: LeaveCategory) => mine.filter((l) => l.category === c).reduce((a, l) => a + l.hours, 0);
    return { year: yr, paid: sum('PAID'), unpaid: sum('UNPAID') };
  }, [s.leaves, s.user]);

  const catStyle = leaveStyle(t, category);
  const reasonPresets: Record<LeaveCategory, string[]> = {
    ANNUAL: [],
    PAID: ['예비군', '공가', '경조사', '병가'],
    UNPAID: ['개인사정', '가족돌봄', '병가(무급)', '연차 소진'],
  };

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
    if (!deductsBalance(category) && !reason.trim()) {
      setMsg(
        category === 'PAID'
          ? '유급휴가는 사유(예: 예비군, 공가, 경조사)를 입력하세요.'
          : '무급휴가는 사유(예: 개인사정, 가족돌봄)를 입력하세요.'
      );
      return;
    }
    const v = validateRequest(s.user, { date, hours: effHours, category }, s.leaves, s.adjustments, policy, leaveCtx);
    if (!v.ok) {
      setMsg(v.reason || '신청할 수 없습니다.');
      return;
    }
    await s.requestLeave({
      date,
      hours: effHours,
      segment,
      category,
      startTime: segment === 'CUSTOM' ? startTime : undefined,
      endTime: segment === 'CUSTOM' ? endTime : undefined,
      reason: reason.trim() || undefined,
    });
    setMsg(`✓ ${leaveCategoryLabel(category)} 신청이 접수되었습니다.`);
    setReason('');
  }

  return (
    <Screen>
      {/* 잔액 히어로 */}
      {balance && (
        <Hero>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: t.onHeroDim, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 }}>내 연차 잔여</Text>
              {balance.activeLabel && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{balance.activeLabel}</Text>}
            </View>
            <Badge text="🌴 연차" color="#fff" soft="rgba(255,255,255,0.2)" />
          </Row>
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1 }}>
            {hoursToDayLabel(balance.availableNowHours, policy.fullDayHours)}
          </Text>
          <Row style={{ gap: 8 }}>
            <StatTile onHero label="발생" value={hoursToDayLabel(balance.entitledHours)} sub={`${balance.entitledHours}h`} />
            <StatTile onHero label="사용" value={hoursToDayLabel(balance.usedHours)} sub={`${balance.usedHours}h`} />
            <StatTile onHero label="대기" value={hoursToDayLabel(balance.pendingHours)} sub={`${balance.pendingHours}h`} />
          </Row>
          {balance.scheduledHours > 0 && (
            <Text style={{ color: t.onHeroDim, fontSize: 12 }}>
              🗓 예정된 연차 {hoursToDayLabel(balance.scheduledHours, policy.fullDayHours)} · 미래 승인분은 실제 사용일에 차감됩니다
            </Text>
          )}
          <Text style={{ color: t.onHeroDim, fontSize: 12 }}>{balance.accrual.basis}</Text>
          {balance.adjustmentHours !== 0 && (
            <Text style={{ color: t.onHeroDim, fontSize: 12 }}>관리자 조정: {balance.adjustmentHours > 0 ? '+' : ''}{balance.adjustmentHours}h</Text>
          )}
        </Hero>
      )}
      {!s.user?.hireDate && (
        <Card><Muted size={12} style={{ color: t.warning }}>입사일이 등록되지 않았습니다. 관리자가 입사일을 등록하면 연차가 자동 계산됩니다.</Muted></Card>
      )}

      {/* 연차 연도별 내역 */}
      {balance && balance.buckets.length > 0 && <LeaveYearBreakdown buckets={balance.buckets} fullDay={policy.fullDayHours} />}

      {/* 올해 사용한 특별휴가 (연차 잔여와 무관) */}
      {(special.paid > 0 || special.unpaid > 0) && (
        <Card>
          <Text style={{ fontWeight: '700', color: t.text }}>{special.year}년 특별휴가 사용</Text>
          <Muted size={12}>유급·무급휴가는 연차 잔여에서 차감되지 않아 위 내역과 별도로 집계됩니다.</Muted>
          <Row style={{ gap: 8 }}>
            <StatTile
              label={`${LEAVE_CATEGORY_ICONS.PAID} 유급휴가`}
              value={hoursToDayLabel(special.paid, policy.fullDayHours)}
              sub={`${special.paid}h · 급여 지급`}
              color={t.leavePaid}
            />
            <StatTile
              label={`${LEAVE_CATEGORY_ICONS.UNPAID} 무급휴가`}
              value={hoursToDayLabel(special.unpaid, policy.fullDayHours)}
              sub={`${special.unpaid}h · 급여 미지급`}
              color={t.leaveUnpaid}
            />
          </Row>
        </Card>
      )}

      {/* 신청 폼 */}
      <Card>
        <Text style={{ fontWeight: '700', color: t.text }}>휴가 신청</Text>
        <Muted size={12}>{LEAVE_CATEGORY_NOTES[category]}</Muted>

        <View style={{ gap: 6 }}>
          <Text style={{ color: t.textDim, fontSize: 13, fontWeight: '600' }}>종류</Text>
          <Row style={{ flexWrap: 'wrap' }}>
            {(['ANNUAL', 'PAID', 'UNPAID'] as LeaveCategory[]).map((c) => (
              <Chip
                key={c}
                label={`${LEAVE_CATEGORY_ICONS[c]} ${leaveCategoryLabel(c)}`}
                active={category === c}
                color={leaveStyle(t, c).color}
                onPress={() => {
                  setCategory(c);
                  setReason('');
                  if (c !== 'ANNUAL') pickSegment('FULL');
                }}
              />
            ))}
          </Row>
          {reasonPresets[category].length > 0 && (
            <Row style={{ flexWrap: 'wrap' }}>
              {reasonPresets[category].map((r) => (
                <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} small color={catStyle.color} />
              ))}
            </Row>
          )}
        </View>

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
              <Chip key={seg} label={SEGMENT_LABELS[seg]} active={segment === seg} onPress={() => pickSegment(seg)} color={catStyle.color} />
            ))}
          </Row>
        </View>

        {segment !== 'FULL' && segment !== 'CUSTOM' && (
          <View style={{ gap: 6 }}>
            <Text style={{ color: t.textDim, fontSize: 13, fontWeight: '600' }}>사용 시간</Text>
            <Row>
              {([2, 4, 6] as LeaveUnit[]).map((h) => (
                <Chip key={h} label={`${h}h`} active={hours === h} onPress={() => setHours(h)} />
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

        <Field
          label={deductsBalance(category) ? '사유 (선택)' : '사유 (필수)'}
          value={reason}
          onChangeText={setReason}
          placeholder={category === 'ANNUAL' ? '예: 병원 방문' : category === 'PAID' ? '예: 예비군' : '예: 개인사정'}
        />
        {msg ? <Muted size={13}><Text style={{ color: msg.startsWith('✓') ? t.success : t.danger }}>{msg}</Text></Muted> : null}
        <Button
          label={`${leaveCategoryLabel(category)} 신청`}
          variant={category === 'ANNUAL' ? 'annual' : category === 'PAID' ? 'paid' : 'unpaid'}
          onPress={submit}
        />
      </Card>

      {/* 내 신청 내역 */}
      <Text style={{ fontWeight: '700', color: t.text }}>내 신청 내역</Text>
      {myLeaves.length === 0 && <Card><Muted>신청 내역이 없습니다</Muted></Card>}
      {myLeaves.map((l) => (
        <Card key={l.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row style={{ gap: 6 }}>
              <Body style={{ fontWeight: '700' }}>{l.date}</Body>
              <Badge
                text={`${LEAVE_CATEGORY_ICONS[l.category ?? 'ANNUAL']} ${leaveCategoryLabel(l.category)}`}
                color={leaveStyle(t, l.category).color}
                soft={leaveStyle(t, l.category).soft}
              />
            </Row>
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
  const employees = Object.entries(s.profilesById).map(([id, p]) => ({ id, ...p })).filter((e) => !isTestAccount(e));

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
            <Badge text={`${leaveCategoryLabel(l.category)} ${l.hours}h`} color={leaveStyle(t, l.category).color} soft={leaveStyle(t, l.category).soft} />
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
                color={t.primary}
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
              <Button label="조정" variant="annual" small onPress={grant} />
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
