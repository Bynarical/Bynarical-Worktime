import { Confirmation, AttendanceRecord, LeaveRequest } from './types';
import { weekStartKey, dateKey, addDaysKey } from './time';
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

// 서명이 필요한 "이미 지난 주" 목록(최근 것부터). 기록(또는 승인 연차)이 있는 주만 대상이며
// 이미 확인·서명한 주는 제외한다. maxWeeks 이전(너무 오래된 주)은 잔소리 방지를 위해 제외.
export function unsignedPastWeeks(
  records: AttendanceRecord[],
  leaves: LeaveRequest[],
  confirmations: Confirmation[],
  userId: string | null | undefined,
  todayStr: string = dateKey(),
  maxWeeks = 8
): string[] {
  if (!userId) return [];
  const thisWeekStart = weekStartKey(todayStr);
  const oldest = addDaysKey(thisWeekStart, -7 * maxWeeks); // 이 주 이전은 무시
  const weeks = new Set<string>();
  for (const r of records) {
    if (r.userId !== userId || !r.checkIn) continue;
    const ws = weekStartKey(r.date);
    if (ws < thisWeekStart && ws >= oldest) weeks.add(ws);
  }
  for (const l of leaves) {
    if (l.userId !== userId || l.status !== 'APPROVED') continue;
    const ws = weekStartKey(l.date);
    if (ws < thisWeekStart && ws >= oldest) weeks.add(ws);
  }
  const signed = new Set(confirmations.filter((c) => c.userId === userId).map((c) => c.weekStart));
  return [...weeks].filter((ws) => !signed.has(ws)).sort().reverse();
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
      // 구서명 해시 호환: 기존 값('ANNUAL'/'PAID')은 그대로 두고 UNPAID만 추가
      category: l.category === 'PAID' ? 'PAID' : l.category === 'UNPAID' ? 'UNPAID' : 'ANNUAL',
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
  c: Pick<Confirmation, 'userId' | 'weekStart' | 'weekEnd' | 'signature' | 'totalWorkedMinutes' | 'summaryHash' | 'confirmedAt'> & {
    authMethod?: Confirmation['authMethod'];
  }
): string {
  return sha256(
    // canonical()이 undefined 필드를 제외하므로, authMethod 없는 구버전 서명은 해시가 그대로 유지된다.
    canonical({
      userId: c.userId,
      weekStart: c.weekStart,
      weekEnd: c.weekEnd,
      signature: c.signature,
      authMethod: c.authMethod,
      totalWorkedMinutes: Math.round(c.totalWorkedMinutes || 0),
      summaryHash: c.summaryHash || '',
      confirmedAt: c.confirmedAt,
    })
  );
}

export type ConfVerdict = 'ok' | 'tampered' | 'unverifiable';

// 서명 검증: "서명 시점 그 주 내용의 다이제스트(summary_hash)"를 현재 기록으로 다시
// 계산해 대조한다. 다르면 서명 후 기록이 바뀐 것('tampered'). 스냅샷이 없는 구버전
// 서명은 'unverifiable'(검증 불가).
//
// ⚠ 행 자체 해시(conf.hash)는 검증에 쓰지 않는다: 거기에 들어가는 서명 시각 문자열이
// DB 왕복 때 포맷이 달라져(예: 서명 "....460Z" ↔ 조회 "....46+00:00") 재현되지 않아
// 모든 새 서명을 "변경됨"으로 오탐시켰다. conf.hash 는 화면 표시용 영수증 값으로만 보관.
export function verifyConfirmation(
  conf: Confirmation,
  records: AttendanceRecord[],
  leaves: LeaveRequest[]
): ConfVerdict {
  if (!conf.summaryHash) return 'unverifiable';
  return weekContentHash(records, leaves, conf.userId, conf.weekStart, conf.weekEnd) === conf.summaryHash
    ? 'ok'
    : 'tampered';
}
