import React, { useEffect, useMemo, useState } from 'react';
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
  StatTile,
  ProgressBar,
  ProgressRing,
  Switch,
  useTheme,
} from '@/components/ui';
import { useStore } from '@/lib/store';
import { getCurrentPoint, nearestWorkplace } from '@/lib/geo';
import { computeDay, workEndMinutes } from '@/lib/attendance';
import { ceilToStep, dateKey, minutesOfDay, minutesToHM, minutesToKor, timeHM, hmToMinutes } from '@/lib/time';
import { Workplace } from '@/lib/types';

function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => new Date().getTime());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().getTime()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];

export default function Today() {
  const s = useStore();
  const t = useTheme();
  const router = useRouter();
  const now = useNow();
  const policy = s.settings.workPolicy;

  const [busy, setBusy] = useState(false);
  const [trip, setTrip] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');
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

  const previewStartMin = ceilToStep(minutesOfDay(now), policy.clockInStepMinutes || 30);
  const previewOutMin = workEndMinutes(previewStartMin, comp.requiredMinutes, policy);
  const state: 'before' | 'working' | 'done' = !rec?.checkIn ? 'before' : !rec?.checkOut ? 'working' : 'done';
  const workedNow = comp.workedMinutes;
  const remaining = Math.max(0, comp.requiredMinutes - workedNow);
  const progress = comp.requiredMinutes > 0 ? workedNow / comp.requiredMinutes : 0;

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

  return (
    <Screen>
      {/* 히어로 */}
      <Hero>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 2 }}>
            <Text style={{ color: t.onHeroDim, fontSize: 13, fontWeight: '600' }}>{today} · {WD[new Date(now).getDay()]}요일</Text>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 }}>{s.user?.name}님</Text>
          </View>
          <Badge
            text={state === 'working' ? '근무 중' : state === 'done' ? '근무 완료' : comp.isFullLeave ? '연차' : '출근 전'}
            color="#fff"
            soft="rgba(255,255,255,0.2)"
          />
        </Row>

        {state === 'working' ? (
          <View style={{ alignItems: 'center', paddingVertical: 6 }}>
            <ProgressRing
              size={168}
              stroke={14}
              progress={progress}
              color="#fff"
              center={
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: t.onHeroDim, fontSize: 12, fontWeight: '600' }}>현재 근무</Text>
                  <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -1 }}>{minutesToKor(workedNow)}</Text>
                  <Text style={{ color: t.onHeroDim, fontSize: 12 }}>퇴근가능 {minutesToHM(comp.expectedOutMin)}</Text>
                </View>
              }
            />
          </View>
        ) : (
          <Text style={{ color: '#fff', fontSize: 52, fontWeight: '800', letterSpacing: -2, textAlign: 'center', paddingVertical: 8 }}>
            {timeHM(now)}
          </Text>
        )}

        <Row style={{ gap: 10 }}>
          <Text style={{ color: t.onHeroDim, fontSize: 12.5, flex: 1 }}>
            코어타임 {policy.coreStart}–{policy.coreEnd} · 휴게 {policy.breakStart}–{policy.breakEnd} · 소정 {policy.dailyWorkMinutes / 60}시간
          </Text>
        </Row>
      </Hero>

      {/* 연차 표시 */}
      {todaysLeaves.length > 0 && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: t.text }}>오늘의 연차 🌴</Text>
            <Badge text={comp.isFullLeave ? '종일' : `${comp.leaveMinutes / 60}시간`} color={t.trip} soft={t.tripSoft} />
          </Row>
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

      {/* 상태 상세 */}
      {state === 'before' && !comp.isFullLeave && (
        <Card>
          <Text style={{ fontWeight: '700', color: t.text }}>지금 출근하면</Text>
          <Row style={{ gap: 10 }}>
            <StatTile label="적용 출근" value={minutesToHM(previewStartMin)} color={t.primary} />
            <StatTile label="퇴근 가능" value={minutesToHM(previewOutMin)} color={t.success} />
            <StatTile label="소정근로" value={minutesToKor(comp.requiredMinutes)} />
          </Row>
          <Muted size={12}>출근 시각은 {policy.clockInStepMinutes}분 단위로 자동 적용됩니다 (예: 8:20 → 8:30). 실제 출근시각은 그대로 기록됩니다.</Muted>
          {previewStartMin > hmToMinutes(policy.latestClockIn) + 0.01 && (
            <Muted size={12} style={{ color: t.danger }}>⚠️ 코어타임 시작({policy.latestClockIn}) 이후 출근은 지각으로 기록됩니다.</Muted>
          )}
        </Card>
      )}

      {state === 'before' && comp.isFullLeave && (
        <Card><Body>오늘은 종일 연차입니다. 출근 기록이 필요하지 않습니다. 🌴</Body></Card>
      )}

      {state === 'working' && (
        <Card>
          <Row style={{ gap: 10 }}>
            <StatTile label="출근" value={rec?.checkIn ? timeHM(Date.parse(rec.checkIn)) : '-'} sub={`적용 ${minutesToHM(comp.effectiveStartMin)}`} />
            <StatTile label="퇴근 가능" value={minutesToHM(comp.expectedOutMin)} color={t.success} sub={remaining > 0 ? `${minutesToKor(remaining)} 남음` : '충족 ✓'} />
            <StatTile label="위치" value={rec?.type === 'TRIP' ? '출장' : rec?.inVerified ? '확인' : '미확인'} color={rec?.type === 'TRIP' ? t.trip : rec?.inVerified ? t.success : t.warning} />
          </Row>
          <ProgressBar value={workedNow} max={comp.requiredMinutes} color={remaining > 0 ? undefined : [t.success, t.success]} />
          <Muted size={12}>
            소정근로 {minutesToKor(comp.requiredMinutes)} · 휴게 {policy.breakStart}–{policy.breakEnd}는 근로시간에서 제외
            {remaining <= 0 ? ' · 지금 퇴근 가능 ✓' : ''}
          </Muted>
          {minutesOfDay(now) >= hmToMinutes(policy.breakStart) && minutesOfDay(now) < hmToMinutes(policy.breakEnd) && (
            <Muted size={12}>🍽️ 현재 휴게시간입니다.</Muted>
          )}
        </Card>
      )}

      {state === 'done' && (
        <Card>
          <Text style={{ fontWeight: '700', color: t.text }}>오늘 근무 완료 🎉</Text>
          <Row style={{ gap: 10 }}>
            <StatTile label="출근" value={rec?.checkIn ? timeHM(Date.parse(rec.checkIn)) : '-'} sub={`적용 ${minutesToHM(comp.effectiveStartMin)}`} />
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
                <Badge key={l} text={l} color={/부족|미충족|지각|미기록/.test(l) ? t.danger : /연차|출장/.test(l) ? t.trip : t.textDim} />
              ))}
            </Row>
          )}
        </Card>
      )}

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

      {/* 액션 */}
      {state === 'before' && !comp.isFullLeave && (
        <>
          <Button label="출근하기" icon="🟢" variant="success" loading={busy} onPress={() => doCheckIn(trip ? 'TRIP' : 'WORK')} />
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '600' }}>출장 모드</Body>
                <Muted size={12}>근무지 반경 검증을 생략합니다</Muted>
              </View>
              <Switch value={trip} onValueChange={setTrip} color={t.trip} />
            </Row>
          </Card>
        </>
      )}

      {state === 'working' && <Button label="퇴근하기" icon="🔴" variant="danger" loading={busy} onPress={doCheckOut} />}

      {state === 'done' && <Button label="이력 보기" variant="outline" onPress={() => router.push('/(tabs)/history')} />}
      <Divider />
    </Screen>
  );
}
