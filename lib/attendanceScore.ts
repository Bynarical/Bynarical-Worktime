// 연간 근태 점수 — 감점(이상)+가점(초과근무) · analog(분 단위 비례) 방식.
// "정시·성실 근무 = 100(불이익 없음), 초과근무 = 100 초과, 이상/무단이탈 = 시간에 비례 감점".
// 지각·부족·무단이탈은 '얼마나'(분)를 반영해 비례 감점. 결근/코어위반/퇴근미기록은 건당.
// 같은 일을 두 번 세지 않는다: 잃은 근로시간은 근로부족에서만(조기퇴근은 따로 감점 안 함),
// 지각한 날의 코어 시작 미충족은 지각으로 갈음. 하루 감점은 무단결근을 넘지 않는다.
// 연차·유급휴가는 정상으로 간주. 종일 무급휴가는 소정근로일 자체에서 제외(감점·출근율 영향 없음).
// 관리자가 승인한 출장(종일/오전/오후)은 그 구간만큼 근로시간으로 인정되어 감점되지 않는다.
// 출근 기록 없이 관리자가 사후 등록한 승인 출장도 마찬가지(결근 아님). 휴가·출장이 덮지 못한 나머지만 근로부족.
// 지각·부족·초과는 30분 단위 출근제(적용 출근)가 아니라 실제 출퇴근 시각(분)으로 센다
// → 8:45 출근과 8:57 출근은 같은 9:00 적용이어도 점수가 다르다. 점수는 소수 첫째 자리까지.
// 진행 중인 당일은 판정 제외.
// 집계 창은 실제 추적 시작(연초·입사일·첫 기록/연차일 중 가장 늦은 날)부터 → 도입 전 거짓 결근 방지.
// 끝은 퇴사일(마지막 근무일)까지 → 퇴사 후 복구해도 그 사이가 결근으로 잡히지 않는다.
import { AttendanceRecord, LeaveRequest, AwayLog, WorkPolicy } from './types';
import { addDaysKey, weekday, dateKeyToMs } from './time';
import { computeDay } from './attendance';

