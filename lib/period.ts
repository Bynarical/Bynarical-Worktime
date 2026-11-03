// 관리자 기간 등록 — 휴가(연차·유급·무급) 또는 출장을 시작~종료일 사이 근무일마다 한 번에 넣는다.
// 주말·공휴일은 건너뛰고, 직원이 확인·서명한 주(잠금)와 이미 휴가·출장이 있는 날은 손대지 않는다.
// 기간 등록은 종일 단위만 — 반일 휴가·반일 출장은 날짜별 근태 수정에서 한다.
import { AttendanceRecord, Confirmation, LeaveCategory, LeaveRequest, WorkPolicy } from './types';
import { addDaysKey, weekday, dateKeyToMs } from './time';
import { confirmationCovering } from './confirmation';

export type PeriodKind = LeaveCategory | 'TRIP';

export const PERIOD_MAX_DAYS = 366;

export interface PeriodContext {
  records: AttendanceRecord[];
  leaves: LeaveRequest[];
  confirmations: Confirmation[];
  workPolicy: WorkPolicy;
  holidays: Set<string>;
}

export interface PeriodDay {
  date: string;
  skip?: string; // 건너뛰는 사유(없으면 등록)
  record?: AttendanceRecord; // 출장: 이미 있는 근무기록 → 출근·퇴근 시각은 두고 출장으로 바꾼다
}

export interface PeriodPlan {
  error?: string;
  days: PeriodDay[]; // 근무일만
  offDays: number; // 주말·공휴일로 뺀 날
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validRange(from: string, to: string): string | undefined {
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || isNaN(Date.parse(from)) || isNaN(Date.parse(to)))
    return '날짜 형식은 YYYY-MM-DD 입니다.';
  if (to < from) return '종료일이 시작일보다 빠릅니다.';
  if ((Date.parse(to) - Date.parse(from)) / 86400000 + 1 > PERIOD_MAX_DAYS) return `한 번에 ${PERIOD_MAX_DAYS}일까지 등록할 수 있습니다.`;
  return undefined;
}

// 기간 안의 근무일(근무요일이면서 공휴일이 아닌 날)과 뺀 날 수
function workdaysIn(from: string, to: string, ctx: PeriodContext): { dates: string[]; offDays: number } {
  const workdaySet = new Set(ctx.workPolicy.workdays);
  const dates: string[] = [];
  let offDays = 0;
  for (let d = from; d <= to; d = addDaysKey(d, 1)) {
    if (!workdaySet.has(weekday(dateKeyToMs(d))) || ctx.holidays.has(d)) offDays += 1;
    else dates.push(d);
  }
  return { dates, offDays };
}

export function planPeriod(userId: string, kind: PeriodKind, from: string, to: string, ctx: PeriodContext): PeriodPlan {
  const error = validRange(from, to);
  if (error) return { error, days: [], offDays: 0 };
  const { dates, offDays } = workdaysIn(from, to, ctx);
  const fullDayHours = (ctx.workPolicy.dailyWorkMinutes || 480) / 60;
  const days = dates.map((date): PeriodDay => {
    if (confirmationCovering(ctx.confirmations, userId, date)) return { date, skip: '서명 잠금' };
    const rec = ctx.records.find((r) => r.userId === userId && r.date === date);
    // 승인됐거나 승인 대기 중인 휴가 — 겹쳐 넣으면 같은 날 휴가가 이중으로 잡힌다.
    const dayLeaves = ctx.leaves.filter(
      (l) => l.userId === userId && l.date === date && (l.status === 'APPROVED' || l.status === 'REQUESTED')
    );
    if (kind === 'TRIP') {
      const fullLeave =
        dayLeaves.some((l) => l.status === 'APPROVED' && l.segment === 'FULL') ||
        dayLeaves.filter((l) => l.status === 'APPROVED').reduce((s, l) => s + l.hours, 0) >= fullDayHours;
      if (fullLeave) return { date, skip: '종일 휴가' };
      if (rec?.type === 'TRIP' && (rec.tripSegment ?? 'FULL') === 'FULL' && rec.tripStatus === 'APPROVED')
        return { date, skip: '이미 출장' };
      return { date, record: rec };
    }
    if (dayLeaves.length) return { date, skip: '휴가 있음' };
    if (rec?.checkIn) return { date, skip: '출근 기록 있음' };
    if (rec?.type === 'TRIP') return { date, skip: '출장 기록 있음' };
    return { date };
  });
  return { days, offDays };
}

export interface PeriodClearPlan {
  error?: string;
  leaveIds: string[]; // 지울 종일 휴가
  tripDeletes: string[]; // 출근 기록 없는 출장 → 기록째 삭제
  tripReverts: AttendanceRecord[]; // 출근 기록 있는 출장 → 근무로 되돌림(시각 보존)
  lockedDays: number; // 서명 잠금이라 못 지우는 날
}

// 기간 취소 — 그 기간에 들어 있는 같은 종류의 '종일' 휴가·출장을 지운다(반일 건은 그대로).
export function planPeriodClear(userId: string, kind: PeriodKind, from: string, to: string, ctx: PeriodContext): PeriodClearPlan {
  const out: PeriodClearPlan = { leaveIds: [], tripDeletes: [], tripReverts: [], lockedDays: 0 };
  const error = validRange(from, to);
  if (error) return { ...out, error };
  const inRange = (d: string) => d >= from && d <= to;
  const locked = (d: string) => !!confirmationCovering(ctx.confirmations, userId, d);
  if (kind === 'TRIP') {
    for (const r of ctx.records) {
      if (r.userId !== userId || !inRange(r.date) || r.type !== 'TRIP' || (r.tripSegment ?? 'FULL') !== 'FULL') continue;
      if (locked(r.date)) out.lockedDays += 1;
      else if (r.checkIn) out.tripReverts.push(r);
      else out.tripDeletes.push(r.id);
    }
  } else {
    for (const l of ctx.leaves) {
      if (l.userId !== userId || !inRange(l.date) || l.status !== 'APPROVED' || l.segment !== 'FULL') continue;
      if ((l.category ?? 'ANNUAL') !== kind) continue;
      if (locked(l.date)) out.lockedDays += 1;
      else out.leaveIds.push(l.id);
    }
  }
  return out;
}
