import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Card, Muted, Body, Badge, Row, Divider } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { computeDay, DayComputation } from '@/lib/attendance';
import { dateKey, minutesOfDay, minutesToKor, minutesToHM, timeHM } from '@/lib/time';
import { shortHash } from '@/lib/hash';
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
}: {
  userId: string;
  records: AttendanceRecord[];
  leaves: LeaveRequest[];
  policy: WorkPolicy;
  holidays?: Holiday[];
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

  const totalWorked = cells.reduce((s, c) => s + c.comp.workedMinutes, 0);
  const workDays = cells.filter((c) => c.comp.hasCheckIn).length;
  const leaveDays = cells.filter((c) => c.comp.isFullLeave).length;

  return (
    <Card>
      {/* 월 이동 */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={() => { setMonthOffset((v) => v - 1); setSelected(null); }} hitSlop={12}>
          <Text style={{ color: t.primary, fontSize: 22, fontWeight: '700' }}>‹</Text>
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>{monthLabel}</Text>
          <Muted size={11}>근무 {workDays}일 · 실근로 {minutesToKor(totalWorked)}{leaveDays > 0 ? ` · 연차 ${leaveDays}일` : ''}</Muted>
        </View>
        <Pressable onPress={() => { monthOffset < 0 && setMonthOffset((v) => v + 1); setSelected(null); }} hitSlop={12}>
          <Text style={{ color: monthOffset >= 0 ? t.textFaint : t.primary, fontSize: 22, fontWeight: '700' }}>›</Text>
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
          const partialLeave = c.comp.leaveMinutes > 0 && !c.comp.isFullLeave;
          const isHoliday = !!c.holidayName;
          const dow = c.weekday;
          const numColor = c.comp.isFullLeave
            ? t.trip
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
                  backgroundColor: isSel
                    ? t.primarySoft
                    : c.comp.isFullLeave
                    ? t.tripSoft
                    : isHoliday
                    ? t.dangerSoft
                    : 'transparent',
                  borderWidth: isToday ? 1.5 : 0,
                  borderColor: isToday ? t.primary : 'transparent',
                  opacity: c.isFuture ? 0.4 : 1,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: isToday ? '800' : '600', color: numColor }}>
                  {c.day}
                </Text>
                <Row style={{ gap: 2, height: 6, alignItems: 'center' }}>
                  {okWork && <Dot color={t.success} />}
                  {anomaly && <Dot color={t.danger} />}
                  {c.comp.isFullLeave && <Dot color={t.trip} />}
                  {partialLeave && <Dot color={t.trip} />}
                </Row>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* 범례 */}
      <Row style={{ flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
        <Legend color={t.success} label="정상 근무" />
        <Legend color={t.danger} label="지각·부족·이상" />
        <Legend color={t.trip} label="연차" />
        <Legend color={t.danger} label="공휴일·휴무일" soft={t.dangerSoft} />
      </Row>

      {/* 선택일 상세 */}
      {sel && (
        <>
          <Divider />
          <DayDetail cell={sel} />
        </>
      )}
    </Card>
  );
}

function Dot({ color }: { color: string }) {
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />;
}

function Legend({ color, label, soft }: { color: string; label: string; soft?: string }) {
  const t = useTheme();
  return (
    <Row style={{ gap: 4, alignItems: 'center' }}>
      {soft ? (
        <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: soft, borderWidth: 1, borderColor: color }} />
      ) : (
        <Dot color={color} />
      )}
      <Text style={{ fontSize: 11, color: t.textDim }}>{label}</Text>
    </Row>
  );
}

function DayDetail({ cell }: { cell: DayCell }) {
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
          <Badge text={comp.isPaidLeave ? '종일 유급휴가' : '종일 연차'} color={comp.isPaidLeave ? t.success : t.trip} />
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
            <Badge key={l} text={l} color={/부족|미충족|지각|미기록|오류/.test(l) ? t.danger : /유급/.test(l) ? t.success : /연차|출장/.test(l) ? t.trip : t.textDim} />
          ))}
        </Row>
      )}
      {rec?.hash ? <Muted size={11}>해시 {shortHash(rec.hash)}</Muted> : null}
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
