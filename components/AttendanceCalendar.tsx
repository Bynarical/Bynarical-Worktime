import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Card, Muted, Body, Badge, Row, Divider, Button, Marker } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { computeDay, DayComputation, isNormalWorkday } from '@/lib/attendance';
import { dateKey, minutesOfDay, minutesToKor, minutesToHM, timeHM } from '@/lib/time';
import { shortHash } from '@/lib/hash';
import { leaveCategoryLabel } from '@/lib/leave';
import { labelColor, leaveStyle, tone } from '@/lib/palette';
import { AttendanceRecord, LeaveRequest, WorkPolicy, Holiday } from '@/lib/types';

const WD = ['일', '월', '화', '수', '목', '금', '토'];

interface DayCell {
  date: string;
  day: number;
  weekday: number; // 0=일
  rec?: AttendanceRecord;
  comp: DayComputation;
  hasData: boolean;
  isFuture: boolean;
  holidayName?: string;
}

function isAnomaly(c: DayComputation) {
  return c.flags.late || c.flags.coreViolation || c.flags.insufficient || c.flags.missingClockOut;
}

export function AttendanceCalendar({
  userId,
  records,
  leaves,
  policy,
  holidays = [],
  onEditDay,
  reviewedDates,
  onToggleReview,
}: {
  userId: string;
  records: AttendanceRecord[];
  leaves: LeaveRequest[];
  policy: WorkPolicy;
  holidays?: Holiday[];
  onEditDay?: (date: string) => void;
  // 관리자 전용: 이상징후 확인 처리된 날짜(표시를 가라앉힘) + 확인/해제 토글
  reviewedDates?: Set<string>;
  onToggleReview?: (date: string, reviewed: boolean) => void;
}) {
  const t = useTheme();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const today = dateKey();
  const nowMin = minutesOfDay(Date.now());

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const y = base.getFullYear();
  const m = base.getMonth(); // 0-index
  const monthLabel = `${y}년 ${m + 1}월`;
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    holidays.forEach((h) => m.set(h.day, h.name));
    return m;
  }, [holidays]);

  const myRecords = useMemo(
    () => records.filter((r) => r.userId === userId && r.date.startsWith(monthPrefix)),
    [records, userId, monthPrefix]
  );
  const myLeaves = useMemo(
    () => leaves.filter((l) => l.userId === userId && l.status === 'APPROVED' && l.date.startsWith(monthPrefix)),
    [leaves, userId, monthPrefix]
  );

  const cells = useMemo<DayCell[]>(() => {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const out: DayCell[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const rec = myRecords.find((r) => r.date === date);
      const dayLeaves = myLeaves.filter((l) => l.date === date);
      const opts = date === today ? { dateStr: date, nowMin, todayStr: today } : { dateStr: date, todayStr: today };
      const comp = computeDay(rec, dayLeaves, policy, opts);
      out.push({
        date,
        day: d,
        weekday: new Date(date + 'T00:00:00Z').getUTCDay(),
        rec,
        comp,
        hasData: !!rec || dayLeaves.length > 0,
        isFuture: date > today,
        holidayName: holidayMap.get(date),
      });
    }
    return out;
  }, [y, m, monthPrefix, myRecords, myLeaves, policy, today, nowMin, holidayMap]);

  const leadBlanks = cells.length > 0 ? cells[0].weekday : 0;
  const grid: (DayCell | null)[] = [...Array(leadBlanks).fill(null), ...cells];
  while (grid.length % 7 !== 0) grid.push(null);

  const sel = selected ? cells.find((c) => c.date === selected) : null;

  const normalDays = cells.filter((c) => isNormalWorkday(c.comp)).length;
  const workDays = cells.filter((c) => c.comp.hasCheckIn).length;
  const leaveDays = cells.filter((c) => c.comp.isFullLeave).length;
  const annualDays = cells.filter((c) => c.comp.isFullLeave && c.comp.leaveCategory === 'ANNUAL').length;
  const paidDays = cells.filter((c) => c.comp.isFullLeave && c.comp.leaveCategory === 'PAID').length;
  const unpaidDays = cells.filter((c) => c.comp.isFullLeave && c.comp.leaveCategory === 'UNPAID').length;
  const hasTrip = cells.some((c) => c.rec?.type === 'TRIP');
  // 이번 달에 실제로 나타난 항목만 범례에 표시 (색이 많아 보이는 것 방지)
  const summaryTail = [
    annualDays > 0 ? `연차 ${annualDays}일` : '',
    paidDays > 0 ? `유급 ${paidDays}일` : '',
    unpaidDays > 0 ? `무급 ${unpaidDays}일` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card>
      {/* 월 이동 */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={() => { setMonthOffset((v) => v - 1); setSelected(null); }} hitSlop={12}>
          <Text style={{ color: t.primary, fontSize: 22, fontWeight: '700' }}>‹</Text>
        </Pressable>
        <Pressable onPress={() => { setMonthOffset(0); setSelected(null); }} style={{ alignItems: 'center' }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>{monthLabel}</Text>
          <Muted size={11}>
            {monthOffset > 0
              ? `예정 휴가 ${leaveDays}일${summaryTail ? ` (${summaryTail})` : ''}`
              : `근무 ${workDays}일 · 정상 ${normalDays}일${summaryTail ? ` · ${summaryTail}` : ''}`}
          </Muted>
        </Pressable>
        <Pressable onPress={() => { setMonthOffset((v) => v + 1); setSelected(null); }} hitSlop={12}>
          <Text style={{ color: t.primary, fontSize: 22, fontWeight: '700' }}>›</Text>
        </Pressable>
      </Row>

      {/* 요일 헤더 */}
      <Row style={{ marginTop: 4 }}>
        {WD.map((w, i) => (
          <View key={w} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: i === 0 ? t.danger : i === 6 ? t.primary : t.textDim }}>{w}</Text>
          </View>
        ))}
      </Row>

      {/* 날짜 그리드 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {grid.map((c, idx) => {
          if (!c) return <View key={`b${idx}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const isToday = c.date === today;
          const isSel = c.date === selected;
          const anomaly = c.hasData && !c.comp.isFullLeave && !!c.rec && isAnomaly(c.comp);
          const okWork = c.hasData && !c.comp.isFullLeave && !!c.rec && !anomaly;
          const isHoliday = !!c.holidayName;
          const dow = c.weekday;
          // 휴가 색은 종류별로 다르다: 연차=보라 / 유급휴가=파랑 / 무급휴가=회색.
          // (정상 근무 초록과 절대 겹치지 않게 — lib/palette.ts 단일 출처)
          const lv = c.comp.leaveCategory ? leaveStyle(t, c.comp.leaveCategory) : null;
          const workTone = tone(t, c.rec?.type === 'TRIP' ? 'trip' : 'normal');
          const numColor = c.comp.isFullLeave
            ? lv!.color
            : isHoliday || dow === 0
            ? t.danger
            : dow === 6
            ? t.primary
            : t.text;
          return (
            <Pressable
              key={c.date}
              onPress={() => setSelected(isSel ? null : c.date)}
              style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}
            >
              <View
                style={{
                  flex: 1,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  // 선택 표시는 배경색이 아니라 테두리로 — 선택해도 휴가 종류 색이 가려지지 않게
                  backgroundColor: c.comp.isFullLeave
                    ? lv!.soft
                    : isHoliday
                    ? t.dangerSoft
                    : isSel
                    ? t.primarySoft
                    : 'transparent',
                  borderWidth: isSel ? 2 : isToday ? 1.5 : 0,
                  borderColor: isSel || isToday ? t.primary : 'transparent',
                  // 미래 날짜라도 승인된 연차/일정이 있으면 선명하게, 빈 미래일만 흐리게
                  opacity: c.isFuture && !c.hasData ? 0.4 : 1,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: isToday ? '800' : '600', color: numColor }}>
                  {c.day}
                </Text>
                {/* 마커는 색 + 모양 둘 다 다르게(●정상 ▲이상 ■연차/유급 □무급) — 색약도 구분 가능 */}
                <Row style={{ gap: 2, height: 7, alignItems: 'center' }}>
                  {okWork && <Marker shape={workTone.marker} color={workTone.color} />}
                  {/* 관리자가 확인한 이상징후는 회색으로 가라앉힌다(사실은 남기되 경고는 아님) */}
                  {anomaly && <Marker shape="triangle" color={reviewedDates?.has(c.date) ? t.textFaint : t.danger} />}
                  {lv && <Marker shape={lv.marker} color={lv.color} />}
                </Row>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* 범례 — 색·모양이 곧 의미 (근무=초록계열 / 이상=빨강 / 휴가=보라·파랑·회색) */}
      <Row style={{ flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
        <Legend tone="normal" />
        <Legend tone="anomaly" />
        <Legend tone="annual" />
        <Legend tone="paid" />
        <Legend tone="unpaid" />
        {hasTrip && <Legend tone="trip" label="출장" />}
        <Legend tone="holiday" chip />
      </Row>

      {/* 선택일 상세 */}
      {sel && (
        <>
          <Divider />
          <DayDetail
            cell={sel}
            onEdit={onEditDay}
            reviewed={!!reviewedDates?.has(sel.date)}
            onToggleReview={onToggleReview}
          />
        </>
      )}
    </Card>
  );
}

