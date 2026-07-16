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
} from '@/components/ui';
import { useStore, isEmployeeAccount } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { computeDay, summarize, DayComputation } from '@/lib/attendance';
import { SEGMENT_LABELS } from '@/lib/leave';
import { dateKey, minutesToKor, minutesToHM, timeHM } from '@/lib/time';
import { shortHash } from '@/lib/hash';
import { toCsv, exportCsv } from '@/lib/csv';
import { AttendanceRecord } from '@/lib/types';
import { AttendanceCalendar } from '@/components/AttendanceCalendar';
import { AdminDayEditor } from '@/components/AdminDayEditor';
import { computeAttendanceScore } from '@/lib/attendanceScore';
import { AttendanceScoreCard } from '@/components/AttendanceScoreCard';

export default function Approvals() {
  const s = useStore();
  const t = useTheme();

  // 승인 대기 — 복귀 전(종료 미정) 외출은 아직 확정 전이라 목록에서 제외
  const pending = useMemo(
    () => s.leaves.filter((l) => l.status === 'REQUESTED' && !(l.segment === 'CUSTOM' && !l.endTime)),
    [s.leaves]
  );
  const pendingRecs = useMemo(
    () => s.records.filter((r) => r.pending).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [s.records]
  );
  const employees = useMemo(
    () => Object.entries(s.profilesById).map(([id, p]) => ({ id, ...p })).filter((e) => e.id !== s.user?.id && isEmployeeAccount(e)),
    [s.profilesById, s.user]
  );

  // 직원 근태 조회
  const [viewId, setViewId] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [dayView, setDayView] = useState<'calendar' | 'list'>('calendar');
  const [editDate, setEditDate] = useState<string | null>(null);
  const viewName = viewId ? s.profilesById[viewId]?.name || '' : '';

  const base = new Date();
  base.setMonth(base.getMonth() + monthOffset);
  const y = base.getFullYear();
  const m = base.getMonth();
  const monthLabel = `${y}년 ${m + 1}월`;
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const policy = s.settings.workPolicy;

  const dayRows = useMemo(() => {
    if (!viewId) return [] as { date: string; rec?: AttendanceRecord; comp: DayComputation }[];
    const recs = s.records.filter((r) => r.userId === viewId && r.date.startsWith(monthPrefix));
    const lvs = s.leaves.filter((l) => l.userId === viewId && l.status === 'APPROVED' && l.date.startsWith(monthPrefix));
    const dates = new Set<string>();
    recs.forEach((r) => dates.add(r.date));
    lvs.forEach((l) => dates.add(l.date));
    return [...dates].sort().reverse().map((d) => {
      const rec = recs.find((r) => r.date === d);
      const leaves = lvs.filter((l) => l.date === d);
      return { date: d, rec, comp: computeDay(rec, leaves, policy, { dateStr: d, todayStr: dateKey() }) };
    });
  }, [s.records, s.leaves, viewId, monthPrefix, policy]);

  const summary = useMemo(() => summarize(dayRows.map((r) => r.comp), dayRows.map((r) => r.rec).filter(Boolean) as AttendanceRecord[]), [dayRows]);

  // 선택 직원 연간 근태 점수(올해)
  const curYear = parseInt(dateKey().slice(0, 4), 10);
  const yearScore = useMemo(
    () => (viewId ? computeAttendanceScore(viewId, curYear, s.records, s.leaves, policy, s.holidaySet, dateKey(), s.profilesById[viewId]?.hireDate) : null),
    [viewId, curYear, s.records, s.leaves, policy, s.holidaySet, s.profilesById]
  );

  function onExport() {
    const headers = ['날짜', '유형', '계획출근', '출근', '퇴근', '실근로(분)', '소정(분)', '연차(분)', '초과/부족(분)', '상태', '해시'];
    const rows = dayRows.map((r) => [
      r.date,
      r.rec?.type === 'TRIP' ? '출장' : '근무',
      r.rec?.plannedStart || '',
      r.rec?.checkIn ? timeHM(Date.parse(r.rec.checkIn)) : '',
      r.rec?.checkOut ? timeHM(Date.parse(r.rec.checkOut)) : '',
      Math.round(r.comp.workedMinutes),
      Math.round(r.comp.requiredMinutes),
      Math.round(r.comp.leaveMinutes),
      Math.round(r.comp.diffMinutes),
      r.comp.labels.join(' '),
      shortHash(r.rec?.hash),
    ]);
    exportCsv(`worktime_${monthPrefix}_${viewName || ''}.csv`, toCsv(headers, rows));
  }

  return (
    <Screen>
      <Hero style={{ paddingVertical: 22 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 3 }}>
            <Text style={{ color: t.onHeroDim, fontSize: 13, fontWeight: '600' }}>연차 승인 · 근태 조회</Text>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>승인 대기 {pending.length}건</Text>
          </View>
          <Badge text="✅ 승인" color="#fff" soft="rgba(255,255,255,0.2)" />
        </Row>
      </Hero>

      {/* 근무지 밖 출근 승인 대기 */}
      {pendingRecs.length > 0 && (
        <>
          <Text style={{ fontWeight: '700', color: t.textDim }}>근무지 밖 출근 승인 ({pendingRecs.length})</Text>
          {pendingRecs.map((r) => (
            <Card key={r.id} style={{ borderColor: t.warning, borderWidth: 1.5 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row style={{ gap: 6 }}>
                  <Body style={{ fontWeight: '700' }}>{s.profilesById[r.userId]?.name || r.userName} · {r.date}</Body>
                  <Badge text="근무지 밖" color={t.warning} />
                </Row>
                <Muted size={12}>{r.checkIn ? timeHM(Date.parse(r.checkIn)) : '--:--'}{r.checkOut ? ` → ${timeHM(Date.parse(r.checkOut))}` : ''}</Muted>
              </Row>
              {r.inLocation ? <Muted size={11}>출근 위치 {r.inLocation.lat.toFixed(5)}, {r.inLocation.lng.toFixed(5)}</Muted> : null}
              <Row>
                <Button label="출근 인정" variant="success" small style={{ flex: 1 }} onPress={() => s.adminApproveAttendance(r.id)} />
                <Button label="반려(삭제)" variant="danger" small style={{ flex: 1 }} onPress={() => s.adminRejectAttendance(r.id)} />
              </Row>
            </Card>
          ))}
          <Divider />
        </>
      )}

      {/* 승인 대기 */}
      <Text style={{ fontWeight: '700', color: t.textDim }}>연차 승인 대기 ({pending.length})</Text>
      {pending.length === 0 && <Card><Muted>대기 중인 신청이 없습니다</Muted></Card>}
      {pending.map((l) => (
        <Card key={l.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row style={{ gap: 6 }}>
              <Body style={{ fontWeight: '700' }}>{l.userName} · {l.date}</Body>
              <Badge text={l.category === 'PAID' ? '유급휴가' : '연차'} color={l.category === 'PAID' ? t.success : t.trip} />
            </Row>
            <Badge text={`${l.hours}h`} color={t.trip} />
          </Row>
          <Muted size={12}>{SEGMENT_LABELS[l.segment]}{l.segment === 'CUSTOM' && l.startTime ? ` ${l.startTime}~${l.endTime || ''}` : ''}{l.reason ? ` · ${l.reason}` : ''}</Muted>
          <Row>
            <Button label="승인" variant="success" small style={{ flex: 1 }} onPress={() => s.decideLeave(l.id, true)} />
            <Button label="반려" variant="danger" small style={{ flex: 1 }} onPress={() => s.decideLeave(l.id, false)} />
          </Row>
        </Card>
      ))}

      <Divider />

      {/* 직원 근태 조회 */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontWeight: '700', color: t.text }}>직원 근태 조회</Text>
          {viewId && <Badge text={viewName} color={t.primary} />}
        </Row>
        <Row style={{ flexWrap: 'wrap' }}>
          {employees.length === 0 && <Muted size={12}>직원이 없습니다</Muted>}
          {employees.map((e) => (
            <Chip key={e.id} label={`${e.name}${e.empNo ? ` (${e.empNo})` : ''}`} active={viewId === e.id} onPress={() => { setViewId(e.id); setMonthOffset(0); }} small />
          ))}
        </Row>
      </Card>

      {viewId && (
        <>
          <Hero>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Pressable onPress={() => setMonthOffset((v) => v - 1)} hitSlop={12}>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>‹</Text>
              </Pressable>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: t.onHeroDim, fontSize: 12, fontWeight: '600' }}>{viewName} · 월 근무 요약</Text>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 }}>{monthLabel}</Text>
              </View>
              <Pressable onPress={() => monthOffset < 0 && setMonthOffset((v) => v + 1)} hitSlop={12}>
                <Text style={{ color: monthOffset >= 0 ? 'rgba(255,255,255,0.3)' : '#fff', fontSize: 22, fontWeight: '700' }}>›</Text>
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
              <StatTile onHero label="연차" value={`${summary.leaveMinutes / 60}h`} />
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

          {yearScore && <AttendanceScoreCard name={viewName} score={yearScore} />}

          <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ fontWeight: '700', color: t.text }}>일별 기록</Text>
            <Row style={{ gap: 6 }}>
              <Chip label="달력" active={dayView === 'calendar'} onPress={() => setDayView('calendar')} small />
              <Chip label="목록" active={dayView === 'list'} onPress={() => setDayView('list')} small />
            </Row>
          </Row>

          {dayView === 'calendar' ? (
            <AttendanceCalendar userId={viewId} records={s.records} leaves={s.leaves} policy={policy} holidays={s.holidays} onEditDay={setEditDate} />
          ) : (
            <>
              {dayRows.length === 0 && <Card><Muted>이 달의 기록이 없습니다</Muted></Card>}
              {dayRows.map((r) => (
                <DayCard key={r.date} date={r.date} rec={r.rec} comp={r.comp} onEdit={() => setEditDate(r.date)} />
              ))}
            </>
          )}
        </>
      )}

      {editDate && viewId ? (
        <AdminDayEditor userId={viewId} userName={viewName} date={editDate} onClose={() => setEditDate(null)} />
      ) : null}
    </Screen>
  );
}

function DayCard({ date, rec, comp, onEdit }: { date: string; rec?: AttendanceRecord; comp: DayComputation; onEdit?: () => void }) {
  const t = useTheme();
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(date + 'T00:00:00Z').getUTCDay()];
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body style={{ fontWeight: '700' }}>{date} ({wd})</Body>
        {comp.isFullLeave ? (
          <Badge text={comp.isPaidLeave ? '종일 유급휴가' : '종일 연차'} color={comp.isPaidLeave ? t.success : t.trip} />
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
            <Badge key={l} text={l} color={/부족|미충족|지각|미기록|오류/.test(l) ? t.danger : /유급/.test(l) ? t.success : /연차|출장/.test(l) ? t.trip : t.textDim} />
          ))}
        </Row>
      )}
      {rec?.hash ? <Muted size={11}>해시 {shortHash(rec.hash)}</Muted> : null}
      {onEdit ? <Button label="✏️ 근태 수정" variant="outline" small onPress={onEdit} /> : null}
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
