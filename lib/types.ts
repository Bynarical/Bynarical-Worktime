// 도메인 타입 정의 (Bynarical Worktime)
// 근태 + 연차(반반차) + 코어타임 근무제

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number; // GPS 정확도(m)
}

export interface Workplace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // 인정 반경(m)
}

export interface User {
  id: string; // 사번 있으면 사번, 없으면 이름 기반 slug
  name: string;
  empNo?: string; // 사번(선택)
  hireDate?: string; // 입사일 YYYY-MM-DD (연차 산정)
  isAdmin?: boolean;
  createdAt: string; // ISO
  passwordHash?: string; // salt+반복 SHA-256 (평문 저장 안 함)
  salt?: string;
}

// ---- 근태 기록 ----
export type AttendanceType = 'WORK' | 'TRIP'; // 근무 / 출장

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName?: string;
  empNo?: string;
  date: string; // YYYY-MM-DD (KST 기준)
  plannedStart?: string; // 계획 출근시각 "HH:MM" (30분 단위)
  checkIn?: string; // 실제 출근 ISO
  checkOut?: string; // 실제 퇴근 ISO
  type: AttendanceType;
  workplaceId?: string;
  workplaceName?: string;
  inLocation?: GeoPoint;
  outLocation?: GeoPoint;
  inVerified?: boolean; // 출근 시 반경 내 여부
  outVerified?: boolean; // 퇴근 시 반경 내 여부
  pending?: boolean; // 근무지 밖 출근 → 관리자 승인 대기
  approvedBy?: string; // 승인한 관리자
  approvedAt?: string; // 승인 시각 ISO
  note?: string;
  updatedAt: string; // ISO
  prevHash?: string;
  hash?: string; // 무결성 해시 체인
}

// ---- 연차/휴가 ----
export type LeaveUnit = 2 | 4 | 6 | 8; // 사용 단위(시간): 반반차 2h ~ 종일 8h
export type LeaveSegment = 'FULL' | 'AM' | 'PM' | 'CUSTOM';
// 연차 카테고리: ANNUAL=연차(잔여 차감) / PAID=유급휴가(예비군·공가·경조사 등, 연차 미차감)
export type LeaveCategory = 'ANNUAL' | 'PAID';
export type LeaveStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELED';

export interface LeaveRequest {
  id: string;
  userId: string;
  userName?: string;
  empNo?: string;
  date: string; // YYYY-MM-DD
  hours: LeaveUnit; // 차감 시간(2/4/6/8)
  segment: LeaveSegment; // FULL=종일, AM=오전(늦게출근), PM=오후(일찍퇴근), CUSTOM=직접지정
  category?: LeaveCategory; // 미지정=ANNUAL(연차). PAID=유급휴가(연차 미차감)
  startTime?: string; // 휴가 구간 시작 "HH:MM"
  endTime?: string; // 휴가 구간 종료 "HH:MM"
  reason?: string;
  status: LeaveStatus;
  requestedAt: string; // ISO
  decidedAt?: string; // ISO
  decidedBy?: string;
  decisionNote?: string;
  prevHash?: string;
  hash?: string;
}

// ---- 주간 확인(전자서명) ----
export interface Confirmation {
  id: string;
  userId: string;
  userName?: string;
  weekStart: string; // 월요일 YYYY-MM-DD
  weekEnd: string; // 일요일 YYYY-MM-DD
  signature: string; // 서명(이름 타이핑 또는 데이터)
  totalWorkedMinutes: number;
  recordHashes: string[];
  summaryHash: string;
  confirmedAt: string; // ISO
  prevHash?: string;
  hash?: string;
}

// ---- 정책 ----
export interface WorkPolicy {
  coreStart: string; // 코어타임 시작 "10:00"
  coreEnd: string; // 코어타임 종료 "16:00"
  latestClockIn: string; // 최대 출근시각 "10:00"
  earliestClockIn: string; // 최소 출근시각 "07:00"
  clockInStepMinutes: number; // 출근 선택 단위(분) 30
  dailyWorkMinutes: number; // 1일 소정근로(분) 480
  breakStart: string; // 휴게 시작 "12:00"
  breakEnd: string; // 휴게 종료 "13:00"
  breakMinutes: number; // 휴게(분) 60
  workdays: number[]; // 근무요일 [1..5] (0=일)
  timezoneOffsetMinutes: number; // KST 540
}

export interface LeavePolicy {
  fullDayHours: number; // 종일 8시간
  minUnitHours: number; // 최소 단위 2시간
  firstYearMonthlyGrantDays: number; // 입사 1년 미만: 월 개근당 부여 일수(1)
  firstYearMaxDays: number; // 1년 미만 최대 부여(11)
  baseAnnualDays: number; // 1년 이상 기본 15일
  extraStartYear: number; // 가산 시작 근속연수(3)
  extraEveryYears: number; // 가산 주기(2년당 1일)
  maxAnnualDays: number; // 상한(25)
  carryoverEnabled: boolean; // 이월 허용
}

export interface Settings {
  workplaces: Workplace[];
  workPolicy: WorkPolicy;
  leavePolicy: LeavePolicy;
  sheetsUrl?: string; // 사용자가 설정한 Apps Script URL
}

// 관리자별 연차 수동 조정(가감) — userId -> hours
export interface LeaveAdjustment {
  userId: string;
  hours: number; // 양수=추가부여, 음수=차감
  note?: string;
  at: string;
}

// 공휴일/회사 휴무일 — 연차 80% 출근율 판정 시 소정근로일에서 제외
export interface Holiday {
  day: string; // YYYY-MM-DD
  name: string;
}

// 위치정보 수집·이용 동의 기록 (최초 출퇴근 전 필수)
export interface LocationConsent {
  userId: string;
  agreedAt: string;
  ip?: string;
  userAgent?: string;
  version?: string;
}

// 저녁식대(야근 대체 · 법인카드) 기록 — 하루 1건, 한도 MEAL_DAILY_LIMIT
export interface MealAllowance {
  id: string;
  userId: string;
  userName?: string;
  date: string; // YYYY-MM-DD
  amount: number; // 원(KRW)
  note?: string; // 가맹점/메뉴 등
  createdAt?: string;
}

// 관리자가 기록하는 무단이탈(무단 이석) — 근태 점수 감점
export interface AwayLog {
  id: string;
  userId: string;
  userName?: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // 'HH:MM'
  endTime?: string; // 'HH:MM'
  minutes: number; // 자리 비운 시간(분)
  note?: string;
  createdBy?: string;
  createdAt?: string;
}
