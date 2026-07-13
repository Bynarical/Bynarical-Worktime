// 연차 도메인 로직 — 반반차(2h 단위) + 근로기준법 기반 발생(근로계약서 제6조).
import { LeavePolicy, LeaveRequest, LeaveUnit, User, LeaveAdjustment, AttendanceRecord, WorkPolicy } from './types';
import { monthsSince, yearsSince, dateKey, addYearsKey, addDaysKey } from './time';
import { attendanceStat, perfectMonths } from './attendanceRate';

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

// 연차년도(버킷) — 입사일 기준으로 1년 단위 관리.
export interface LeaveYearBucket {
  key: string;
  label: string;
  index: number; // 0 = 1년차 월차, 1 = 2년차, 2 = 3년차 ...
  kind: 'monthly' | 'annual';
  start: string; // 사용 가능 시작일
  expiry: string; // 소멸일(이 날부터 사용 불가, exclusive)
  lastValidDate: string; // 마지막 사용 가능일(expiry - 1일)
  grantedHours: number; // asOf 기준 발생(부여) 시간
  usedHours: number; // 이 연차년도에 사용(승인)된 시간
  pendingHours: number; // 이 연차년도 대기중 시간
  remainingHours: number;
  status: 'future' | 'active' | 'expired';
  // 80% 출근율 판정 (연 단위 버킷만; 월차 버킷은 해당 없음)
  attendance?: {
    qualifyingStart: string; // 판정 대상 자격연도 시작
    qualifyingEnd: string; // 판정 대상 자격연도 종료(exclusive)
    scheduled: number; // 소정근로일수
    attended: number; // 출근 인정일수
    ratePct: number | null; // 출근율(%)
    meets80: boolean; // 80% 충족 여부(판정불가/데이터부족 시 true로 간주)
    judged: boolean; // 실제로 데이터로 판정했는지(false면 데이터 부족→충족 간주)
    downgraded: boolean; // 미달로 15일→월차(개근월)로 하향됐는지
    fullDays: number; // 충족 시 부여일수(15+가산)
  };
}

export interface LeaveBalance {
  entitledHours: number; // 현재 연차년도 발생 + 관리자 조정
  usedHours: number; // 현재 연차년도 사용(승인)
  pendingHours: number; // 현재 연차년도 대기
  remainingHours: number; // 잔여(현재 연차년도 + 조정)
  accrual: Accrual;
  adjustmentHours: number;
  buckets: LeaveYearBucket[]; // 시작된 모든 연차년도(활성 + 소멸)
  activeLabel?: string; // 현재 연차년도 라벨
}

function sumAdjustments(userId: string, adjustments: LeaveAdjustment[]): number {
  return adjustments.filter((a) => a.userId === userId).reduce((s, a) => s + a.hours, 0);
}

function annualGrantDays(yearsCompleted: number, policy: LeavePolicy): number {
  let extra = 0;
  if (yearsCompleted >= policy.extraStartYear) {
    extra = Math.floor((yearsCompleted - policy.extraStartYear) / policy.extraEveryYears) + 1;
  }
  return Math.min(policy.baseAnnualDays + extra, policy.maxAnnualDays);
}

// 80% 출근율 판정에 필요한 부가 데이터. 없으면 판정 없이 전원 충족(전액 발생)으로 처리(하위호환).
export interface LeaveContext {
  records?: AttendanceRecord[];
  workPolicy?: WorkPolicy;
  holidays?: Set<string>;
}

