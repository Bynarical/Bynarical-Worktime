// 근태 색 코딩 단일 출처 — 화면에서 t.success / t.trip 등을 직접 고르지 말고 여기 tone()을 쓴다.
// 규칙(lib/theme.ts 주석 참고):
//   근무 상태 = 초록(정상) / 빨강(이상) / 주황(대기·주의)
//   휴가      = 보라(연차) / 파랑(유급휴가) / 회색(무급휴가)  ← 초록 금지(정상 근무와 혼동)
//   출장      = 청록 + ✈ 아이콘
// 색약 대비를 위해 색 외에 마커 모양(●▲■□)도 함께 다르게 준다.
import type { Theme } from './theme';
import type { LeaveCategory } from './types';

export type MarkerShape = 'dot' | 'triangle' | 'square' | 'hollowSquare';

export type Tone =
  | 'normal' // 정상 근무
  | 'anomaly' // 지각·부족·코어위반·미기록·결근
  | 'pending' // 승인 대기·주의
  | 'annual' // 연차
  | 'paid' // 유급휴가
  | 'unpaid' // 무급휴가
  | 'trip' // 출장
  | 'holiday' // 공휴일·휴무일
  | 'neutral'; // 그 외(정보성)

export interface ToneStyle {
  color: string;
  soft: string;
  marker: MarkerShape;
  legend: string; // 범례 표기
}

export function tone(t: Theme, name: Tone): ToneStyle {
  switch (name) {
    case 'normal':
      return { color: t.success, soft: t.successSoft, marker: 'dot', legend: '정상 근무' };
    case 'anomaly':
      return { color: t.danger, soft: t.dangerSoft, marker: 'triangle', legend: '지각·부족·이상' };
    case 'pending':
      return { color: t.warning, soft: t.warningSoft, marker: 'dot', legend: '승인 대기' };
    case 'annual':
      return { color: t.leaveAnnual, soft: t.leaveAnnualSoft, marker: 'square', legend: '연차' };
    case 'paid':
      return { color: t.leavePaid, soft: t.leavePaidSoft, marker: 'square', legend: '유급휴가' };
    case 'unpaid':
      return { color: t.leaveUnpaid, soft: t.leaveUnpaidSoft, marker: 'hollowSquare', legend: '무급휴가' };
    case 'trip':
      return { color: t.trip, soft: t.tripSoft, marker: 'dot', legend: '출장' };
    case 'holiday':
      return { color: t.danger, soft: t.dangerSoft, marker: 'dot', legend: '공휴일·휴무일' };
    default:
      return { color: t.textDim, soft: t.cardAlt, marker: 'dot', legend: '기타' };
  }
}

export const LEAVE_TONE: Record<LeaveCategory, Tone> = { ANNUAL: 'annual', PAID: 'paid', UNPAID: 'unpaid' };

// 휴가 카테고리 → tone. 미지정(구 데이터)은 연차.
export function leaveTone(category?: LeaveCategory | null): Tone {
  return category ? LEAVE_TONE[category] ?? 'annual' : 'annual';
}

export function leaveStyle(t: Theme, category?: LeaveCategory | null): ToneStyle {
  return tone(t, leaveTone(category));
}

// computeDay()가 만든 한글 라벨 → tone (기존에 화면마다 흩어져 있던 정규식을 한 곳으로 모음)
export function labelTone(label: string): Tone {
  if (/부족|미충족|지각|미기록|결근|오류/.test(label)) return 'anomaly';
  if (/무급/.test(label)) return 'unpaid';
  if (/유급/.test(label)) return 'paid';
  if (/연차/.test(label)) return 'annual';
  if (/출장/.test(label)) return 'trip';
  return 'neutral';
}

export function labelColor(t: Theme, label: string): string {
  return tone(t, labelTone(label)).color;
}
