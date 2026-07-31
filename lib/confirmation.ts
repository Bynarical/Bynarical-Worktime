import { Confirmation } from './types';
import { weekStartKey, dateKey } from './time';

// 해당 (userId, date)가 확인·서명된 주간에 속하면 그 확인 레코드를 반환.
// week_start/week_end 는 'YYYY-MM-DD' 문자열이라 사전식 비교로 안전하게 범위 판정.
export function confirmationCovering(
  confirmations: Confirmation[],
  userId: string | null | undefined,
  dateStr: string
): Confirmation | undefined {
  if (!userId) return undefined;
  return confirmations.find(
    (c) => c.userId === userId && c.weekStart <= dateStr && dateStr <= c.weekEnd
  );
}

// 주(월요일 키)가 "확인·서명 가능"한 상태인지: 이미 완전히 지난 주만 가능.
// 이번 주(진행 중)·미래 주는 불가.
export function weekSignState(
  weekStart: string,
  todayStr: string = dateKey()
): 'past' | 'current' | 'future' {
  const thisWeekStart = weekStartKey(todayStr);
  if (weekStart < thisWeekStart) return 'past';
  if (weekStart === thisWeekStart) return 'current';
  return 'future';
}
