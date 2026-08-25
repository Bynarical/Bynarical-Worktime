// 출근율 계산 — 근로기준법 제60조 80% 판정용.
// 소정근로일 = [start, end) 구간에서 근무요일(workPolicy.workdays)이면서 공휴일(holidays)이 아닌 날.
//   단, 종일 무급휴가일은 소정근로일에서 제외한다(개인 사정 무급휴직 기간은 소정근로일수에서
//   빼고 남은 소정근로일의 출근율로 판단 — 고용노동부 행정해석).
// 출근 인정일 = 소정근로일 중 근태기록(check_in 있음) 또는 승인 휴가가 있는 날(휴가 사용일은 출근 간주).
import { AttendanceRecord, LeaveRequest, WorkPolicy } from './types';
import { weekday, dateKeyToMs, addDaysKey, addMonthsKey } from './time';

export interface AttendanceStat {
  scheduled: number; // 소정근로일수
  attended: number; // 출근 인정일수
  ratePct: number | null; // 출근율(%) — 소정근로일 0이면 null
}

function eachDate(startIncl: string, endExcl: string): string[] {
  const out: string[] = [];
  let d = startIncl;
  let guard = 0;
  while (d < endExcl && guard < 4000) {
    out.push(d);
    d = addDaysKey(d, 1);
    guard++;
  }
  return out;
}

export function attendanceStat(
  userId: string,
  startIncl: string,
  endExcl: string,
  records: AttendanceRecord[],
  leaves: LeaveRequest[],
  workPolicy: WorkPolicy,
  holidays: Set<string>
): AttendanceStat {
  const workdaySet = new Set(workPolicy.workdays);
  const fullDayHours = (workPolicy.dailyWorkMinutes || 480) / 60;
  const mine = leaves.filter((l) => l.userId === userId && l.status === 'APPROVED');
  const recDates = new Set(records.filter((r) => r.userId === userId && r.checkIn).map((r) => r.date));
  const leaveDates = new Set(mine.map((l) => l.date));
  // 종일 무급휴가 = 소정근로일 자체에서 제외(출근율 분모에 넣지 않음)
  const unpaidFullDates = new Set(
    mine.filter((l) => l.category === 'UNPAID' && (l.segment === 'FULL' || l.hours >= fullDayHours)).map((l) => l.date)
  );

  let scheduled = 0;
  let attended = 0;
  for (const d of eachDate(startIncl, endExcl)) {
    const wd = weekday(dateKeyToMs(d)); // 0=일 .. 6=토
    if (!workdaySet.has(wd)) continue;
    if (holidays.has(d)) continue;
    if (unpaidFullDates.has(d)) continue;
    scheduled += 1;
    if (recDates.has(d) || leaveDates.has(d)) attended += 1;
  }
  return { scheduled, attended, ratePct: scheduled > 0 ? (attended / scheduled) * 100 : null };
}

// 80% 미달 연도의 §60(2) 부여일수 = 개근한 월 수(1개월 개근당 1일).
// 자격연도(startIncl~)를 입사 기준 12개 월 슬라이스로 나눠, 각 슬라이스의 소정근로일을 모두 출근했으면 개근으로 카운트.
export function perfectMonths(
  userId: string,
  startIncl: string,
  records: AttendanceRecord[],
  leaves: LeaveRequest[],
  workPolicy: WorkPolicy,
  holidays: Set<string>
): number {
  let count = 0;
  for (let k = 0; k < 12; k++) {
    const s = addMonthsKey(startIncl, k);
    const e = addMonthsKey(startIncl, k + 1);
    const st = attendanceStat(userId, s, e, records, leaves, workPolicy, holidays);
    if (st.scheduled > 0 && st.attended >= st.scheduled) count += 1;
  }
  return count;
}
