// 연차 도메인 로직 — 반반차(2h 단위) + 근로기준법 기반 발생(근로계약서 제6조).
import { LeavePolicy, LeaveRequest, LeaveUnit, User, LeaveAdjustment } from './types';
import { monthsSince, yearsSince, dateKey } from './time';

// 발생 일수 상세
export interface Accrual {
  days: number; // 발생 연차(일)
  basis: string; // 산정 근거 설명
  months: number;
  years: number;
}

// asOf(YYYY-MM-DD) 기준 발생 연차 일수
export function accruedDays(hireDate: string | undefined, asOf: string, policy: LeavePolicy): Accrual {
  if (!hireDate) {
    return { days: 0, basis: '입사일 미설정 — 관리자 부여분만 인정', months: 0, years: 0 };
  }
  const months = monthsSince(hireDate, asOf);
  const years = yearsSince(hireDate, asOf);

  if (years < 1) {
    const days = Math.min(months * policy.firstYearMonthlyGrantDays, policy.firstYearMaxDays);
    return {
      days,
      basis: `입사 1년 미만: ${months}개월 개근분 ${days}일 (월 ${policy.firstYearMonthlyGrantDays}일, 최대 ${policy.firstYearMaxDays}일)`,
      months,
      years,
    };
  }

  let extra = 0;
  if (years >= policy.extraStartYear) {
    extra = Math.floor((years - policy.extraStartYear) / policy.extraEveryYears) + 1;
  }
  const days = Math.min(policy.baseAnnualDays + extra, policy.maxAnnualDays);
  return {
    days,
    basis: `근속 ${years}년: 기본 ${policy.baseAnnualDays}일 + 가산 ${extra}일 (상한 ${policy.maxAnnualDays}일)`,
    months,
    years,
  };
}

export interface LeaveBalance {
  entitledHours: number; // 발생(부여) 총 시간
  usedHours: number; // 승인 사용 시간
  pendingHours: number; // 신청 대기 시간
  remainingHours: number; // 잔여(발생-사용-대기)
  accrual: Accrual;
  adjustmentHours: number;
}

function sumAdjustments(userId: string, adjustments: LeaveAdjustment[]): number {
  return adjustments.filter((a) => a.userId === userId).reduce((s, a) => s + a.hours, 0);
}

// 연차 잔액 계산
export function computeBalance(
  user: User,
  leaves: LeaveRequest[],
  adjustments: LeaveAdjustment[],
  policy: LeavePolicy,
  asOf: string = dateKey()
): LeaveBalance {
  const accrual = accruedDays(user.hireDate, asOf, policy);
  const adjustmentHours = sumAdjustments(user.id, adjustments);
  const entitledHours = accrual.days * policy.fullDayHours + adjustmentHours;

  const mine = leaves.filter((l) => l.userId === user.id);
  const usedHours = mine
    .filter((l) => l.status === 'APPROVED')
    .reduce((s, l) => s + l.hours, 0);
  const pendingHours = mine
    .filter((l) => l.status === 'REQUESTED')
    .reduce((s, l) => s + l.hours, 0);

  return {
    entitledHours,
    usedHours,
    pendingHours,
    remainingHours: entitledHours - usedHours - pendingHours,
    accrual,
    adjustmentHours,
  };
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

// 신청 검증: (1) 단위 유효, (2) 발생 범위 내(선사용 금지)
export function validateRequest(
  user: User,
  req: { date: string; hours: LeaveUnit },
  leaves: LeaveRequest[],
  adjustments: LeaveAdjustment[],
  policy: LeavePolicy
): ValidationResult {
  if (![2, 4, 6, 8].includes(req.hours)) {
    return { ok: false, reason: '사용 단위는 2/4/6/8시간만 가능합니다.' };
  }

  // 신청일(req.date) 시점 기준 발생분으로 판단 (제6조 5항: 미발생 연차 선사용 불가)
  const balAtDate = computeBalance(user, leaves, adjustments, policy, req.date);
  // 같은 날 신청은 아직 balance에 포함되지 않았으므로 remaining과 비교
  if (req.hours > balAtDate.remainingHours + 1e-6) {
    return {
      ok: false,
      reason: `해당 시점 사용 가능 연차(${balAtDate.remainingHours}h)를 초과합니다. (발생 ${balAtDate.entitledHours}h, 사용 ${balAtDate.usedHours}h, 대기 ${balAtDate.pendingHours}h)`,
    };
  }
  return { ok: true };
}

// 잔액 → "N일 M시간" 표기 (8h=1일)
export function hoursToDayLabel(hours: number, fullDay = 8): string {
  const neg = hours < 0;
  const abs = Math.abs(hours);
  const d = Math.floor(abs / fullDay);
  const h = abs % fullDay;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}일`);
  if (h > 0 || d === 0) parts.push(`${h}시간`);
  return (neg ? '-' : '') + parts.join(' ');
}

export const SEGMENT_LABELS: Record<string, string> = {
  FULL: '종일',
  AM: '오전(늦게 출근)',
  PM: '오후(일찍 퇴근)',
  CUSTOM: '직접 지정',
};

export const STATUS_LABELS: Record<string, string> = {
  REQUESTED: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '취소',
};
