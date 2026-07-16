// 연간 근태 점수 — 감점(이상)+가점(초과근무) · analog(분 단위 비례) 방식.
// "정시·성실 근무 = 100(불이익 없음), 초과근무 = 100 초과, 이상/무단이탈 = 시간에 비례 감점".
// 지각·부족·조기퇴근·무단이탈은 '얼마나'(분)를 반영해 비례 감점. 결근/코어위반/퇴근미기록은 건당.
// 연차·유급휴가는 정상으로 간주. 진행 중인 당일은 판정 제외.
// 집계 창은 실제 추적 시작(연초·입사일·첫 기록/연차일 중 가장 늦은 날)부터 → 도입 전 거짓 결근 방지.
import { AttendanceRecord, LeaveRequest, AwayLog, WorkPolicy } from './types';
import { addDaysKey, weekday, dateKeyToMs, hmToMinutes } from './time';
import { computeDay, isNormalWorkday } from './attendance';

export const SCORE_WEIGHTS = {
  // 시간 비례 감점(시간당 점수) — analog
  latePerHour: 3, // 지각(늦은 시간)
  shortfallPerHour: 3, // 근로부족(부족한 시간)
  earlyLeavePerHour: 2.5, // 조기퇴근(일찍 간 시간)
  awayPerHour: 3, // 무단이탈(관리자 기록) 시간 비례 기본 감점
  awayFreeCount: 3, // 이 횟수까지는 빈도 가중 없음(일시적 개인사정 이해)
  awayRepeatPenalty: 5, // 초과 1회당 추가 감점(정기·잦은 이탈 = 큰 불이익)
  overtimePerHour: 0.25, // 초과근무 가점(시간당) = 4시간당 +1 (열심히 한 사람 우대)
  overtimeCap: 25, // 초과근무 가점 상한
  // 건당 감점(이벤트성)
  absentPerDay: 5, // 무단결근 /일
  coreViolation: 3, // 코어타임 미충족 /회
  missing: 1, // 퇴근 미기록 /회
};

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface AttendanceScore {
  year: number;
  score: number; // 최종 점수(정수, 0~115). 100=정시·성실, 100 초과=초과근무 가점
  rawScore: number; // 반올림 전
  grade: Grade;
  scheduledDays: number;
  workedDays: number;
  normalDays: number;
  leaveDays: number;
  absentDays: number;
  lateCount: number;
  lateMinutes: number;
  coreViolationCount: number;
  earlyLeaveCount: number;
  earlyLeaveMinutes: number;
  shortfallDays: number;
  shortfallMinutes: number;
  missingCount: number;
  awayCount: number;
  awayMinutes: number;
  overtimeMinutes: number;
  overtimeBonus: number; // 가점(점수)
  deductionTotal: number; // 감점(점수)
  ratePct: number | null;
}

// 100점은 A. 100 초과(초과근무 가점)면 S.
export function gradeOf(score: number): Grade {
  if (score > 100) return 'S';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'D';
}

