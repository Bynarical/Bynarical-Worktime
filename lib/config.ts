// 상수 / 기본값 (기존 앱 저장키·색상 호환 유지)
import { WorkPolicy, LeavePolicy, Workplace, Settings } from './types';

// 기존 백엔드(Google Apps Script) URL — 설정에서 새 URL로 교체 가능
export const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbx3zDx-9BqJy3XAk6dOJMDx0eIcRusewJQrgRa5i6Gee3LNaSDlgNrxTO1yZvYqPNmn/exec';

// AsyncStorage/localStorage 키 — 기존 데이터 호환을 위해 att_* 접두사 유지 + 신규 키 추가
export const STORAGE_KEYS = {
  USER: 'att_user',
  SETTINGS: 'att_settings',
  RECORDS: 'att_records',
  TRIP_MODE: 'att_trip_mode',
  SHEETS_URL: 'att_sheets_url',
  ADMIN_PASSWORD: 'att_admin_pw',
  CONFIRMATIONS: 'att_confirmations',
  // 신규
  LEAVES: 'att_leaves',
  LEAVE_ADJUSTMENTS: 'att_leave_adjustments',
  SYNC_QUEUE: 'att_sync_queue',
  PLANNED_START: 'att_planned_start',
  SESSION: 'att_session',
  HOLIDAYS: 'att_holidays',
  HOLIDAYS_SYNCED: 'att_holidays_synced_at',
  MEALS: 'att_meals',
  CONSENTS: 'att_consents',
  LEAVE_SEEN: 'att_leave_seen', // 직원이 연차 승인/반려 결과를 마지막으로 확인한 시각
} as const;

// 저녁식대 1일 한도(원)
export const MEAL_DAILY_LIMIT = 20000;

// 위치정보 수집·이용 동의
export const CONSENT_VERSION = 'v1';
export const CONSENT_TEXT =
  '본 앱은 출퇴근 확인을 위해 출근·퇴근 시점의 위치(좌표)를 수집·기록합니다. ' +
  '수집한 위치정보는 근태 관리 목적으로만 이용되며, 회사(관리자)에게 제공·보관됩니다. ' +
  '동의 시각·IP·기기 정보가 함께 기록됩니다. 위 내용에 동의합니다.';

// 색상 팔레트 (기존 앱과 동일 + 다크 대응 확장)
export const COLORS = {
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  success: '#16a34a',
  successLight: '#22c55e',
  danger: '#dc2626',
  dangerLight: '#ef4444',
  warning: '#f59e0b',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',
  white: '#ffffff',
  tripMode: '#7c3aed',
} as const;

// 기본 근무지 (기존 앱과 동일)
export const DEFAULT_WORKPLACES: Workplace[] = [
  {
    id: 'wp_default',
    name: '서울창업허브 엠플러스',
    lat: 37.5613474,
    lng: 126.8288372,
    radius: 150,
  },
];

// 근로계약서 제4조 반영 기본 근무 정책
export const DEFAULT_WORK_POLICY: WorkPolicy = {
  coreStart: '10:00',
  coreEnd: '16:00',
  latestClockIn: '10:00',
  earliestClockIn: '07:00',
  clockInStepMinutes: 30,
  dailyWorkMinutes: 480, // 8시간
  breakStart: '12:00',
  breakEnd: '13:00',
  breakMinutes: 60,
  workdays: [1, 2, 3, 4, 5], // 월~금
  timezoneOffsetMinutes: 540, // KST
};

// 근로계약서 제6조 반영 기본 연차 정책 (근로기준법 표준값)
export const DEFAULT_LEAVE_POLICY: LeavePolicy = {
  fullDayHours: 8,
  minUnitHours: 2,
  firstYearMonthlyGrantDays: 1, // 1개월 개근 시 1일
  firstYearMaxDays: 11,
  baseAnnualDays: 15,
  extraStartYear: 3,
  extraEveryYears: 2,
  maxAnnualDays: 25,
  carryoverEnabled: true,
};

export const DEFAULT_SETTINGS: Settings = {
  workplaces: DEFAULT_WORKPLACES,
  workPolicy: DEFAULT_WORK_POLICY,
  leavePolicy: DEFAULT_LEAVE_POLICY,
};

// 연차 사용 가능 단위(시간)
export const LEAVE_UNITS = [2, 4, 6, 8] as const;
