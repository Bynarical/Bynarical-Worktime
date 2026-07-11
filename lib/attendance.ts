// 근태 도메인 로직 — 코어타임 근무제(근로계약서 제4조) 반영.
import { AttendanceRecord, LeaveRequest, WorkPolicy } from './types';
import { hmToMinutes, minutesOfDay, minutesToHM, weekday } from './time';

export interface Interval {
  s: number; // 분(자정 기준)
  e: number;
}

// 두 구간의 겹치는 분
export function overlap(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.e, b.e) - Math.max(a.s, b.s));
}

// 구간 목록에서 base 구간을 빼고 남은 구간들
export function subtract(base: Interval, cuts: Interval[]): Interval[] {
  let segs: Interval[] = [{ ...base }];
  for (const cut of cuts) {
    const next: Interval[] = [];
    for (const seg of segs) {
      if (cut.e <= seg.s || cut.s >= seg.e) {
        next.push(seg); // 겹침 없음
      } else {
        if (cut.s > seg.s) next.push({ s: seg.s, e: cut.s });
        if (cut.e < seg.e) next.push({ s: cut.e, e: seg.e });
      }
    }
    segs = next;
  }
  return segs.filter((s) => s.e - s.s > 0.01);
}

export function intervalsLength(segs: Interval[]): number {
  return segs.reduce((sum, s) => sum + (s.e - s.s), 0);
}

// 계획 근무 종료시각(분): 시작 + 소정근로 + (구간 내 휴게)
export function plannedEndMinutes(startMin: number, policy: WorkPolicy): number {
  const bS = hmToMinutes(policy.breakStart);
  const bE = hmToMinutes(policy.breakEnd);
  let end = startMin + policy.dailyWorkMinutes;
  // 휴게가 근무구간에 걸치면 그만큼 뒤로 밀린다(최대 2회 수렴).
  for (let i = 0; i < 3; i++) {
    const ov = overlap({ s: startMin, e: end }, { s: bS, e: bE });
    const newEnd = startMin + policy.dailyWorkMinutes + ov;
    if (Math.abs(newEnd - end) < 0.01) break;
    end = newEnd;
  }
  return end;
}

// 승인된 연차로 인한 "부재(off) 구간" 계산 (분)
export function leaveOffIntervals(
  leaves: LeaveRequest[],
  plannedStartMin: number,
  plannedEndMin: number
): { intervals: Interval[]; leaveMinutes: number } {
  const intervals: Interval[] = [];
  let leaveMinutes = 0;
  for (const lv of leaves) {
    if (lv.status !== 'APPROVED') continue;
    const h = lv.hours * 60;
    leaveMinutes += h;
    if (lv.segment === 'FULL') {
      intervals.push({ s: plannedStartMin, e: plannedEndMin });
    } else if (lv.segment === 'AM') {
      intervals.push({ s: plannedStartMin, e: plannedStartMin + h });
    } else if (lv.segment === 'PM') {
      intervals.push({ s: plannedEndMin - h, e: plannedEndMin });
    } else if (lv.segment === 'CUSTOM' && lv.startTime && lv.endTime) {
      intervals.push({ s: hmToMinutes(lv.startTime), e: hmToMinutes(lv.endTime) });
    } else {
      // 시간만 있는 경우 오전으로 간주
      intervals.push({ s: plannedStartMin, e: plannedStartMin + h });
    }
  }
  return { intervals, leaveMinutes };
}

export interface DayComputation {
  date: string;
  hasCheckIn: boolean;
  hasCheckOut: boolean;
  checkInMin: number | null;
  checkOutMin: number | null;
  plannedStartMin: number;
  plannedEndMin: number;
  expectedInMin: number; // 연차 반영 기대 출근
  expectedOutMin: number; // 연차 반영 기대 퇴근
  workedMinutes: number; // 휴게 제외 실근로(퇴근 전이면 현재까지)
  breakDeducted: number;
  requiredMinutes: number; // 연차 차감 후 소정근로
  leaveMinutes: number;
  diffMinutes: number; // worked - required (음수=부족, 양수=초과)
  isWorkday: boolean;
  isFullLeave: boolean;
  flags: {
    late: boolean; // 지각(기대 출근 초과)
    coreViolation: boolean; // 코어타임 미충족
    earlyLeave: boolean; // 조기 퇴근
    insufficient: boolean; // 근로시간 부족
    overtime: boolean; // 초과 근무
    missingClockOut: boolean; // 퇴근 미기록
    plannedStepInvalid: boolean; // 출근시각 30분 단위 아님
    inTooEarly: boolean; // 최소 출근시각 이전
  };
  labels: string[]; // 표시용 한글 라벨
}

