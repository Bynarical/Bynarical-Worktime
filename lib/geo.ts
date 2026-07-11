// 위치 유틸: 거리 계산, 근무지 반경 판정, 좌표/구글맵 링크 파싱
import * as Location from 'expo-location';
import { GeoPoint, Workplace } from './types';

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

// "위도,경도" 또는 구글맵 링크에서 좌표 추출
export function parseCoords(input: string): GeoPoint | null {
  if (!input) return null;
  const s = input.trim();

  // 1) "37.56, 126.82"
  const pair = s.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  // 2) 구글맵 @lat,lng
  const at = s.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  // 3) ?q=lat,lng 또는 !3dlat!4dlng
  const q = s.match(/[?&]q=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  const d3d4 = s.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);

  const m = at || q || d3d4 || pair;
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
