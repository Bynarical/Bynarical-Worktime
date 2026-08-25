import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
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
  StatTile,
  Field,
} from '@/components/ui';
import { useStore, isActiveEmployee } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { computeDay, summarize, DayComputation } from '@/lib/attendance';
import {
  addDaysKey,
  dateKey,
  minutesToKor,
  minutesToHM,
  timeHM,
  weekStartKey,
} from '@/lib/time';
import { shortHash } from '@/lib/hash';
import { weekSignState, weekContentHash, verifyConfirmation } from '@/lib/confirmation';
import { toCsv, exportCsv } from '@/lib/csv';
import { leaveCategoryLabel } from '@/lib/leave';
import { labelColor, leaveStyle } from '@/lib/palette';
import { AttendanceRecord } from '@/lib/types';
import { AttendanceCalendar } from '@/components/AttendanceCalendar';

export default function History() {
  const s = useStore();
  const t = useTheme();
  const [monthOffset, setMonthOffset] = useState(0);
  const [signWeek, setSignWeek] = useState<string | null>(null);
  const [unsignWeek, setUnsignWeek] = useState<string | null>(null);
  const [sigText, setSigText] = useState(''); // 서명용 비밀번호 입력값
  const [signBusy, setSignBusy] = useState(false);
  const [signMsg, setSignMsg] = useState('');
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [dayView, setDayView] = useState<'calendar' | 'list'>('calendar');

  const meId = s.user?.id;
  const viewId = viewUserId ?? meId; // 관리자가 다른 직원을 볼 수 있음
  const isSelf = viewId === meId;
  const viewName = (viewId ? s.profilesById[viewId]?.name || s.user?.name : '') || '';
  const employees = Object.entries(s.profilesById).map(([id, p]) => ({ id, ...p })).filter(isActiveEmployee);

  const base = new Date();
  base.setMonth(base.getMonth() + monthOffset);
  const y = base.getFullYear();
  const m = base.getMonth();
  const monthLabel = `${y}년 ${m + 1}월`;
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;

  const myRecords = useMemo(
    () => s.records.filter((r) => r.userId === viewId && r.date.startsWith(monthPrefix)),
    [s.records, viewId, monthPrefix]
  );
  const myLeaves = useMemo(
    () => s.leaves.filter((l) => l.userId === viewId && l.status === 'APPROVED'),
    [s.leaves, viewId]
  );

  const policy = s.settings.workPolicy;

  const dayRows = useMemo(() => {
    // 이 달에 기록/연차가 있는 날짜 집합
    const dates = new Set<string>();
    myRecords.forEach((r) => dates.add(r.date));
    myLeaves.filter((l) => l.date.startsWith(monthPrefix)).forEach((l) => dates.add(l.date));
    const sorted = [...dates].sort().reverse();
    return sorted.map((d) => {
      const rec = myRecords.find((r) => r.date === d);
      const leaves = myLeaves.filter((l) => l.date === d);
      const comp = computeDay(rec, leaves, policy, { dateStr: d, todayStr: dateKey() });
      return { date: d, rec, comp };
    });
  }, [myRecords, myLeaves, policy, monthPrefix]);

  const summary = useMemo(
    () => summarize(dayRows.map((r) => r.comp), myRecords),
    [dayRows, myRecords]
  );


  // 주간 그룹 (월요일 시작)
  const weeks = useMemo(() => {
    const map = new Map<string, { rows: typeof dayRows; comp: DayComputation[] }>();
    for (const row of dayRows) {
      const ws = weekStartKey(row.date);
      if (!map.has(ws)) map.set(ws, { rows: [], comp: [] });
      map.get(ws)!.rows.push(row);
      map.get(ws)!.comp.push(row.comp);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [dayRows]);

  function confirmedFor(weekStart: string) {
    return s.confirmations.find((c) => c.userId === viewId && c.weekStart === weekStart);
  }

  // 서명 = 본인 비밀번호 재입력. 서버(Supabase auth)로 검증해야 통과하므로,
  // "열린 세션으로 누가 눌렀다"가 아니라 본인이 그 시점에 인증했음을 남긴다.
  async function submitSignature(weekStart: string, rows: typeof dayRows) {
    if (!s.user || signBusy) return;
    setSignMsg('');
    if (!sigText) {
      setSignMsg('본인 확인을 위해 비밀번호를 입력해 주세요.');
      return;
    }
    setSignBusy(true);
    const okPw = await s.verifyPassword(sigText);
    if (!okPw) {
      setSignBusy(false);
      setSignMsg('비밀번호가 일치하지 않습니다. 다시 입력해 주세요.');
      return;
    }
    const weekEnd = addDaysKey(weekStart, 6);
    const total = rows.reduce((sum, r) => sum + r.comp.workedMinutes, 0);
    await s.addConfirmation({
      userId: s.user.id,
      userName: s.user.name,
      weekStart,
      weekEnd,
      signature: s.user.name, // 표기용 서명자명(본인 확인은 비밀번호로 완료)
      authMethod: 'PASSWORD',
      totalWorkedMinutes: total,
      recordHashes: rows.map((r) => r.rec?.hash || '').filter(Boolean),
      // 서명 시점 그 주 내용의 다이제스트 → 이후 변조 감지 기준값
      summaryHash: weekContentHash(s.records, s.leaves, s.user.id, weekStart, weekEnd),
      confirmedAt: new Date().toISOString(),
    });
    setSignBusy(false);
    setSignWeek(null);
    setSigText('');
  }

  function onExport() {
    const headers = ['날짜', '유형', '계획출근', '출근', '퇴근', '실근로(분)', '소정(분)', '연차(분)', '유급휴가(분)', '무급휴가(분)', '초과/부족(분)', '상태', '해시'];
    const rows = dayRows.map((r) => [
      r.date,
      r.rec?.type === 'TRIP' ? '출장' : '근무',
      r.rec?.plannedStart || '',
      r.rec?.checkIn ? timeHM(Date.parse(r.rec.checkIn)) : '',
      r.rec?.checkOut ? timeHM(Date.parse(r.rec.checkOut)) : '',
      Math.round(r.comp.workedMinutes),
      Math.round(r.comp.requiredMinutes),
      Math.round(r.comp.annualMinutes),
      Math.round(r.comp.paidMinutes),
      Math.round(r.comp.unpaidMinutes),
      Math.round(r.comp.diffMinutes),
      r.comp.labels.join(' '),
      shortHash(r.rec?.hash),
    ]);
    exportCsv(`worktime_${monthPrefix}_${viewName || ''}.csv`, toCsv(headers, rows));
  }

  return (
    <Screen>
      {/* 월 집계 히어로 */}
      <Hero>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable onPress={() => setMonthOffset((v) => v - 1)} hitSlop={12}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>‹</Text>
          </Pressable>
          <Pressable onPress={() => setMonthOffset(0)} style={{ alignItems: 'center' }}>
            <Text style={{ color: t.onHeroDim, fontSize: 12, fontWeight: '600' }}>{monthOffset > 0 ? '월 예정 요약' : '월 근무 요약'}</Text>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 }}>{monthLabel}</Text>
          </Pressable>
          <Pressable onPress={() => setMonthOffset((v) => v + 1)} hitSlop={12}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>›</Text>
          </Pressable>
        </Row>
        <Row style={{ gap: 8 }}>
          <StatTile onHero label="근무일" value={`${summary.days}일`} />
          <StatTile onHero label="정상근무" value={`${summary.normalDays}일`} />
          <StatTile
            onHero
            label="근로부족"
            value={summary.shortfallDays > 0 ? `${summary.shortfallDays}일` : '없음'}
            sub={summary.shortfallDays > 0 ? `-${minutesToKor(summary.shortfallMinutes)}` : '정상'}
          />
        </Row>
        <Row style={{ gap: 8 }}>
          <StatTile
            onHero
            label="연차"
            value={`${summary.annualMinutes / 60}h`}
            sub={
              [summary.paidMinutes > 0 ? `유급 ${summary.paidMinutes / 60}h` : '', summary.unpaidMinutes > 0 ? `무급 ${summary.unpaidMinutes / 60}h` : '']
                .filter(Boolean)
                .join(' · ') || undefined
            }
          />
          <StatTile onHero label="지각" value={`${summary.lateCount}회`} />
          <StatTile onHero label="코어위반" value={`${summary.coreViolationCount}회`} />
        </Row>
        <Pressable
          onPress={onExport}
          style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 12, paddingVertical: 11, alignItems: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>⬇ CSV 내보내기</Text>
        </Pressable>
      </Hero>

      {/* 관리자: 직원 선택 */}
      {s.adminUnlocked && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: t.text }}>직원 근태 조회</Text>
            <Badge text={isSelf ? '본인' : viewName} color={t.primary} />
          </Row>
          <Row style={{ flexWrap: 'wrap' }}>
            <Chip label="본인" active={isSelf} onPress={() => setViewUserId(meId ?? null)} small />
            {employees
              .filter((e) => e.id !== meId)
              .map((e) => (
                <Chip key={e.id} label={`${e.name}${e.empNo ? ` (${e.empNo})` : ''}`} active={viewId === e.id} onPress={() => setViewUserId(e.id)} small />
              ))}
          </Row>
        </Card>
      )}

      {/* 주간 확인(전자서명) */}
      <Card>
        <Text style={{ fontWeight: '700', color: t.text }}>주간 확인 (전자서명)</Text>
        <Muted size={12}>이미 지난 주의 근로시간을 확인하고 서명하세요. 서명하면 그 주 기록이 잠겨 관리자도 수정할 수 없습니다. (진행 중인 이번 주는 주가 끝난 뒤에 서명할 수 있어요.)</Muted>
        {weeks.length === 0 && <Muted>기록이 없습니다</Muted>}
        {weeks.map(([ws, group]) => {
          const weekEnd = addDaysKey(ws, 6);
          const total = group.comp.reduce((sum, c) => sum + c.workedMinutes, 0);
          const cf = confirmedFor(ws);
          const verdict = cf ? verifyConfirmation(cf, s.records, s.leaves) : 'ok';
          const tampered = verdict === 'tampered';
          const signState = weekSignState(ws, dateKey());
          return (
            <View key={ws} style={{ gap: 6 }}>
              <Divider />
              <Row style={{ justifyContent: 'space-between' }}>
                <Body style={{ fontWeight: '600' }}>{ws} ~ {weekEnd}</Body>
                <Muted>{minutesToKor(total)}</Muted>
              </Row>
              {cf ? (
                <View style={{ gap: 6 }}>
                  <Row style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge text={`✓ ${cf.signature} 서명`} color={tampered ? t.danger : t.success} />
                    {tampered ? (
                      <Badge text="⚠ 서명 후 변경됨" color={t.danger} soft={t.dangerSoft} />
                    ) : (
                      <Badge text="🔒 잠금" color={t.textDim} />
                    )}
                    {cf.authMethod === 'PASSWORD' ? <Badge text="🔐 비밀번호 인증" color={t.success} soft={t.successSoft} /> : null}
                    <Muted size={11}>해시 {shortHash(cf.hash)}</Muted>
                  </Row>
                  {tampered ? (
                    <Muted size={12} style={{ color: t.danger }}>
                      서명 당시 기록과 현재 기록이 다릅니다. 관리자에게 확인하고, 맞으면 서명을 해제한 뒤 다시 서명하세요.
                    </Muted>
                  ) : null}
                  {isSelf ? (
                    unsignWeek === ws ? (
                      <View style={{ gap: 6 }}>
                        <Muted size={12}>서명을 해제하면 이 주 기록을 다시 수정할 수 있게 됩니다. 해제하시겠어요?</Muted>
                        <Row>
                          <Button label="서명 해제" variant="danger" small style={{ flex: 1 }} onPress={() => { s.removeConfirmation(cf.id); setUnsignWeek(null); }} />
                          <Button label="취소" variant="neutral" small style={{ flex: 1 }} onPress={() => setUnsignWeek(null)} />
                        </Row>
                      </View>
                    ) : (
                      <Button label="서명 해제" variant="neutral" small onPress={() => setUnsignWeek(ws)} />
                    )
                  ) : null}
                </View>
              ) : !isSelf ? (
                <Muted size={12}>미서명</Muted>
              ) : signState !== 'past' ? (
                <Muted size={12}>
                  {signState === 'current'
                    ? '🗓 이번 주는 아직 진행 중입니다 · 주가 끝난 뒤 확인·서명할 수 있어요'
                    : '🗓 아직 시작되지 않은 주입니다 · 확인·서명 불가'}
                </Muted>
              ) : signWeek === ws ? (
                <View style={{ gap: 8 }}>
                  <Muted size={12}>
                    위 기간의 근무기록을 확인했음을 <Text style={{ fontWeight: '700', color: t.text }}>{s.user?.name}</Text> 본인 명의로 서명합니다.
                    본인 확인을 위해 <Text style={{ fontWeight: '700', color: t.text }}>로그인 비밀번호</Text>를 입력해 주세요.
                  </Muted>
                  <Field
                    label="비밀번호(본인 확인)"
                    value={sigText}
                    onChangeText={setSigText}
                    placeholder="로그인 비밀번호"
                    secureTextEntry
                    autoCapitalize="none"
                  />
                  {signMsg ? <Muted size={12} style={{ color: t.danger }}>{signMsg}</Muted> : null}
                  <Row>
                    <Button label="확인 서명" variant="primary" small loading={signBusy} style={{ flex: 1 }} onPress={() => submitSignature(ws, group.rows)} />
                    <Button label="취소" variant="neutral" small style={{ flex: 1 }} onPress={() => { setSignWeek(null); setSigText(''); setSignMsg(''); }} />
                  </Row>
                </View>
              ) : (
                <Button label="주간 확인·서명" variant="outline" small onPress={() => { setSignWeek(ws); setSigText(''); setSignMsg(''); }} />
              )}
            </View>
          );
        })}
      </Card>

      {/* 일별 기록: 달력 / 목록 */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <Text style={{ fontWeight: '700', color: t.text }}>일별 기록</Text>
        <Row style={{ gap: 6 }}>
          <Chip label="달력" active={dayView === 'calendar'} onPress={() => setDayView('calendar')} small />
          <Chip label="목록" active={dayView === 'list'} onPress={() => setDayView('list')} small />
        </Row>
      </Row>

      {dayView === 'calendar' ? (
        viewId ? <AttendanceCalendar userId={viewId} records={s.records} leaves={s.leaves} policy={policy} holidays={s.holidays} /> : null
      ) : (
        <>
          {dayRows.length === 0 && <Card><Muted>기록이 없습니다</Muted></Card>}
          {dayRows.map((r) => (
            <DayCard key={r.date} date={r.date} rec={r.rec} comp={r.comp} />
          ))}
        </>
      )}
    </Screen>
  );
}