// 하루치 계산. nowMin: 오늘일 때 현재 분(진행중 근로 계산용), 아니면 undefined.
export function computeDay(
  record: AttendanceRecord | undefined,
  leaves: LeaveRequest[],
  policy: WorkPolicy,
  opts: { nowMin?: number; dateStr: string } = { dateStr: '' }
): DayComputation {
  const dateStr = opts.dateStr || record?.date || '';
  const dayMs = dateStr ? Date.parse(dateStr + 'T00:00:00Z') : 0;
  const wd = dateStr ? weekday(dayMs) : 1;
  const isWorkday = policy.workdays.includes(wd);

  const plannedStartMin = hmToMinutes(record?.plannedStart || policy.latestClockIn);
  const plannedEndMin = plannedEndMinutes(plannedStartMin, policy);

  const { intervals: offIntervals, leaveMinutes } = leaveOffIntervals(
    leaves,
    plannedStartMin,
    plannedEndMin
  );
  const isFullLeave =
    leaves.some((l) => l.status === 'APPROVED' && l.segment === 'FULL') ||
    leaveMinutes >= policy.dailyWorkMinutes;

  const checkInMin = record?.checkIn != null ? minutesOfDay(Date.parse(record.checkIn)) : null;
  let checkOutMin = record?.checkOut != null ? minutesOfDay(Date.parse(record.checkOut)) : null;
  const hasCheckIn = checkInMin != null;
  const hasCheckOut = checkOutMin != null;

  // 진행중(퇴근 전)이면 현재 시각까지로 임시 계산
  const effOutMin = checkOutMin != null ? checkOutMin : opts.nowMin != null ? opts.nowMin : null;

  const bS = hmToMinutes(policy.breakStart);
  const bE = hmToMinutes(policy.breakEnd);

  let workedMinutes = 0;
  let breakDeducted = 0;
  if (checkInMin != null && effOutMin != null && effOutMin > checkInMin) {
    const span = { s: checkInMin, e: effOutMin };
    breakDeducted = overlap(span, { s: bS, e: bE });
    workedMinutes = effOutMin - checkInMin - breakDeducted;
  }

  const requiredMinutes = Math.max(0, policy.dailyWorkMinutes - leaveMinutes);

  // 기대 출근/퇴근 (연차 off 반영)
  const leadOff = offIntervals
    .filter((iv) => iv.s <= plannedStartMin + 0.01)
    .reduce((mx, iv) => Math.max(mx, iv.e), plannedStartMin);
  const trailOff = offIntervals
    .filter((iv) => iv.e >= plannedEndMin - 0.01)
    .reduce((mn, iv) => Math.min(mn, iv.s), plannedEndMin);
  const expectedInMin = isFullLeave ? plannedStartMin : leadOff;
  const expectedOutMin = isFullLeave ? plannedStartMin : trailOff;

  // 코어타임 유효 구간 = 코어 - off
  const effectiveCore = subtract(
    { s: hmToMinutes(policy.coreStart), e: hmToMinutes(policy.coreEnd) },
    offIntervals
  );

  // 플래그
  const flags = {
    late: false,
    coreViolation: false,
    earlyLeave: false,
    insufficient: false,
    overtime: false,
    missingClockOut: false,
    plannedStepInvalid: false,
    inTooEarly: false,
  };

  if (!isFullLeave && isWorkday) {
    if (record?.plannedStart && hmToMinutes(record.plannedStart) % policy.clockInStepMinutes !== 0) {
      flags.plannedStepInvalid = true;
    }
    if (hasCheckIn && checkInMin != null) {
      if (checkInMin > expectedInMin + 0.01) flags.late = true;
      if (checkInMin < hmToMinutes(policy.earliestClockIn) - 0.01) flags.inTooEarly = true;
    }
    if (hasCheckIn && !hasCheckOut) flags.missingClockOut = true;

    if (hasCheckOut && checkOutMin != null) {
      if (checkOutMin < expectedOutMin - 0.01) flags.earlyLeave = true;
      // 코어타임: 출근~퇴근 구간이 유효 코어를 모두 포함하는지
      const covered = effectiveCore.every(
        (c) => checkInMin != null && checkInMin <= c.s + 0.01 && checkOutMin! >= c.e - 0.01
      );
      if (effectiveCore.length > 0 && !covered) flags.coreViolation = true;
      if (workedMinutes < requiredMinutes - 0.01) flags.insufficient = true;
      if (workedMinutes > requiredMinutes + 0.01) flags.overtime = true;
    }
  }

  const diffMinutes = hasCheckOut ? workedMinutes - requiredMinutes : 0;

  const labels: string[] = [];
  if (isFullLeave) labels.push('연차(종일)');
  else if (leaveMinutes > 0) labels.push(`연차 ${leaveMinutes / 60}h`);
  if (flags.late) labels.push('지각');
  if (flags.coreViolation) labels.push('코어타임 미충족');
  if (flags.earlyLeave) labels.push('조기퇴근');
  if (flags.missingClockOut) labels.push('퇴근 미기록');
  if (flags.insufficient) labels.push('근로부족');
  if (flags.overtime) labels.push('초과근무');
  if (flags.plannedStepInvalid) labels.push('출근단위 오류');
  if (record?.type === 'TRIP') labels.push('출장');

  return {
    date: dateStr,
    hasCheckIn,
    hasCheckOut,
    checkInMin,
    checkOutMin,
    plannedStartMin,
    plannedEndMin,
    expectedInMin,
    expectedOutMin,
    workedMinutes,
    breakDeducted,
    requiredMinutes,
    leaveMinutes,
    diffMinutes,
    isWorkday,
    isFullLeave,
    flags,
    labels,
  };
}

