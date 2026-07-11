import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
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
} from '@/components/ui';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { getCurrentPoint, nearestWorkplace } from '@/lib/geo';
import { computeDay, expectedClockOutLabel } from '@/lib/attendance';
import { dateKey, minutesOfDay, minutesToHM, minutesToKor, timeHM, timeSlots, hmToMinutes } from '@/lib/time';
import { GeoPoint, Workplace } from '@/lib/types';

function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => new Date().getTime());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().getTime()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function Today() {
  const s = useStore();
  const t = useTheme();
  const router = useRouter();
  const now = useNow();
  const policy = s.settings.workPolicy;

  const [busy, setBusy] = useState(false);
  const [trip, setTrip] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string>('');
  const [confirmOutOfRange, setConfirmOutOfRange] = useState(false);

  const today = dateKey(now);
  const rec = s.records.find((r) => r.userId === s.user?.id && r.date === today);
  const todaysLeaves = s.leaves.filter(
    (l) => l.userId === s.user?.id && l.date === today && (l.status === 'APPROVED' || l.status === 'REQUESTED')
  );

  const comp = useMemo(
    () => computeDay(rec, todaysLeaves.filter((l) => l.status === 'APPROVED'), policy, { nowMin: minutesOfDay(now), dateStr: today }),
    [rec, todaysLeaves, policy, now, today]
  );

  const plannedStart = rec?.plannedStart || policy.latestClockIn;
  const slots = useMemo(
    () => timeSlots(policy.earliestClockIn, policy.latestClockIn, policy.clockInStepMinutes),
    [policy]
  );

  const state: 'before' | 'working' | 'done' = !rec?.checkIn ? 'before' : !rec?.checkOut ? 'working' : 'done';

  async function doCheckIn(kind: 'WORK' | 'TRIP', override = false) {
    if (busy) return;
    setBusy(true);
    setGeoMsg('위치 확인 중...');
    const point = await getCurrentPoint();
    let workplace: Workplace | null = null;
    let within = false;
    let dist = Infinity;
    if (point) {
      const n = nearestWorkplace(point, s.settings.workplaces);
      workplace = n.workplace;
      within = n.within;
      dist = n.distance;
    }
    if (kind === 'WORK' && !within && !override) {
      setGeoMsg(
        point
          ? `근무지 반경 밖입니다 (${workplace?.name ?? '가장 가까운 근무지'}까지 ${Math.round(dist)}m). 출장이 아니라면 위치를 확인하세요.`
          : '위치를 가져오지 못했습니다. 권한을 확인하거나 출장 모드를 사용하세요.'
      );
      setConfirmOutOfRange(true);
      setBusy(false);
      return;
    }
    await s.checkIn({ type: kind, point: point ?? undefined, workplace, within });
    setGeoMsg(
      point
        ? within
          ? `✓ ${workplace?.name} 반경 내 확인 (${Math.round(dist)}m)`
          : `기록됨 (반경 밖 ${Math.round(dist)}m)`
        : '기록됨 (위치 없음)'
    );
    setConfirmOutOfRange(false);
    setBusy(false);
  }

  async function doCheckOut() {
    if (busy) return;
    setBusy(true);
    setGeoMsg('위치 확인 중...');
    const point = await getCurrentPoint();
    let within = false;
    let dist = Infinity;
    if (point) {
      const n = nearestWorkplace(point, s.settings.workplaces);
      within = n.within;
      dist = n.distance;
    }
    await s.checkOut({ point: point ?? undefined, within });
    setGeoMsg(point ? `퇴근 기록됨 (${Math.round(dist)}m)` : '퇴근 기록됨 (위치 없음)');
    setBusy(false);
  }

  const workedNow = comp.workedMinutes;
  const remaining = Math.max(0, comp.requiredMinutes - workedNow);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Muted>{today} · {['일', '월', '화', '수', '목', '금', '토'][new Date(now).getDay()]}요일</Muted>
          <Title>{s.user?.name}님 👋</Title>
        </View>
        <Text style={{ fontSize: 30, fontWeight: '800', color: t.primary }}>{timeHM(now)}</Text>
      </Row>

      {/* 코어타임 안내 */}
      <Card style={{ backgroundColor: t.accentSoft, borderColor: t.primary + '55' }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: t.primary, fontWeight: '800' }}>코어타임 {policy.coreStart}–{policy.coreEnd}</Text>
          <Badge text={`휴게 ${policy.breakStart}–${policy.breakEnd}`} color={t.primary} />
        </Row>
        <Muted size={12}>
          출근은 {policy.earliestClockIn}~{policy.latestClockIn} 사이 {policy.clockInStepMinutes}분 단위로 선택하며, 소정근로 {policy.dailyWorkMinutes / 60}시간(휴게 제외)입니다.
        </Muted>
      </Card>

      {/* 연차 표시 */}
      {todaysLeaves.length > 0 && (
        <Card>
          <SectionRow label="오늘의 연차">
            <Badge text={comp.isFullLeave ? '종일' : `${comp.leaveMinutes / 60}시간`} color={t.trip} />
          </SectionRow>
          {todaysLeaves.map((l) => (
            <KV
              key={l.id}
              k={`${l.hours}시간 · ${l.segment === 'FULL' ? '종일' : l.segment === 'AM' ? '오전' : l.segment === 'PM' ? '오후' : '지정'}`}
              v={l.status === 'APPROVED' ? '승인' : '대기'}
              vColor={l.status === 'APPROVED' ? t.success : t.warning}
            />
          ))}
        </Card>
      )}

      {/* 상태 카드 */}
      <Card>
        {state === 'before' && !comp.isFullLeave && (
          <>
            <SectionRow label="출근 예정 시각 선택" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {slots.map((hm) => (
                <Chip key={hm} label={hm} active={plannedStart === hm} onPress={() => s.setPlannedStart(hm)} />
              ))}
            </View>
            <Divider />
            <KV k="예상 퇴근 시각" v={expectedClockOutLabel(plannedStart, policy)} vColor={t.primary} />
            <KV k="소정근로" v={minutesToKor(comp.requiredMinutes)} />
          </>
        )}

        {state === 'before' && comp.isFullLeave && (
          <Body>오늘은 종일 연차입니다. 출근 기록이 필요하지 않습니다. 🌴</Body>
        )}

        {state === 'working' && (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <SectionRow label="근무 중" />
              {rec?.type === 'TRIP' ? <Badge text="출장" color={t.trip} /> : rec?.inVerified ? <Badge text="위치확인" color={t.success} /> : <Badge text="위치미확인" color={t.warning} />}
            </Row>
            <Row style={{ gap: 10 }}>
              <StatTile label="출근" value={rec?.checkIn ? timeHM(Date.parse(rec.checkIn)) : '-'} />
              <StatTile label="근무시간" value={minutesToKor(workedNow)} color={t.primary} sub={`남은 ${minutesToKor(remaining)}`} />
              <StatTile label="예상 퇴근" value={minutesToHM(comp.expectedOutMin)} />
            </Row>
            <ProgressBar value={workedNow} max={comp.requiredMinutes} color={t.primary} />
            {minutesOfDay(now) >= hmToMinutes(policy.breakStart) && minutesOfDay(now) < hmToMinutes(policy.breakEnd) && (
              <Muted size={12}>🍽️ 현재 휴게시간({policy.breakStart}–{policy.breakEnd})입니다. 휴게는 근로시간에서 제외됩니다.</Muted>
            )}
          </>
        )}

        {state === 'done' && (
          <>
            <SectionRow label="오늘 근무 완료" />
            <Row style={{ gap: 10 }}>
              <StatTile label="출근" value={rec?.checkIn ? timeHM(Date.parse(rec.checkIn)) : '-'} />
              <StatTile label="퇴근" value={rec?.checkOut ? timeHM(Date.parse(rec.checkOut)) : '-'} />
              <StatTile
                label="실근로"
                value={minutesToKor(comp.workedMinutes)}
                color={comp.diffMinutes >= 0 ? t.success : t.danger}
                sub={`${comp.diffMinutes >= 0 ? '초과 +' : '부족 '}${minutesToKor(comp.diffMinutes)}`}
              />
            </Row>
            {comp.labels.length > 0 && (
              <Row style={{ flexWrap: 'wrap' }}>
                {comp.labels.map((l) => (
                  <Badge key={l} text={l} color={/부족|미충족|지각|미기록|오류/.test(l) ? t.danger : t.textDim} />
                ))}
              </Row>
            )}
          </>
        )}
      </Card>

      {/* 위치 메시지 */}
      {geoMsg ? (
        <Card style={{ borderColor: confirmOutOfRange ? t.warning : t.border }}>
          <Muted size={13}>{geoMsg}</Muted>
          {confirmOutOfRange && (
            <Row>
              <Button label="그래도 출근" variant="warning" small onPress={() => doCheckIn('WORK', true)} style={{ flex: 1 }} />
              <Button label="출장으로 기록" variant="trip" small onPress={() => doCheckIn('TRIP', true)} style={{ flex: 1 }} />
            </Row>
          )}
        </Card>
      ) : null}

      {/* 액션 버튼 */}
      {state === 'before' && !comp.isFullLeave && (
        <>
          <Button label="출근하기" variant="success" loading={busy} onPress={() => doCheckIn(trip ? 'TRIP' : 'WORK')} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted>출장 모드 (근무지 반경 검증 생략)</Muted>
            <Pressable onPress={() => setTrip((v) => !v)}>
              <View
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 999,
                  backgroundColor: trip ? t.trip : t.border,
                  padding: 3,
                  alignItems: trip ? 'flex-end' : 'flex-start',
                }}
              >
                <View style={{ width: 24, height: 24, borderRadius: 999, backgroundColor: '#fff' }} />
              </View>
            </Pressable>
          </Row>
        </>
      )}

      {state === 'working' && <Button label="퇴근하기" variant="danger" loading={busy} onPress={doCheckOut} />}

      {state === 'done' && (
        <Button label="이력 보기" variant="outline" onPress={() => router.push('/(tabs)/history')} />
      )}

      {s.pendingSync > 0 && (
        <Row style={{ justifyContent: 'center' }}>
          <Muted size={12}>동기화 대기 {s.pendingSync}건 · 설정에서 동기화</Muted>
        </Row>
      )}
    </Screen>
  );
}

function SectionRow({ label, children }: { label: string; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: t.textDim }}>{label}</Text>
      {children}
    </View>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const t = useTheme();
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={{ height: 10, backgroundColor: t.cardAlt, borderRadius: 999, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}
