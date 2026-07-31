import { Confirmation, AttendanceRecord, LeaveRequest } from './types';
import { weekStartKey, dateKey } from './time';
import { sha256, canonical } from './hash';

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

// ── 변조 감지(해시검증) ──────────────────────────────────────────
// 서명 시점의 "그 주 내용"을 한 개의 다이제스트로 요약한다. 서명할 때 저장해 두고,
// 나중에 읽을 때 현재 기록으로 다시 계산해 대조한다. 값이 다르면 서명 후 누군가
// (백엔드 직접 편집 포함) 기록을 바꿨다는 뜻. 타임스탬프는 DB 왕복 시 문자열 포맷이
// 달라질 수 있어 epoch(ms)로 정규화해 오탐을 막는다.
export function weekContentHash(
  records: AttendanceRecord[],
  leaves: LeaveRequest[],
  userId: string,
  weekStart: string,
  weekEnd: string
): string {
  const recs = records
    .filter((r) => r.userId === userId && r.date >= weekStart && r.date <= weekEnd)
    .map((r) => ({
      date: r.date,
      type: r.type || 'WORK',
      in: r.checkIn ? Date.parse(r.checkIn) : 0,
      out: r.checkOut ? Date.parse(r.checkOut) : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const lvs = leaves
    .filter((l) => l.userId === userId && l.status === 'APPROVED' && l.date >= weekStart && l.date <= weekEnd)
    .map((l) => ({
      date: l.date,
      segment: l.segment,
      hours: l.hours,
      category: l.category === 'PAID' ? 'PAID' : 'ANNUAL',
      s: l.startTime || '',
      e: l.endTime || '',
    }))
    .sort((a, b) => {
      const ka = a.date + a.segment + a.s;
      const kb = b.date + b.segment + b.s;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  return sha256(JSON.stringify({ recs, lvs }));
}

// 확인(서명) 행 자체의 무결성 해시. 저장되는 필드만으로 계산 → 읽을 때 재현 가능.
export function confIntegrityHash(
  c: Pick<Confirmation, 'userId' | 'weekStart' | 'weekEnd' | 'signature' | 'totalWorkedMinutes' | 'summaryHash' | 'confirmedAt'>
): string {
  return sha256(
    canonical({
      userId: c.userId,
      weekStart: c.weekStart,
      weekEnd: c.weekEnd,
      signature: c.signature,
      totalWorkedMinutes: Math.round(c.totalWorkedMinutes || 0),
      summaryHash: c.summaryHash || '',
      confirmedAt: c.confirmedAt,
    })
  );
}

export type ConfVerdict = 'ok' | 'tampered' | 'unverifiable';

// 서명 검증: 행 자체가 변조됐거나(요약해시·행해시 불일치), 서명 후 그 주 기록이
// 바뀌었으면 'tampered'. 스냅샷이 없는 구버전 서명은 'unverifiable'(검증 불가).
export function verifyConfirmation(
  conf: Confirmation,
  records: AttendanceRecord[],
  leaves: LeaveRequest[]
): ConfVerdict {
  if (!conf.summaryHash || !conf.hash) return 'unverifiable';
  if (confIntegrityHash(conf) !== conf.hash) return 'tampered';
  if (weekContentHash(records, leaves, conf.userId, conf.weekStart, conf.weekEnd) !== conf.summaryHash) return 'tampered';
  return 'ok';
}