export const SCORE_WEIGHTS = {
  // 시간 비례 감점(시간당 점수) — analog
  latePerHour: 3, // 지각(늦은 시간)
  shortfallPerHour: 3, // 근로부족(부족한 시간) — 조기퇴근으로 빠진 시간도 여기서 한 번만 감점
  awayPerHour: 3, // 무단이탈(관리자 기록) 시간 비례 기본 감점
  awayFreeCount: 3, // 이 횟수까지는 빈도 가중 없음(일시적 개인사정 이해)
  awayRepeatPenalty: 5, // 초과 1회당 추가 감점(정기·잦은 이탈 = 큰 불이익)
  overtimePerHour: 0.25, // 초과근무 가점(시간당) = 4시간당 +1 (열심히 한 사람 우대)
  overtimeCap: 25, // 초과근무 가점 상한
  // 건당 감점(이벤트성)
  absentPerDay: 27, // 무단결근 /일 = 하루 통째 근로부족(8h×3) + 코어 미충족(3). 하루 감점의 상한이기도 함
  coreViolation: 3, // 코어타임 미충족 /회 (지각한 날은 코어 종료 전 퇴근일 때만)
  missing: 1, // 퇴근 미기록 /회
};

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface AttendanceScore {
  year: number;
  score: number; // 최종 점수(소수 첫째 자리, 0~125). 100=정시·성실, 100 초과=초과근무 가점
  rawScore: number; // 반올림 전
  grade: Grade;
  scheduledDays: number;
  workedDays: number;
  normalDays: number;
  leaveDays: number; // 종일 연차·유급휴가 일수
  unpaidLeaveDays: number; // 종일 무급휴가 일수(소정근로일에서 제외됨)
  absentDays: number;
  lateCount: number;
  lateMinutes: number;
  coreViolationCount: number;
  shortfallDays: number;
  shortfallMinutes: number;
  missingCount: number;
  awayCount: number;
  awayMinutes: number;
  overtimeMinutes: number;
  overtimeBonus: number; // 가점(점수)
  dayCapRelief: number; // 하루 감점 상한(무단결근) 초과로 되돌린 점수
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
  awayLogs: AwayLog[] = [],
  resignDate?: string
): AttendanceScore {
  const w = SCORE_WEIGHTS;
  const workdaySet = new Set(workPolicy.workdays);
  const yearStart = `${year}-01-01`;
  const yearEndExcl = `${year + 1}-01-01`;
  const tomorrow = addDaysKey(today, 1);
  let endExcl = yearEndExcl <= tomorrow ? yearEndExcl : tomorrow; // 미래일 제외
  if (resignDate && addDaysKey(resignDate, 1) < endExcl) endExcl = addDaysKey(resignDate, 1); // 퇴사일 다음 날부터 제외

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
  let unpaidLeaveDays = 0;
  let absentDays = 0;
  let lateCount = 0;
  let lateMinutes = 0;
  let coreViolationCount = 0;
  let shortfallDays = 0;
  let shortfallMinutes = 0;
  let missingCount = 0;
  let overtimeMinutes = 0;
  let dayCapRelief = 0;
  let attended = 0;

  let d = start;
  let guard = 0;
  while (d < endExcl && guard < 4000) {
    guard++;
    const cur = d;
    d = addDaysKey(d, 1);
    const wd = weekday(dateKeyToMs(cur));
    if (!workdaySet.has(wd) || holidays.has(cur)) continue;

    const rec = recByDate.get(cur);
    const dayLeaves = leavesByDate.get(cur) || [];
    const comp = computeDay(rec, dayLeaves, workPolicy, { dateStr: cur, todayStr: today });

    // 종일 무급휴가 = 근로 제공 의무가 없는 날 → 소정근로일·출근율에서 제외(감점 없음)
    if (comp.isFullLeave && comp.leaveCategory === 'UNPAID') {
      unpaidLeaveDays += 1;
      continue;
    }

    scheduledDays += 1;
    const tripCovered = comp.tripCoverMinutes > 0; // 승인 출장 — 출근 기록이 없어도 출근으로 본다
    if (rec?.checkIn || dayLeaves.length || tripCovered) attended += 1;

    if (comp.isFullLeave) {
      leaveDays += 1;
      continue;
    }
    // 진행 중인 당일은 판정하지 않는다(지난 날만).
    const closed = cur < today;
    // 출근 기록도, 휴가도, 승인 출장도 없는 지난 근무일 = 무단결근.
    if (closed && !rec?.checkIn && dayLeaves.length === 0 && !tripCovered) {
      absentDays += 1;
      continue;
    }
    let dayLateMin = 0;
    let dayShortMin = 0;
    let dayCore = false;
    if (!rec?.checkIn) {
      if (!closed) continue;
      if (tripCovered) workedDays += 1;
      // 휴가·승인 출장이 덮지 못한 소정근로 = 근로부족, 그 시간대 코어타임도 비었다.
      dayShortMin = Math.max(0, comp.requiredMinutes - comp.tripCoverMinutes);
      if (dayShortMin > 0) {
        shortfallDays += 1;
        coreViolationCount += 1;
        dayCore = true;
      } else {
        normalDays += 1;
      }
    } else {
      workedDays += 1;
      dayLateMin = comp.actualLateMinutes;
      if (dayLateMin > 0) lateCount += 1;
      // 지각한 날의 코어 시작 미충족은 지각으로 이미 감점 → 코어 종료 전에 퇴근했을 때만 따로 센다.
      if (comp.flags.coreViolation && (dayLateMin === 0 || comp.coreEndMissed)) {
        coreViolationCount += 1;
        dayCore = true;
      }
      // 조기퇴근은 그만큼 근로부족으로 잡히므로 따로 감점하지 않는다.
      // 실제 출퇴근 시각으로 센 근로 + 승인 출장 인정분을 그날 소정근로와 비교한다.
      if (closed && comp.hasCheckOut) {
        const diff = comp.actualRecognizedMinutes - comp.requiredMinutes;
        if (diff < -0.01) {
          shortfallDays += 1;
          dayShortMin = -diff;
        } else if (diff > 0.01) {
          overtimeMinutes += diff;
        }
      }
      if (comp.flags.missingClockOut) missingCount += 1;
      if (comp.hasCheckOut && dayLateMin === 0 && !comp.flags.coreViolation && dayShortMin === 0 && !comp.flags.missingClockOut)
        normalDays += 1;
    }
    lateMinutes += dayLateMin;
    shortfallMinutes += dayShortMin;
    // 출근한 날이 아예 안 나온 날보다 무거우면 안 된다 → 하루 감점은 무단결근 감점이 상한.
    const dayDeduction =
      (dayLateMin * w.latePerHour + dayShortMin * w.shortfallPerHour) / 60 + (dayCore ? w.coreViolation : 0);
    dayCapRelief += Math.max(0, dayDeduction - w.absentPerDay);
  }

  // 무단이탈 — 집계 창 내 날짜만 합산
  const myAway = awayLogs.filter((a) => a.userId === userId && a.date >= start && a.date < endExcl);
  const awayCount = myAway.length;
  const awayMinutes = myAway.reduce((s, a) => s + (a.minutes || 0), 0);

  const analogDeduction = (lateMinutes * w.latePerHour + shortfallMinutes * w.shortfallPerHour) / 60;
  // 무단이탈: 시간 비례 기본 감점 + 잦을수록(빈도) 가중. 일시적(freeCount 이하)이면 가중 없음.
  const awayDeduction =
    (awayMinutes / 60) * w.awayPerHour + Math.max(0, awayCount - w.awayFreeCount) * w.awayRepeatPenalty;
  const eventDeduction = absentDays * w.absentPerDay + coreViolationCount * w.coreViolation + missingCount * w.missing;
  const deductionTotal = analogDeduction + awayDeduction + eventDeduction - dayCapRelief;
  const overtimeBonus = Math.min(w.overtimeCap, (overtimeMinutes / 60) * w.overtimePerHour);
  const rawScore = 100 - deductionTotal + overtimeBonus;
  const score = Math.round(Math.max(0, Math.min(100 + w.overtimeCap, rawScore)) * 10) / 10;

  return {
    year,
    score,
    rawScore,
    grade: gradeOf(score),
    scheduledDays,
    workedDays,
    normalDays,
    leaveDays,
    unpaidLeaveDays,
    absentDays,
    lateCount,
    lateMinutes,
    coreViolationCount,
    shortfallDays,
    shortfallMinutes,
    missingCount,
    awayCount,
    awayMinutes,
    overtimeMinutes,
    overtimeBonus,
    dayCapRelief,
    deductionTotal,
    ratePct: scheduledDays > 0 ? (attended / scheduledDays) * 100 : null,
  };
}
