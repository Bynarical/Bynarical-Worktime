// 위치 유틸: 거리 계산, 근무지 반경 판정, 좌표/구글맵 링크 파싱
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { GeoPoint, Workplace } from './types';
import { supabase } from './supabase';

// Haversine 거리(m)
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface NearestResult {
  workplace: Workplace | null;
  distance: number;
  within: boolean;
}

// 가장 가까운 근무지와 반경 내 여부
export function nearestWorkplace(point: GeoPoint, workplaces: Workplace[]): NearestResult {
  let best: NearestResult = { workplace: null, distance: Infinity, within: false };
  for (const wp of workplaces) {
    const d = distanceMeters(point, { lat: wp.lat, lng: wp.lng });
    if (d < best.distance) {
      best = { workplace: wp, distance: d, within: d <= wp.radius };
    }
  }
  return best;
}

// 현재 위치 획득 (권한 요청 포함). 실패 시 null.
export async function getCurrentPoint(): Promise<GeoPoint | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? undefined,
    };
  } catch {
    return null;
  }
}

// ---- 출퇴근용 정확한 위치 ----
// 근사 위치(iOS '정확한 위치' 끔 · Android '대략적인 위치' · 브라우저 근사 위치)는 오차가 수 km라
// 반경 판정에 쓰지 않는다. 실내에서 정확한 위치는 보통 오차 10~65m.
export const PRECISE_MAX_ACCURACY_M = 100;
const GOOD_ACCURACY_M = 20; // 이만큼 정확하면 더 기다리지 않는다
const FIX_WINDOW_MS = 8000; // 첫 위치 이후 더 정확한 위치를 기다리는 시간
const FIX_TIMEOUT_MS = 20000; // 위치를 하나도 못 받으면 포기
const STALE_MS = 10000; // 이보다 오래된(캐시된) 위치는 버린다

export type PreciseFix =
  | { ok: true; point: GeoPoint }
  // approximate: 근사 위치 권한이거나 오차가 PRECISE_MAX_ACCURACY_M 초과. point는 받은 것 중 가장 정확한 위치.
  | { ok: false; reason: 'denied' | 'approximate' | 'unavailable'; point?: GeoPoint };

type Watcher = (onFix: (p: GeoPoint, timestamp: number) => void, onDenied: () => void) => Promise<() => void>;

// 웹은 navigator.geolocation을 직접 쓴다 — expo-location 웹 구현은 getCurrentPosition에
// maximumAge: Infinity(오래된 캐시 위치 허용)를 주고, watchPosition엔 enableHighAccuracy를 넘기지 않는다.
const webWatch: Watcher = async (onFix, onDenied) => {
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  if (!geo) throw new Error('geolocation unavailable');
  const id = geo.watchPosition(
    (pos) => onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }, pos.timestamp),
    (err) => {
      if (err.code === err.PERMISSION_DENIED) onDenied();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: FIX_TIMEOUT_MS }
  );
  return () => geo.clearWatch(id);
};

const nativeWatch: Watcher = async (onFix) => {
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 0 },
    (loc) =>
      onFix({ lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined }, loc.timestamp)
  );
  return () => sub.remove();
};

// 몇 초간 위치를 받아 가장 정확한 것을 고른다. 첫 위치는 캐시·Wi-Fi 추정이라 부정확한 경우가 많다.
function bestFix(watch: Watcher): Promise<GeoPoint | 'denied' | null> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let best: GeoPoint | null = null;
    let stop: (() => void) | null = null;
    let done = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (r: GeoPoint | 'denied' | null) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      stop?.();
      resolve(r);
    };
    const acc = (p: GeoPoint | null) => p?.accuracy ?? Infinity;
    timers.push(setTimeout(() => finish(best), FIX_TIMEOUT_MS));
    watch(
      (p, timestamp) => {
        if (done || timestamp < startedAt - STALE_MS) return;
        if (!best) timers.push(setTimeout(() => finish(best), FIX_WINDOW_MS));
        if (!best || acc(p) < acc(best)) best = p;
        if (acc(best) <= GOOD_ACCURACY_M) finish(best);
      },
      () => finish('denied')
    )
      .then((s) => {
        stop = s;
        if (done) s();
      })
      .catch(() => finish(best));
  });
}

// 출퇴근 반경 판정용 위치. 정확한 위치가 아니면 ok: false.
export async function getPreciseFix(): Promise<PreciseFix> {
  try {
    let approximateGrant = false;
    if (Platform.OS !== 'web') {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return { ok: false, reason: 'denied' };
      approximateGrant = perm.android?.accuracy === 'coarse' || perm.ios?.accuracy === 'reduced';
    }
    const r = await bestFix(Platform.OS === 'web' ? webWatch : nativeWatch);
    if (r === 'denied') return { ok: false, reason: 'denied' };
    if (!r) return { ok: false, reason: 'unavailable' };
    if (approximateGrant || (r.accuracy ?? Infinity) > PRECISE_MAX_ACCURACY_M) return { ok: false, reason: 'approximate', point: r };
    return { ok: true, point: r };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

const N ='(-?\\d{1,3}\\.\\d+)';
const SEP = '(?:,|%2C)\\+?\\s*'; // 콤마(또는 %2C) + 선택적 '+' 또는 공백 (구글맵 /search/lat,+lng 대응)
// 우선순위 순: 정확한 place 좌표(!3d!4d) → 지도중심(@) → search/place/dir 경로 → 쿼리파라미터 → 순수 쌍
const COORD_PATTERNS = [
  new RegExp(`!3d${N}!4d${N}`),
  new RegExp(`@${N}${SEP}${N}`),
  new RegExp(`/(?:search|place|dir)/${N}${SEP}${N}`),
  new RegExp(`[?&]q=loc:${N}${SEP}${N}`),
  new RegExp(`[?&](?:q|ll|center|destination|daddr|saddr|sll)=${N}${SEP}${N}`),
  new RegExp(`${N}${SEP}${N}`),
];

// "위도,경도" 또는 구글맵 링크(좌표 포함)에서 좌표 추출. 단축링크(maps.app.goo.gl)는 좌표가 없어 resolveMapLink 사용.
export function parseCoords(input: string): GeoPoint | null {
  if (!input) return null;
  const s = input.trim();
  for (const re of COORD_PATTERNS) {
    const m = s.match(re);
    if (!m) continue;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    return { lat, lng };
  }
  return null;
}

// 좌표가 링크에 없으면(구글맵 앱 단축링크 등) 서버(Edge Function)에서 리다이렉트를 따라가 좌표를 추출한다.
// 웹은 CORS로 클라이언트가 직접 못 따라가므로 서버 프록시가 필요.
export function looksLikeMapLink(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}
export async function resolveMapLink(url: string): Promise<GeoPoint | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('resolve-maplink', { body: { url: url.trim() } });
    if (error || !data || (data as { ok?: boolean }).ok === false) return null;
    const d = data as { lat?: number; lng?: number };
    if (typeof d.lat === 'number' && typeof d.lng === 'number') return { lat: d.lat, lng: d.lng };
    return null;
  } catch {
    return null;
  }
}
