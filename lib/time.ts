// 시간/날짜 유틸 — 모든 날짜는 KST(UTC+9) 기준으로 처리한다.
const KST_OFFSET_MIN = 540;

// 현재 시각(UTC epoch ms). Date.now() 대신 new Date().getTime() 사용 가능하나 통일.
export function nowMs(): number {
  return new Date().getTime();
}

// 주어진 offset(분) 기준의 "지역시각" Date 객체(내부 UTC 필드에 지역시각을 담음).
function shifted(ms: number, offsetMin: number): Date {
  return new Date(ms + offsetMin * 60000);
}

// KST 기준 날짜키 YYYY-MM-DD
export function dateKey(ms: number = nowMs(), offsetMin: number = KST_OFFSET_MIN): string {
  const d = shifted(ms, offsetMin);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// KST 기준 "HH:MM"
export function timeHM(ms: number = nowMs(), offsetMin: number = KST_OFFSET_MIN): string {
  const d = shifted(ms, offsetMin);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${mi}`;
}

// KST 기준 자정 이후 경과 분
export function minutesOfDay(ms: number, offsetMin: number = KST_OFFSET_MIN): number {
  const d = shifted(ms, offsetMin);
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
}

// "HH:MM" -> 분
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

// 분 -> "HH:MM"
export function minutesToHM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// 분 -> "N시간 M분"
export function minutesToKor(min: number): string {
  const neg = min < 0;
  const total = Math.round(Math.abs(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}시간`);
  if (m > 0 || h === 0) parts.push(`${m}분`);
  return (neg ? '-' : '') + parts.join(' ');
}

// KST 기준 요일 (0=일 .. 6=토)
export function weekday(ms: number, offsetMin: number = KST_OFFSET_MIN): number {
  return shifted(ms, offsetMin).getUTCDay();
}

// date 문자열(YYYY-MM-DD)을 KST 자정의 UTC epoch ms로
export function dateKeyToMs(dateStr: string, offsetMin: number = KST_OFFSET_MIN): number {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  return Date.UTC(y, m - 1, d) - offsetMin * 60000;
}

// 두 날짜키 사이의 일수 (b - a)
export function daysBetween(a: string, b: string): number {
  return Math.round((dateKeyToMs(b) - dateKeyToMs(a)) / 86400000);
}

// 날짜키에 일수 더하기
export function addDaysKey(dateStr: string, days: number): string {
  return dateKey(dateKeyToMs(dateStr) + days * 86400000);
}

// 해당 날짜가 속한 주의 월요일 날짜키
export function weekStartKey(dateStr: string): string {
  const wd = weekday(dateKeyToMs(dateStr)); // 0=일
  const back = wd === 0 ? 6 : wd - 1; // 월요일까지
  return addDaysKey(dateStr, -back);
}

// 근속 개월/연수 (hireDate ~ asOf)
export function monthsSince(hireDate: string, asOf: string): number {
  const [hy, hm, hd] = hireDate.split('-').map(Number);
  const [ay, am, ad] = asOf.split('-').map(Number);
  let months = (ay - hy) * 12 + (am - hm);
  if (ad < hd) months -= 1;
  return Math.max(0, months);
}

export function yearsSince(hireDate: string, asOf: string): number {
  return Math.floor(monthsSince(hireDate, asOf) / 12);
}

// 30분 등 단위로 반올림/내림된 시각 후보 목록 생성 ("HH:MM")
export function timeSlots(startHM: string, endHM: string, stepMin: number): string[] {
  const out: string[] = [];
  for (let t = hmToMinutes(startHM); t <= hmToMinutes(endHM); t += stepMin) {
    out.push(minutesToHM(t));
  }
  return out;
}

// "HH:MM" 이 step(예:30분) 단위인지
export function isOnStep(hm: string, stepMin: number): boolean {
  return hmToMinutes(hm) % stepMin === 0;
}

export const TZ = { KST_OFFSET_MIN };
