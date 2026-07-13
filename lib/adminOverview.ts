// 관리자 종합 현황: 직원 1명의 연차·근태·서명·이상징후를 한 번에 계산.
import { AttendanceRecord, LeaveRequest, LeaveAdjustment, Confirmation, WorkPolicy, LeavePolicy, User, MealAllowance } from './types';
import { computeDay, summarize, PeriodSummary } from './attendance';
import { computeBalance, LeaveBalance } from './leave';
import { weekStartKey } from './time';

export type TodayStatus = 'WORKING' | 'DONE' | 'LEAVE' | 'ABSENT';

export interface EmployeeOverview {
  id: string;
  name: string;
  empNo?: string;
  hireDate?: string;
  isAdmin?: boolean;
  balance: LeaveBalance | null; // 입사일 없으면 null
  month: PeriodSummary;
  today: {
    status: TodayStatus;
    checkInMin: number | null;
    checkOutMin: number | null;
    isFullLeave: boolean;
  };
  pendingLeaveCount: number;
  unsignedWeeks: number; // 기록이 있으나 서명 안 된 주 수
  anomalyDays: number; // 이번 달 지각/코어위반/부족/미기록 발생 일수
  mealTotal: number; // 이번 달 저녁식대 합계(원)
  hasWarning: boolean;
}

export interface OverviewInput {
  profilesById: Record<string, { name: string; empNo?: string; hireDate?: string; isAdmin?: boolean }>;
  records: AttendanceRecord[];
  leaves: LeaveRequest[];
  adjustments: LeaveAdjustment[];
  confirmations: Confirmation[];
  meals?: MealAllowance[];
  workPolicy: WorkPolicy;
  leavePolicy: LeavePolicy;
  holidays?: Set<string>; // 공휴일(80% 판정용)
  monthPrefix: string; // 'YYYY-MM'
  today: string; // 'YYYY-MM-DD'
  nowMin: number; // 현재 분(오늘 진행중 근로 계산)
}

export function buildEmployeeOverview(id: string, inp: OverviewInput): EmployeeOverview {
  const p = inp.profilesById[id];
  const name = p?.name || '(이름 없음)';

  const recs = inp.records.filter((r) => r.userId === id && r.date.startsWith(inp.monthPrefix));
  const approved = inp.leaves.filter((l) => l.userId === id && l.status === 'APPROVED' && l.date.startsWith(inp.monthPrefix));

  const dates = new Set<string>();
  recs.forEach((r) => dates.add(r.date));
  approved.forEach((l) => dates.add(l.date));

  const comps = [...dates].map((d) => {
    const rec = recs.find((r) => r.date === d);
    const dayLeaves = approved.filter((l) => l.date === d);
    const opts = d === inp.today ? { dateStr: d, nowMin: inp.nowMin, todayStr: inp.today } : { dateStr: d, todayStr: inp.today };
    return computeDay(rec, dayLeaves, inp.workPolicy, opts);
  });
  const month = summarize(comps, recs);
  const anomalyDays = comps.filter(
    (c) => c.flags.late || c.flags.coreViolation || c.flags.insufficient || c.flags.missingClockOut
  ).length;

  // 오늘 상태
  const todayRec = recs.find((r) => r.date === inp.today);
  const todayComp = comps.find((c) => c.date === inp.today);
  const isFullLeave = !!todayComp?.isFullLeave;
  let status: TodayStatus;
  if (todayRec?.checkIn && !todayRec?.checkOut) status = 'WORKING';
  else if (todayRec?.checkIn && todayRec?.checkOut) status = 'DONE';
  else if (isFullLeave) status = 'LEAVE';
  else status = 'ABSENT';

  // 미서명 주 (기록이 있는 주 중 확인 서명이 없는 주)
  const weekSet = new Set<string>();
  recs.forEach((r) => weekSet.add(weekStartKey(r.date)));
  let unsignedWeeks = 0;
  weekSet.forEach((ws) => {
    const signed = inp.confirmations.some((c) => c.userId === id && c.weekStart === ws);
    if (!signed) unsignedWeeks += 1;
  });

  const balance = p?.hireDate
    ? computeBalance(
        { id, name, hireDate: p.hireDate, empNo: p?.empNo, isAdmin: p?.isAdmin, createdAt: '' } as User,
        inp.leaves,
        inp.adjustments,
        inp.leavePolicy,
        undefined,
        { records: inp.records, workPolicy: inp.workPolicy, holidays: inp.holidays ?? new Set() }
      )
    : null;

  const pendingLeaveCount = inp.leaves.filter((l) => l.userId === id && l.status === 'REQUESTED').length;
  const mealTotal = (inp.meals || [])
    .filter((m) => m.userId === id && m.date.startsWith(inp.monthPrefix))
    .reduce((sum, m) => sum + m.amount, 0);

  // 관리자 계정은 입사일·연차 개념이 없으므로 그와 관련한 경고는 제외한다.
  const isAdmin = !!p?.isAdmin;
  const hasWarning =
    anomalyDays > 0 ||
    unsignedWeeks > 0 ||
    (!isAdmin && (!p?.hireDate || (balance != null && balance.remainingHours < 0)));

  return {
    id,
    name,
    empNo: p?.empNo,
    hireDate: p?.hireDate,
    isAdmin: p?.isAdmin,
    balance,
    month,
    today: {
      status,
      checkInMin: todayComp?.checkInMin ?? null,
      checkOutMin: todayComp?.checkOutMin ?? null,
      isFullLeave,
    },
    pendingLeaveCount,
    unsignedWeeks,
    anomalyDays,
    mealTotal,
    hasWarning,
  };
}