function Legend({ tone: name, label, chip }: { tone: Parameters<typeof tone>[1]; label?: string; chip?: boolean }) {
  const t = useTheme();
  const st = tone(t, name);
  return (
    <Row style={{ gap: 4, alignItems: 'center' }}>
      {chip ? (
        <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: st.soft, borderWidth: 1, borderColor: st.color }} />
      ) : (
        <Marker shape={st.marker} color={st.color} />
      )}
      <Text style={{ fontSize: 11, color: t.textDim }}>{label || st.legend}</Text>
    </Row>
  );
}

function DayDetail({
  cell,
  onEdit,
  reviewed,
  onToggleReview,
}: {
  cell: DayCell;
  onEdit?: (date: string) => void;
  reviewed?: boolean;
  onToggleReview?: (date: string, reviewed: boolean) => void;
}) {
  const t = useTheme();
  const { comp, rec, date } = cell;
  const wd = WD[cell.weekday];
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Row style={{ gap: 6, alignItems: 'center', flexShrink: 1 }}>
          <Body style={{ fontWeight: '800' }}>{date} ({wd})</Body>
          {cell.holidayName ? <Badge text={`🔴 ${cell.holidayName}`} color={t.danger} soft={t.dangerSoft} /> : null}
        </Row>
        {comp.isFullLeave ? (
          <Badge
            text={`종일 ${leaveCategoryLabel(comp.leaveCategory ?? undefined)}`}
            color={leaveStyle(t, comp.leaveCategory).color}
            soft={leaveStyle(t, comp.leaveCategory).soft}
          />
        ) : rec ? (
          <Muted>{rec.checkIn ? timeHM(Date.parse(rec.checkIn)) : '--:--'} → {rec.checkOut ? timeHM(Date.parse(rec.checkOut)) : '--:--'}</Muted>
        ) : (
          <Muted>{cell.holidayName ? '휴일' : '기록 없음'}</Muted>
        )}
      </Row>
      {!comp.isFullLeave && (rec || comp.leaveMinutes > 0) && (
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
            <Badge key={l} text={l} color={reviewed ? t.textFaint : labelColor(t, l)} />
          ))}
        </Row>
      )}
      {onToggleReview && isAnomaly(comp) ? (
        reviewed ? (
          <Row style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge text="✔ 확인함" color={t.textFaint} />
            <Button label="확인 해제" variant="neutral" small onPress={() => onToggleReview(date, false)} />
          </Row>
        ) : (
          <Button label="✔ 이상징후 확인" variant="outline" small onPress={() => onToggleReview(date, true)} />
        )
      ) : null}
      {rec?.hash ? <Muted size={11}>해시 {shortHash(rec.hash)}</Muted> : null}
      {onEdit ? (
        <Button label="✏️ 근태 수정" variant="outline" small onPress={() => onEdit(date)} />
      ) : null}
    </View>
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
