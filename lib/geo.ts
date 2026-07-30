// 위치 유틸: 거리 계산, 근무지 반경 판정, 좌표/구글맵 링크 파싱
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

const N = '(-?\\d{1,3}\\.\\d+)';
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
