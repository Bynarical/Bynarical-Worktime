import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Hero,
  Card,
  Muted,
  Body,
  Badge,
  Chip,
  Row,
  Divider,
  StatTile,
  Button,
} from '@/components/ui';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { dateKey, minutesToHM, minutesToKor, minutesOfDay } from '@/lib/time';
import { hoursToDayLabel } from '@/lib/leave';
import { buildEmployeeOverview, EmployeeOverview, OverviewInput, TodayStatus } from '@/lib/adminOverview';

function won(n: number): string {
  return (n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';
}

const STATUS_META: Record<TodayStatus, { label: string; tone: 'primary' | 'success' | 'trip' | 'faint' }> = {
  WORKING: { label: '근무 중', tone: 'primary' },
  DONE: { label: '퇴근', tone: 'success' },
  LEAVE: { label: '연차', tone: 'trip' },
  ABSENT: { label: '미출근', tone: 'faint' },
};

export default function AdminDashboard() {
  const s = useStore();
  const t = useTheme();
  const router = useRouter();
  const today = dateKey();
  const [monthOffset, setMonthOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [onlyWarnings, setOnlyWarnings] = useState(false);

  const base = new Date();
  base.setMonth(base.getMonth() + monthOffset);
  const monthLabel = `${base.getFullYear()}년 ${base.getMonth() + 1}월`;
  const monthPrefix = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;

  const pending = useMemo(() => s.leaves.filter((l) => l.status === 'REQUESTED'), [s.leaves]);

  const overviews = useMemo(() => {
    const input: OverviewInput = {
      profilesById: s.profilesById,
      records: s.records,
      leaves: s.leaves,
      adjustments: s.adjustments,
      confirmations: s.confirmations,
      meals: s.meals,
      workPolicy: s.settings.workPolicy,
      leavePolicy: s.settings.leavePolicy,
      holidays: s.holidaySet,
      monthPrefix,
      today,
      nowMin: minutesOfDay(Date.now()),
    };
    const staffIds = Object.keys(s.profilesById).filter((id) => id !== s.user?.id);
    const list = staffIds.map((id) => buildEmployeeOverview(id, input));
    // 정렬: 경고 있는 직원 먼저, 그다음 이름순
    return list.sort((a, b) => {
      if (a.hasWarning !== b.hasWarning) return a.hasWarning ? -1 : 1;
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [s.profilesById, s.records, s.leaves, s.adjustments, s.confirmations, s.meals, s.settings, s.holidaySet, monthPrefix, today, s.user]);

  const presentCount = overviews.filter((o) => o.today.status === 'WORKING' || o.today.status === 'DONE').length;
  const missingHire = overviews.filter((o) => !o.hireDate).length;
  const unsignedStaff = overviews.filter((o) => o.unsignedWeeks > 0).length;
  const anomalyStaff = overviews.filter((o) => o.anomalyDays > 0).length;
  const negativeLeave = overviews.filter((o) => o.balance && o.balance.remainingHours < 0).length;
  const pendingRecCount = s.records.filter((r) => r.pending).length;

  const shown = onlyWarnings ? overviews.filter((o) => o.hasWarning) : overviews;

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <Screen>
      <Hero style={{ paddingVertical: 22 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 3 }}>
            <Text style={{ color: t.onHeroDim, fontSize: 13, fontWeight: '600' }}>관리자 콘솔</Text>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>{s.user?.name}님</Text>
            <Text style={{ color: t.onHeroDim, fontSize: 12 }}>{today}</Text>
          </View>
          <Badge text="👑 관리자" color="#fff" soft="rgba(255,255,255,0.2)" />
        </Row>
        <Row style={{ gap: 8 }}>
          <StatTile onHero label="직원" value={`${overviews.length}명`} />
          <StatTile onHero label="오늘 출근" value={`${presentCount}/${overviews.length}`} />
          <StatTile onHero label="승인 대기" value={`${pending.length}건`} />
        </Row>
      </Hero>

      {/* 주의 요약 */}
      {(missingHire || unsignedStaff || anomalyStaff || negativeLeave || pending.length || pendingRecCount) > 0 && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: t.text }}>⚠ 확인 필요</Text>
            <Chip label={onlyWarnings ? '전체 보기' : '경고만'} active={onlyWarnings} onPress={() => setOnlyWarnings((v) => !v)} small />
          </Row>
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            {pendingRecCount > 0 && <Badge text={`근무지밖 출근 ${pendingRecCount}건`} color={t.danger} />}
            {pending.length > 0 && <Badge text={`연차 승인 ${pending.length}건`} color={t.warning} />}
            {anomalyStaff > 0 && <Badge text={`이상징후 ${anomalyStaff}명`} color={t.danger} />}
            {unsignedStaff > 0 && <Badge text={`미서명 ${unsignedStaff}명`} color={t.textDim} />}
            {missingHire > 0 && <Badge text={`입사일 미등록 ${missingHire}명`} color={t.warning} />}
            {negativeLeave > 0 && <Badge text={`연차 초과 ${negativeLeave}명`} color={t.danger} />}
          </Row>
          {pending.length > 0 && (
            <Button label="승인 화면으로" variant="primary" small onPress={() => router.push('/(admin)/approvals')} />
          )}
        </Card>
      )}

      {/* 월 이동 */}
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable onPress={() => setMonthOffset((v) => v - 1)} hitSlop={12}>
            <Text style={{ color: t.primary, fontSize: 22, fontWeight: '700' }}>‹</Text>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Muted size={11}>직원 종합 현황 기준월</Muted>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>{monthLabel}</Text>
          </View>
          <Pressable onPress={() => monthOffset < 0 && setMonthOffset((v) => v + 1)} hitSlop={12}>
            <Text style={{ color: monthOffset >= 0 ? t.textFaint : t.primary, fontSize: 22, fontWeight: '700' }}>›</Text>
          </Pressable>
        </Row>
      </Card>

      {/* 직원별 종합 카드 */}
      {shown.length === 0 && <Card><Muted>표시할 직원이 없습니다.</Muted></Card>}
      {shown.map((o) => (
        <EmployeeCard key={o.id} o={o} expanded={expanded.has(o.id)} onToggle={() => toggle(o.id)} />
      ))}
    </Screen>
  );
}

function EmployeeCard({ o, expanded, onToggle }: { o: EmployeeOverview; expanded: boolean; onToggle: () => void }) {
  const t = useTheme();
  const meta = STATUS_META[o.today.status];
  const toneColor = meta.tone === 'primary' ? t.primary : meta.tone === 'success' ? t.success : meta.tone === 'trip' ? t.trip : t.textFaint;
  const inHM = o.today.checkInMin != null ? minutesToHM(o.today.checkInMin) : '--:--';
  const outHM = o.today.checkOutMin != null ? minutesToHM(o.today.checkOutMin) : (o.today.status === 'WORKING' ? '근무 중' : '--:--');
  const shortfallDays = o.month.shortfallDays;

  return (
    <Card>
      <Pressable onPress={onToggle}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Row style={{ gap: 6, alignItems: 'center', flexShrink: 1 }}>
            <Body style={{ fontWeight: '800' }}>{o.name}</Body>
            {o.empNo ? <Muted size={12}>({o.empNo})</Muted> : null}
            {o.isAdmin ? <Badge text="관리자" color={t.trip} /> : null}
            {o.hasWarning ? <Text style={{ color: t.danger }}>●</Text> : null}
          </Row>
          <Badge text={meta.label} color={toneColor} />
        </Row>
      </Pressable>

      {/* 오늘 */}
      {o.today.status !== 'LEAVE' && (
        <Muted size={12}>오늘: {inHM} → {outHM}</Muted>
      )}

      {/* 핵심 지표 */}
      <Row style={{ gap: 8, flexWrap: 'wrap' }}>
        <Metric label="이번달 근무" value={`${o.month.days}일`} />
        <Metric label="정상근무" value={`${o.month.normalDays}일`} color={t.success} />
        <Metric
          label="근로부족"
          value={shortfallDays > 0 ? `${shortfallDays}일 -${minutesToKor(o.month.shortfallMinutes)}` : '없음'}
          color={shortfallDays > 0 ? t.danger : t.success}
        />
        {!o.isAdmin && (
          <Metric
            label="연차 잔여"
            value={o.balance ? hoursToDayLabel(o.balance.remainingHours) : '미산정'}
            color={o.balance ? (o.balance.remainingHours < 0 ? t.danger : t.trip) : t.textFaint}
          />
        )}
      </Row>

      {/* 경고 뱃지 */}
      {(o.anomalyDays > 0 || o.unsignedWeeks > 0 || o.pendingLeaveCount > 0 || (!o.isAdmin && !o.hireDate)) && (
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>
          {o.anomalyDays > 0 && <Badge text={`이상 ${o.anomalyDays}일`} color={t.danger} />}
          {o.unsignedWeeks > 0 && <Badge text={`미서명 ${o.unsignedWeeks}주`} color={t.textDim} />}
          {o.pendingLeaveCount > 0 && <Badge text={`연차대기 ${o.pendingLeaveCount}건`} color={t.warning} />}
          {!o.isAdmin && !o.hireDate && <Badge text="입사일 미등록" color={t.warning} />}
        </Row>
      )}

      {/* 펼침: 상세 */}
      {expanded && (
        <>
          <Divider />
          {!o.isAdmin && (
            <>
              <KV k="입사일" v={o.hireDate || '미등록'} />
              <Divider />
            </>
          )}
          <Text style={{ fontWeight: '700', color: t.textDim, fontSize: 13 }}>이번달 근태</Text>
          <KV k="정상근무 / 소정근무" v={`${o.month.normalDays}일 / ${o.month.scheduledDays}일`} />
          <KV k="지각" v={`${o.month.lateCount}회`} />
          <KV k="코어타임 위반" v={`${o.month.coreViolationCount}회`} />
          <KV k="조기퇴근" v={`${o.month.earlyLeaveCount}회`} />
          <KV k="퇴근 미기록" v={`${o.month.missingCount}회`} />
          <KV k="출장" v={`${o.month.tripCount}회`} />
          {!o.isAdmin && <KV k="사용 연차(이번달)" v={`${o.month.leaveMinutes / 60}h`} />}
          <KV k="미서명 주" v={o.unsignedWeeks > 0 ? `${o.unsignedWeeks}주` : '없음'} />
          <KV k="이번달 식대" v={won(o.mealTotal)} />
          {o.balance && (
            <>
              <Divider />
              <Text style={{ fontWeight: '700', color: t.textDim, fontSize: 13 }}>연차</Text>
              <KV k="잔여" v={`${hoursToDayLabel(o.balance.remainingHours)} (${o.balance.remainingHours}h)`} />
              <KV k="발생 / 사용 / 대기" v={`${o.balance.entitledHours}h / ${o.balance.usedHours}h / ${o.balance.pendingHours}h`} />
              {o.balance.adjustmentHours !== 0 && <KV k="관리자 조정" v={`${o.balance.adjustmentHours > 0 ? '+' : ''}${o.balance.adjustmentHours}h`} />}
            </>
          )}
        </>
      )}
    </Card>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.cardAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, minWidth: 78 }}>
      <Text style={{ fontSize: 11, color: t.textDim }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '800', color: color || t.text }}>{value}</Text>
    </View>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  const t = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Muted size={13}>{k}</Muted>
      <Text style={{ fontSize: 13, fontWeight: '700', color: t.text }}>{v}</Text>
    </Row>
  );
}