export interface PeriodSummary {
  days: number; // 근무(기록)일수
  totalWorked: number; // 총 실근로(분)
  totalRequired: number; // 총 소정근로(분)
  totalDiff: number; // 초과/부족(분)
  lateCount: number;
  coreViolationCount: number;
  earlyLeaveCount: number;
  missingCount: number;
  leaveMinutes: number; // 사용 연차(분)
  tripCount: number;
}

// 기간 집계
export function summarize(computations: DayComputation[], records: AttendanceRecord[]): PeriodSummary {
  const s: PeriodSummary = {
    days: 0,
    totalWorked: 0,
    totalRequired: 0,
    totalDiff: 0,
    lateCount: 0,
    coreViolationCount: 0,
    earlyLeaveCount: 0,
    missingCount: 0,
    leaveMinutes: 0,
    tripCount: 0,
  };
  for (const c of computations) {
    if (c.hasCheckIn) s.days += 1;
    s.totalWorked += c.workedMinutes;
    s.totalRequired += c.requiredMinutes;
    s.leaveMinutes += c.leaveMinutes;
    if (c.flags.late) s.lateCount += 1;
    if (c.flags.coreViolation) s.coreViolationCount += 1;
    if (c.flags.earlyLeave) s.earlyLeaveCount += 1;
    if (c.flags.missingClockOut) s.missingCount += 1;
  }
  for (const r of records) if (r.type === 'TRIP') s.tripCount += 1;
  s.totalDiff = s.totalWorked - s.totalRequired;
  return s;
}

// 표시용: 기대 퇴근시각 문자열
export function expectedClockOutLabel(plannedStart: string, policy: WorkPolicy): string {
  return minutesToHM(plannedEndMinutes(hmToMinutes(plannedStart), policy));
}