export function computeAttendanceScore(
  userId: string,
  year: number,
  records: AttendanceRecord[],
  leaves: LeaveRequest[],
  workPolicy: WorkPolicy,
  holidays: Set<string>,
  today: string,
  hireDate?: string,
  awayLogs: AwayLog[] = []
): AttendanceScore {
  const workdaySet = new Set(workPolicy.workdays);
  const latestClockIn = hmToMinutes(workPolicy.latestClockIn);
  const yearStart = `${year}-01-01`;
  const yearEndExcl = `${year + 1}-01-01`;
  const tomorrow = addDaysKey(today, 1);
  const endExcl = yearEndExcl <= tomorrow ? yearEndExcl : tomorrow; // 미래일 제외

  const recByDate = new Map<string, AttendanceRecord>();
  records.filter((r) => r.userId === userId).forEach((r) => recByDate.set(r.date, r));
  const leavesByDate = new Map<string, LeaveRequest[]>();
  leaves
    .filter((l) => l.userId === userId && l.status === 'APPROVED')
    .forEach((l) => {
      const a = leavesByDate.get(l.date) || [];
      a.push(l);
      leavesByDate.set(l.date, a);
    });

  // 집계 시작 = 실제 추적 시작 시점
  const activityDates = [
    ...records.filter((r) => r.userId === userId).map((r) => r.date),
    ...leaves.filter((l) => l.userId === userId && l.status === 'APPROVED').map((l) => l.date),
  ].filter((d) => d >= yearStart && d < endExcl);
  const firstActivity = activityDates.length ? activityDates.reduce((m, d) => (d < m ? d : m)) : null;
  let start = yearStart;
  if (hireDate && hireDate > start) start = hireDate;
  if (firstActivity && firstActivity > start) start = firstActivity;
  if (!firstActivity) start = endExcl; // 데이터 없음 → 루프 skip

  let scheduledDays = 0;
  let workedDays = 0;
  let normalDays = 0;
  let leaveDays = 0;
  let absentDays = 0;
  let lateCount = 0;
  let lateMinutes = 0;
  let coreViolationCount = 0;
  let earlyLeaveCount = 0;
  let earlyLeaveMinutes = 0;
  let shortfallDays = 0;
  let shortfallMinutes = 0;
  let missingCount = 0;
  let overtimeMinutes = 0;
  let attended = 0;

  let d = start;
  let guard = 0;
  while (d < endExcl && guard < 4000) {
    guard++;
    const cur = d;
    d = addDaysKey(d, 1);
    const wd = weekday(dateKeyToMs(cur));
    if (!workdaySet.has(wd) || holidays.has(cur)) continue;
    scheduledDays += 1;

    const rec = recByDate.get(cur);
    const dayLeaves = leavesByDate.get(cur) || [];
    if (rec?.checkIn || dayLeaves.length) attended += 1;

    const comp = computeDay(rec, dayLeaves, workPolicy, { dateStr: cur, todayStr: today });
    if (comp.isFullLeave) {
      leaveDays += 1;
      continue;
    }
    if (!rec?.checkIn) {
      if (cur < today && dayLeaves.length === 0) absentDays += 1;
      continue;
    }
    workedDays += 1;
    if (comp.flags.late) {
      lateCount += 1;
      lateMinutes += Math.max(0, comp.effectiveStartMin - latestClockIn);
    }
    if (comp.flags.coreViolation) coreViolationCount += 1;
    if (comp.flags.earlyLeave) {
      earlyLeaveCount += 1;
      if (comp.checkOutMin != null) earlyLeaveMinutes += Math.max(0, comp.expectedOutMin - comp.checkOutMin);
    }
    if (comp.flags.insufficient) {
      shortfallDays += 1;
      shortfallMinutes += Math.max(0, comp.requiredMinutes - comp.workedMinutes);
    }
    if (comp.flags.missingClockOut) missingCount += 1;
    if (comp.flags.overtime) overtimeMinutes += Math.max(0, comp.workedMinutes - comp.requiredMinutes);
    if (isNormalWorkday(comp)) normalDays += 1;
  }

  // 무단이탈 — 집계 창 내 날짜만 합산
  const myAway = awayLogs.filter((a) => a.userId === userId && a.date >= start && a.date < endExcl);
  const awayCount = myAway.length;
  const awayMinutes = myAway.reduce((s, a) => s + (a.minutes || 0), 0);

  const w = SCORE_WEIGHTS;
  const analogDeduction =
    (lateMinutes * w.latePerHour + shortfallMinutes * w.shortfallPerHour + earlyLeaveMinutes * w.earlyLeavePerHour) / 60;
  // 무단이탈: 시간 비례 기본 감점 + 잦을수록(빈도) 가중. 일시적(freeCount 이하)이면 가중 없음.
  const awayDeduction =
    (awayMinutes / 60) * w.awayPerHour + Math.max(0, awayCount - w.awayFreeCount) * w.awayRepeatPenalty;
  const eventDeduction = absentDays * w.absentPerDay + coreViolationCount * w.coreViolation + missingCount * w.missing;
  const deductionTotal = analogDeduction + awayDeduction + eventDeduction;
  const overtimeBonus = Math.min(w.overtimeCap, (overtimeMinutes / 60) * w.overtimePerHour);
  const rawScore = 100 - deductionTotal + overtimeBonus;
  const score = Math.round(Math.max(0, Math.min(100 + w.overtimeCap, rawScore)));

  return {
    year,
    score,
    rawScore,
    grade: gradeOf(score),
    scheduledDays,
    workedDays,
    normalDays,
    leaveDays,
    absentDays,
    lateCount,
    lateMinutes,
    coreViolationCount,
    earlyLeaveCount,
    earlyLeaveMinutes,
    shortfallDays,
    shortfallMinutes,
    missingCount,
    awayCount,
    awayMinutes,
    overtimeMinutes,
    overtimeBonus,
    deductionTotal,
    ratePct: scheduledDays > 0 ? (attended / scheduledDays) * 100 : null,
  };
}