function DayCard({ date, rec, comp }: { date: string; rec?: AttendanceRecord; comp: DayComputation }) {
  const t = useTheme();
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(date + 'T00:00:00Z').getUTCDay()];
  const bad = comp.labels.some((l) => /부족|미충족|지각|미기록|오류/.test(l));
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body style={{ fontWeight: '700' }}>{date} ({wd})</Body>
        {comp.isFullLeave ? (
          <Badge
            text={`종일 ${leaveCategoryLabel(comp.leaveCategory ?? undefined)}`}
            color={leaveStyle(t, comp.leaveCategory).color}
            soft={leaveStyle(t, comp.leaveCategory).soft}
          />
        ) : (
          <Muted>{rec?.checkIn ? timeHM(Date.parse(rec.checkIn)) : '--:--'} → {rec?.checkOut ? timeHM(Date.parse(rec.checkOut)) : '--:--'}</Muted>
        )}
      </Row>
      {!comp.isFullLeave && (
        <Row style={{ gap: 8, flexWrap: 'wrap' }}>
          <KVInline k="실근로" v={minutesToKor(comp.workedMinutes)} />
          <KVInline k="소정" v={minutesToKor(comp.requiredMinutes)} />
          <KVInline k="차이" v={`${comp.diffMinutes >= 0 ? '+' : ''}${minutesToKor(comp.diffMinutes)}`} color={comp.diffMinutes >= 0 ? t.success : t.danger} />
          {comp.expectedOutMin ? <KVInline k="퇴근가능" v={minutesToHM(comp.expectedOutMin)} /> : null}
        </Row>
      )}
      {comp.labels.length > 0 && (
        <Row style={{ flexWrap: 'wrap' }}>
          {comp.labels.map((l) => (
            <Badge key={l} text={l} color={labelColor(t, l)} />
          ))}
        </Row>
      )}
      {rec?.hash ? <Muted size={11}>해시 {shortHash(rec.hash)}{bad ? '' : ''}</Muted> : null}
    </Card>
  );
}

function KVInline({ k, v, color }: { k: string; v: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.cardAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ fontSize: 11, color: t.textDim }}>{k}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: color || t.text }}>{v}</Text>
    </View>
  );
}
