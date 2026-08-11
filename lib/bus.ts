// 버스 통근 도우미 — 근처 정류소 + 실시간 도착정보.
// 서버(Edge Function `bus-info`)가 TAGO 버스 API를 대신 호출한다(서비스키 비노출).
//   · 근처 정류소: 좌표 기반 조회 → 거의 안 바뀌므로 좌표 격자 단위로 캐시
//   · 도착정보: 실시간이라 캐시는 아주 짧게(중복 호출 방지용)만 두고 항상 다시 받는다
// ⚠ TAGO 버스에는 서울특별시가 없다 → 서울 정류소는 조회되지 않는다(추후 TOPIS 연동).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getItem, setItem } from './storage';
import { STORAGE_KEYS } from './config';
import { GeoPoint } from './types';

export interface BusStop {
  nodeId: string;
  cityCode: number;
  name: string;
  no?: string;
  lat: number;
  lng: number;
  distance?: number; // m (조회 지점 기준)
}

export interface BusArrival {
  routeId: string;
  routeNo: string; // 노선번호 ("99", "88B", "1001")
  routeType: string; // 일반버스 / 직행좌석버스 …
  vehicleType: string; // 저상버스 / 일반차량
  prevStops: number; // 남은 정류소 수
  etaSec: number; // 도착예정(초)
}

interface CacheEnvelope<T> {
  at: number;
  data: T;
}

const STOPS_TTL = 7 * 24 * 60 * 60 * 1000; // 정류소 목록 7일
const ARRIVALS_TTL = 20 * 1000; // 도착정보 20초(연속 렌더 시 중복 호출만 억제)

// 좌표를 소수 3자리(약 100m) 격자로 → 캐시 키
const gridKey = (p: GeoPoint) => `${p.lat.toFixed(3)}_${p.lng.toFixed(3)}`;

export interface StopsResult {
  ok: boolean;
  stops?: BusStop[];
  cached?: boolean;
  at?: number;
  error?: string;
}

export async function fetchNearbyStops(point: GeoPoint, opts: { force?: boolean } = {}): Promise<StopsResult> {
  const cacheKey = `${STORAGE_KEYS.BUS_STOPS}_${gridKey(point)}`;
  const cached = await getItem<CacheEnvelope<BusStop[]>>(cacheKey);
  const fresh = cached && cached.data?.length && new Date().getTime() - cached.at < STOPS_TTL;
  if (fresh && !opts.force) return { ok: true, stops: cached!.data, cached: true, at: cached!.at };

  if (!supabase) {
    if (cached?.data?.length) return { ok: true, stops: cached.data, cached: true, at: cached.at };
    return { ok: false, error: '백엔드가 설정되지 않아 정류소를 가져올 수 없습니다.' };
  }
  const { data, error } = await supabase.functions.invoke('bus-info', {
    body: { action: 'stops', lat: point.lat, lng: point.lng },
  });
  if (error || !data || (data as any).ok === false) {
    if (cached?.data?.length) return { ok: true, stops: cached.data, cached: true, at: cached.at };
    return { ok: false, error: (data as any)?.error || '근처 정류소를 불러오지 못했습니다.' };
  }
  const stops = ((data as any).stops || []) as BusStop[];
  if (!stops.length) {
    // 서울 등 미제공 지역이면 빈 결과가 정상 — 빈 값은 캐시하지 않는다
    return { ok: true, stops: [], at: new Date().getTime() };
  }
  const at = new Date().getTime();
  await setItem(cacheKey, { at, data: stops } as CacheEnvelope<BusStop[]>);
  return { ok: true, stops, at };
}

export interface ArrivalsResult {
  ok: boolean;
  arrivals?: BusArrival[];
  at?: number;
  error?: string;
}

export async function fetchArrivals(stop: BusStop, opts: { force?: boolean } = {}): Promise<ArrivalsResult> {
  const cacheKey = `att_bus_arr_${stop.nodeId}`;
  const cached = await getItem<CacheEnvelope<BusArrival[]>>(cacheKey);
  if (cached && !opts.force && new Date().getTime() - cached.at < ARRIVALS_TTL) {
    return { ok: true, arrivals: cached.data, at: cached.at };
  }
  if (!supabase) return { ok: false, error: '백엔드가 설정되지 않았습니다.' };
  const { data, error } = await supabase.functions.invoke('bus-info', {
    body: { action: 'arrivals', cityCode: stop.cityCode, nodeId: stop.nodeId },
  });
  if (error || !data || (data as any).ok === false) {
    return { ok: false, error: (data as any)?.error || '도착정보를 불러오지 못했습니다.' };
  }
  const arrivals = ((data as any).arrivals || []) as BusArrival[];
  const at = new Date().getTime();
  await setItem(cacheKey, { at, data: arrivals } as CacheEnvelope<BusArrival[]>);
  return { ok: true, arrivals, at };
}

// 도착예정(초) → "3분" / "곧 도착"
export function etaLabel(sec: number): string {
  if (!sec || sec <= 60) return '곧 도착';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

// 노선유형 짧은 표기(칩에 쓰기 좋게)
export function routeTypeShort(t: string): string {
  if (!t) return '';
  if (t.includes('직행좌석')) return '직좌';
  if (t.includes('좌석')) return '좌석';
  if (t.includes('마을')) return '마을';
  if (t.includes('간선')) return '간선';
  if (t.includes('지선')) return '지선';
  if (t.includes('광역')) return '광역';
  if (t.includes('공항')) return '공항';
  if (t.includes('일반')) return '일반';
  return t.replace(/버스$/, '');
}

// ---- 즐겨찾기(기기 로컬) ----
export function useBusFavorites() {
  const [favorites, setFavorites] = useState<BusStop[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      const f = await getItem<BusStop[]>(STORAGE_KEYS.BUS_FAV);
      if (Array.isArray(f)) setFavorites(f);
      setLoaded(true);
    })();
  }, []);
  const isFavorite = useCallback((nodeId: string) => favorites.some((f) => f.nodeId === nodeId), [favorites]);
  const addFavorite = useCallback((s: BusStop) => {
    // distance는 조회 지점에 따라 달라지므로 저장하지 않는다
    const clean: BusStop = { nodeId: s.nodeId, cityCode: s.cityCode, name: s.name, no: s.no, lat: s.lat, lng: s.lng };
    setFavorites((prev) => {
      if (prev.some((p) => p.nodeId === clean.nodeId)) return prev;
      const next = [...prev, clean];
      setItem(STORAGE_KEYS.BUS_FAV, next);
      return next;
    });
  }, []);
  const removeFavorite = useCallback((nodeId: string) => {
    setFavorites((prev) => {
      const next = prev.filter((p) => p.nodeId !== nodeId);
      setItem(STORAGE_KEYS.BUS_FAV, next);
      return next;
    });
  }, []);
  const toggleFavorite = useCallback(
    (s: BusStop) => {
      if (favorites.some((p) => p.nodeId === s.nodeId)) removeFavorite(s.nodeId);
      else addFavorite(s);
    },
    [favorites, addFavorite, removeFavorite]
  );
  return { favorites, loaded, isFavorite, addFavorite, removeFavorite, toggleFavorite };
}
