// 연간 근태 점수 — 감점(이상)+가점(초과근무)식. 연봉 협상 참고용 수치화.
// "정상 출근·정시 근무 = 100(불이익 없음), 열심히(초과근무) = 100 초과, 이상 = 감점".
// 연차·유급휴가는 정상으로 간주(감점 없음). 진행 중인 당일은 판정에서 제외.
import { AttendanceRecord, LeaveRequest, WorkPolicy } from './types';
import { addDaysKey, weekday, dateKeyToMs } from './time';
import { computeDay, isNormalWorkday } from './attendance';

export const SCORE_WEIGHTS = {
  absent: 5, // 무단결근 /일
  shortfall: 3, // 근로부족 /일
  coreViolation: 3, // 코어타임 미충족 /회
  late: 2, // 지각 /회
  earlyLeave: 2, // 조기퇴근 /회
  missing: 1, // 퇴근 미기록 /회
  overtimePerPoint: 480, // 초과근무 이만큼(분)당 +1점 (8시간=+1)
  overtimeCap: 15, // 초과근무 가점 상한
};

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface AttendanceScore {
  year: number;
  score: number; // 최종(0~115 클램프)
  rawScore: number; // 클램프 전
  grade: Grade;
  scheduledDays: number; // 소정근로일
  workedDays: number; // 실제 근무한 날(기록 있음)
  normalDays: number; // 정상근무일
  leaveDays: number; // 종일 휴가일(연차/유급)
  absentDays: number; // 무단결근(소정일인데 기록·연차 없음)
  lateCount: number;
  coreViolationCount: number;
  earlyLeaveCount: number;
  shortfallDays: number;
  missingCount: number;
  overtimeMinutes: number;
  overtimeBonus: number;
  deductionTotal: number;
  ratePct: number | null; // 출근율
}

export function gradeOf(score: number): Grade {
  if (score >= 100) return 'S';
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
  hireDate?: string
): AttendanceScore {
  const workdaySet = new Set(workPolicy.workdays);
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

  // 집계 시작 = 실제 추적이 시작된 시점. 앱 도입/입사 전 기간을 무단결근으로 잡지 않기 위해
  // (연초, 입사일, 첫 기록/연차일) 중 가장 늦은 날부터. 데이터가 전혀 없으면 집계 안 함.
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
  let coreViolationCount = 0;
  let earlyLeaveCount = 0;
  let shortfallDays = 0;
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
    if (!workdaySet.has(wd) || holidays.has(cur)) continue; // 소정근로일만
    scheduledDays += 1;

    const rec = recByDate.get(cur);
    const dayLeaves = leavesByDate.get(cur) || [];
    if (rec?.checkIn || dayLeaves.length) attended += 1;

    const comp = computeDay(rec, dayLeaves, workPolicy, { dateStr: cur, todayStr: today });
    if (comp.isFullLeave) {
      leaveDays += 1;
      continue; // 종일 휴가 = 정상, 감점/가점 없음
    }
    if (!rec?.checkIn) {
      if (cur < today && dayLeaves.length === 0) absentDays += 1; // 무단결근(당일 진행 중은 제외)
      continue;
    }
    workedDays += 1;
    if (comp.flags.late) lateCount += 1;
    if (comp.flags.coreViolation) coreViolationCount += 1;
    if (comp.flags.earlyLeave) earlyLeaveCount += 1;
    if (comp.flags.insufficient) shortfallDays += 1;
    if (comp.flags.missingClockOut) missingCount += 1;
    if (comp.flags.overtime) overtimeMinutes += Math.max(0, comp.workedMinutes - comp.requiredMinutes);
    if (isNormalWorkday(comp)) normalDays += 1;
  }

  const w = SCORE_WEIGHTS;
  const deductionTotal =
    absentDays * w.absent +
    shortfallDays * w.shortfall +
    coreViolationCount * w.coreViolation +
    lateCount * w.late +
    earlyLeaveCount * w.earlyLeave +
    missingCount * w.missing;
  const overtimeBonus = Math.min(w.overtimeCap, Math.floor(overtimeMinutes / w.overtimePerPoint));
  const rawScore = 100 - deductionTotal + overtimeBonus;
  const score = Math.max(0, Math.min(100 + w.overtimeCap, rawScore));

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
    coreViolationCount,
    earlyLeaveCount,
    shortfallDays,
    missingCount,
    overtimeMinutes,
    overtimeBonus,
    deductionTotal,
    ratePct: scheduledDays > 0 ? (attended / scheduledDays) * 100 : null,
  };
}