// 연차년도(버킷) 계산 — 1년차 월차(최대 11일, 입사 1주년 소멸) + 2년차부터 연 단위(개시일 발생, 다음 년도 개시일 소멸).
// 사용은 신청 날짜가 속한 연차년도 버킷에서만 차감된다(1년차 사용분이 2년차 연차를 깎지 않음).
// ctx가 주어지면 각 연 단위 버킷의 "자격연도"(직전 1년) 출근율 80%를 판정해 15일 발생 여부를 결정한다.
export function computeLeaveYears(
  user: User,
  leaves: LeaveRequest[],
  policy: LeavePolicy,
  asOf: string = dateKey(),
  ctx?: LeaveContext
): LeaveYearBucket[] {
  if (!user.hireDate) return [];
  const hire = user.hireDate;
  const full = policy.fullDayHours;
  const mine = leaves.filter((l) => l.userId === user.id);
  const canJudge = !!(ctx?.records && ctx?.workPolicy);

  const out: LeaveYearBucket[] = [];

  // 1년차 월차 버킷
  const y1Expiry = addYearsKey(hire, 1);
  {
    const status: LeaveYearBucket['status'] = asOf < hire ? 'future' : asOf < y1Expiry ? 'active' : 'expired';
    const months = monthsSince(hire, asOf);
    const grantedDays =
      status === 'future'
        ? 0
        : status === 'active'
        ? Math.min(months * policy.firstYearMonthlyGrantDays, policy.firstYearMaxDays)
        : policy.firstYearMaxDays; // 소멸 시엔 만기 발생분(최대 11일)
    out.push({
      key: 'monthly',
      label: `1년차 (월 발생 · 최대 ${policy.firstYearMaxDays}일)`,
      index: 0,
      kind: 'monthly',
      start: hire,
      expiry: y1Expiry,
      lastValidDate: addDaysKey(y1Expiry, -1),
      grantedHours: grantedDays * full,
      usedHours: 0,
      pendingHours: 0,
      remainingHours: 0,
      status,
    });
  }

  // 2년차 이후 연 단위 버킷 (개시일이 asOf 이전인 것만)
  const yrs = yearsSince(hire, asOf); // 완료 근속 연수
  for (let n = 1; n <= yrs; n++) {
    const start = addYearsKey(hire, n);
    const expiry = addYearsKey(hire, n + 1);
    const status: LeaveYearBucket['status'] = asOf < expiry ? 'active' : 'expired';
    const fullDays = annualGrantDays(n, policy);

    // 자격연도 = 직전 1년 [hire+(n-1), hire+n)
    const qStart = addYearsKey(hire, n - 1);
    const qEnd = start;
    let grantDays = fullDays;
    let attendance: LeaveYearBucket['attendance'];
    if (canJudge) {
      const st = attendanceStat(user.id, qStart, qEnd, ctx!.records!, leaves, ctx!.workPolicy!, ctx!.holidays ?? new Set());
      // 데이터 부족(출근 인정일 0 = 앱 미사용 추정) 또는 소정근로일 0 → 판정 불가 → 충족 간주(연차 보존)
      const judged = st.scheduled > 0 && st.attended > 0;
      const meets80 = !judged || (st.ratePct ?? 0) >= 80;
      const downgraded = judged && !meets80;
      if (downgraded) {
        grantDays = Math.min(perfectMonths(user.id, qStart, ctx!.records!, leaves, ctx!.workPolicy!, ctx!.holidays ?? new Set()), policy.firstYearMaxDays);
      }
      attendance = {
        qualifyingStart: qStart,
        qualifyingEnd: qEnd,
        scheduled: st.scheduled,
        attended: st.attended,
        ratePct: st.ratePct,
        meets80,
        judged,
        downgraded,
        fullDays,
      };
    }

    out.push({
      key: 'y' + n,
      label: `${n + 1}년차 (${grantDays}일${attendance?.downgraded ? ' · 80%미달' : ''})`,
      index: n,
      kind: 'annual',
      start,
      expiry,
      lastValidDate: addDaysKey(expiry, -1),
      grantedHours: grantDays * full,
      usedHours: 0,
      pendingHours: 0,
      remainingHours: 0,
      status,
      attendance,
    });
  }

  // 사용/대기 배분: 각 신청을 날짜가 속한 연차년도 버킷에 귀속
  const map: Record<string, LeaveYearBucket> = {};
  out.forEach((b) => (map[b.key] = b));
  for (const l of mine) {
    if (l.status !== 'APPROVED' && l.status !== 'REQUESTED') continue;
    if (l.category === 'PAID') continue; // 유급휴가는 연차 잔여에서 차감하지 않음
    if (l.date < hire) continue;
    const key = l.date < y1Expiry ? 'monthly' : 'y' + yearsSince(hire, l.date);
    const b = map[key];
    if (!b) continue; // 아직 시작 안 된(미래) 연차년도 → 현재 계산 대상 아님
    if (l.status === 'APPROVED') b.usedHours += l.hours;
    else b.pendingHours += l.hours;
  }
  out.forEach((b) => (b.remainingHours = b.grantedHours - b.usedHours - b.pendingHours));
  return out;
}

// 연차 잔액 — 현재 연차년도(활성 버킷) 기준 + 관리자 조정.
export function computeBalance(
  user: User,
  leaves: LeaveRequest[],
  adjustments: LeaveAdjustment[],
  policy: LeavePolicy,
  asOf: string = dateKey(),
  ctx?: LeaveContext
): LeaveBalance {
  const buckets = computeLeaveYears(user, leaves, policy, asOf, ctx);
  const active = buckets.find((b) => b.status === 'active') || null;
  const adjustmentHours = sumAdjustments(user.id, adjustments);
  const entitledHours = (active?.grantedHours ?? 0) + adjustmentHours;
  const usedHours = active?.usedHours ?? 0;
  const pendingHours = active?.pendingHours ?? 0;
  const remainingHours = entitledHours - usedHours - pendingHours;
  return {
    entitledHours,
    usedHours,
    pendingHours,
    remainingHours,
    accrual: accruedDays(user.hireDate, asOf, policy),
    adjustmentHours,
    buckets,
    activeLabel: active?.label,
  };
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

// 신청 검증: (1) 단위 유효, (2) 발생 범위 내(선사용 금지)
export function validateRequest(
  user: User,
  req: { date: string; hours: LeaveUnit; category?: 'ANNUAL' | 'PAID' },
  leaves: LeaveRequest[],
  adjustments: LeaveAdjustment[],
  policy: LeavePolicy,
  ctx?: LeaveContext
): ValidationResult {
  if (![2, 4, 6, 8].includes(req.hours)) {
    return { ok: false, reason: '사용 단위는 2/4/6/8시간만 가능합니다.' };
  }

  // 유급휴가(예비군·공가 등)는 연차를 차감하지 않으므로 잔여 검증을 하지 않는다.
  if (req.category === 'PAID') return { ok: true };

  // 신청일(req.date) 시점 기준 발생분으로 판단 (제6조 5항: 미발생 연차 선사용 불가)
  const balAtDate = computeBalance(user, leaves, adjustments, policy, req.date, ctx);
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
  AM: '오전',
  PM: '오후',
  CUSTOM: '직접 지정',
};

export const STATUS_LABELS: Record<string, string> = {
  REQUESTED: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '취소',
};
