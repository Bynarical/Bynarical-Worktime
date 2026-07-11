import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import {
  Screen,
  Card,
  Title,
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
      <Title>연차 관리</Title>

      {/* 잔액 */}
      {balance && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: t.text }}>내 연차</Text>
            <Badge text={hoursToDayLabel(balance.remainingHours, policy.fullDayHours) + ' 남음'} color={t.success} />
          </Row>
          <Row style={{ gap: 10, flexWrap: 'wrap' }}>
            <StatTile label="발생" value={hoursToDayLabel(balance.entitledHours)} sub={`${balance.entitledHours}h`} />
            <StatTile label="사용" value={hoursToDayLabel(balance.usedHours)} sub={`${balance.usedHours}h`} color={t.trip} />
            <StatTile label="대기" value={hoursToDayLabel(balance.pendingHours)} sub={`${balance.pendingHours}h`} color={t.warning} />
            <StatTile label="잔여" value={hoursToDayLabel(balance.remainingHours)} sub={`${balance.remainingHours}h`} color={t.primary} />
          </Row>
          <Divider />
          <Muted size={12}>{balance.accrual.basis}</Muted>
          {balance.adjustmentHours !== 0 && <Muted size={12}>관리자 조정: {balance.adjustmentHours > 0 ? '+' : ''}{balance.adjustmentHours}h</Muted>}
          {!s.user?.hireDate && <Muted size={12}><Text style={{ color: t.warning }}>입사일이 없습니다. 설정에서 입사일을 등록하면 연차가 자동 계산됩니다.</Text></Muted>}
        </Card>
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
  const [adjUser, setAdjUser] = useState('');
  const [adjHours, setAdjHours] = useState('');
  const [adjMsg, setAdjMsg] = useState('');

  async function grant() {
    const h = parseFloat(adjHours);
    if (!adjUser.trim() || Number.isNaN(h)) {
      setAdjMsg('사용자 ID와 시간을 입력하세요.');
      return;
    }
    await s.addAdjustment(adjUser.trim(), h, '관리자 조정');
    setAdjMsg(`✓ ${adjUser} 에 ${h}h 조정 반영`);
    setAdjHours('');
  }

  return (
    <>
      <Divider />
      <Row><Badge text="관리자" color={t.primary} /><Text style={{ fontWeight: '800', color: t.text }}>연차 승인 / 조정</Text></Row>

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

      <Card>
        <Text style={{ fontWeight: '700', color: t.text }}>연차 수동 조정</Text>
        <Muted size={12}>사용자 ID(사번 있으면 u_사번, 없으면 u_해시)에 시간을 가감합니다. 양수=부여, 음수=차감.</Muted>
        <Field label="사용자 ID" value={adjUser} onChangeText={setAdjUser} placeholder="u_2024001" autoCapitalize="none" />
        <Field label="시간(h)" value={adjHours} onChangeText={setAdjHours} placeholder="예: 8 또는 -2" keyboardType="numbers-and-punctuation" />
        {adjMsg ? <Muted size={12}>{adjMsg}</Muted> : null}
        <Button label="조정 적용" variant="primary" small onPress={grant} />
      </Card>
    </>
  );
}
