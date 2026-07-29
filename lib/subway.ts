// 지하철 통근 도메인 로직
// - 번들된 전국 역 좌표(assets/subway/stations.json)로 근처 역 탐색(오프라인 OK)
// - 시간표는 Supabase Edge Function(subway-timetable → TAGO)로 조회 후 로컬 캐시
// - 집(출발지)은 각자 기기에 로컬 저장(개인 정보, 서버 미동기화)
import { useCallback, useEffect, useState } from 'react';
import stationsData from '@/assets/subway/stations.json';
import { GeoPoint } from './types';
import { distanceMeters } from './geo';
import { supabase } from './supabase';
import { getItem, setItem, removeItem } from './storage';
import { STORAGE_KEYS, SUBWAY_CACHE_TTL } from './config';
import { weekday, hmToMinutes } from './time';

export interface SubwayStation {
  id: string; // 내부 키 "도시:역명"
  name: string;
  city: string;
  lines: string[];
  lat: number;
  lng: number;
}

// 번들 데이터. 대용량 리터럴 타입 추론을 피하려 unknown 경유로 캐스팅.
export const STATIONS = stationsData as unknown as SubwayStation[];

export interface NearbyStation extends SubwayStation {
  distance: number; // m
}

// 지점에서 가까운 역들(가까운 순). maxMeters 이내가 있으면 그 안에서, 없으면 그냥 최근접 몇 개.
export function nearbyStations(point: GeoPoint, k = 5, maxMeters = 2500): NearbyStation[] {
  const withDist = STATIONS.map((s) => ({ ...s, distance: distanceMeters(point, { lat: s.lat, lng: s.lng }) }));
  withDist.sort((a, b) => a.distance - b.distance);
  const within = withDist.filter((s) => s.distance <= maxMeters).slice(0, k);
  return within.length ? within : withDist.slice(0, Math.min(k, 3));
}

// ---- 시간표 ----
export type DailyType = '01' | '02' | '03'; // 평일 / 토 / 일·공휴일
export interface Train {
  time: string; // "HH:MM"
  dir: 'U' | 'D'; // 상행 / 하행
  daily: DailyType;
  dest: string; // 종착역
  route: string; // 노선명
}

export function dailyTypeForDate(ms: number = new Date().getTime()): DailyType {
  const wd = weekday(ms); // 0=일 .. 6=토 (KST)
  if (wd === 0) return '03';
  if (wd === 6) return '02';
  return '01';
}

export const DAILY_LABEL: Record<DailyType, string> = { '01': '평일', '02': '토요일', '03': '일요일·공휴일' };
export const DIR_LABEL: Record<'U' | 'D', string> = { U: '상행', D: '하행' };

const normName = (s: string) => s.replace(/\s+/g, '').replace(/역$/, '');

interface CacheEnvelope<T> {
  at: number;
  data: T;
}

// 역명 → TAGO 역ID 목록 조회(캐시). 한 역이 여러 노선이면 여러 ID가 나올 수 있다.
async function resolveStationIds(
  station: SubwayStation,
  force = false
): Promise<{ id: string; name: string; route: string }[]> {
  const key = normName(station.name);
  const cache = (await getItem<Record<string, { id: string; name: string; route: string }[]>>(STORAGE_KEYS.SUBWAY_IDS)) || {};
  // 비어있지 않은 캐시만 사용한다. 과거 검색 실패로 빈 배열([])이 캐시된 경우 []도 truthy라
  // 옛 코드는 영구히 빈 결과를 돌려줬다 → 길이를 확인해 무시하고 재조회한다.
  if (!force && cache[key] && cache[key].length > 0) return cache[key];
  if (!supabase) return cache[key] || [];
  const { data, error } = await supabase.functions.invoke('subway-timetable', { body: { action: 'search', name: station.name } });
  if (error || !data || (data as any).ok === false) return cache[key] || [];
  const stations = ((data as any).stations || []) as { id: string; name: string; route: string }[];
  // 같은 이름의 다른 도시 역이 섞일 수 있어, 도시가 있으면 이름 정확일치 우선
  const filtered = stations.filter((s) => normName(s.name || '') === key);
  const result = (filtered.length ? filtered : stations).slice(0, 6);
  // 빈 결과는 캐시하지 않는다(일시적 실패가 영구 캐시되는 것 방지).
  if (result.length > 0) {
    cache[key] = result;
    await setItem(STORAGE_KEYS.SUBWAY_IDS, cache);
  }
  return result;
}

export interface TimetableResult {
  ok: boolean;
  trains?: Train[];
  cached?: boolean;
  at?: number; // 시간표를 조회(또는 캐시)한 시각(ms). 신선도 표시·자동갱신 판단용.
  error?: string;
}

// 역 시간표(요일별, 상·하행 모두). 성공 시 캐시. 오프라인/오류 시 캐시로 폴백.
// opts.force=true 면 캐시가 신선해도 서버에서 다시 받아 캐시를 갱신한다(수동 새로고침).
export async function fetchTimetable(
  station: SubwayStation,
  daily: DailyType,
  opts: { force?: boolean } = {}
): Promise<TimetableResult> {
  const cacheKey = `${STORAGE_KEYS.SUBWAY_SCHED}_${station.id}_${daily}`;
  const cached = await getItem<CacheEnvelope<Train[]>>(cacheKey);
  const fresh = cached && new Date().getTime() - cached.at < SUBWAY_CACHE_TTL;
  if (fresh && !opts.force) return { ok: true, trains: cached!.data, cached: true, at: cached!.at };

  if (!supabase) {
    if (cached) return { ok: true, trains: cached.data, cached: true, at: cached.at };
    return { ok: false, error: '백엔드가 설정되지 않아 시간표를 가져올 수 없습니다.' };
  }

  const ids = await resolveStationIds(station, opts.force);
  if (!ids.length) {
    if (cached) return { ok: true, trains: cached.data, cached: true, at: cached.at };
    return { ok: false, error: '해당 역의 시간표 정보를 찾을 수 없습니다. (지방 노선은 미제공일 수 있음)' };
  }

  const all: Train[] = [];
  let anyError = '';
  for (const s of ids) {
    const { data, error } = await supabase.functions.invoke('subway-timetable', {
      body: { action: 'schedule', stationId: s.id, daily },
    });
    if (error) { anyError = '시간표 함수를 호출하지 못했습니다. (Edge Function 배포 확인)'; continue; }
    if (data && (data as any).ok === false) { anyError = (data as any).error || '시간표 조회 실패'; continue; }
    const trains = ((data as any).trains || []) as Train[];
    all.push(...trains.map((tr) => ({ ...tr, route: tr.route || s.route })));
  }

  if (!all.length) {
    if (cached) return { ok: true, trains: cached.data, cached: true, at: cached.at };
    return { ok: false, error: anyError || '시간표가 비어 있습니다.' };
  }

  // 시간·방향·종착 기준 중복 제거 후 정렬
  const seen = new Set<string>();
  const dedup = all.filter((tr) => {
    const k = `${tr.dir}|${tr.time}|${tr.dest}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  dedup.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  const at = new Date().getTime();
  await setItem(cacheKey, { at, data: dedup } as CacheEnvelope<Train[]>);
  return { ok: true, trains: dedup, at };
}

// ---- 조회 도우미 ----
export function trainsOfDir(trains: Train[], dir: 'U' | 'D'): Train[] {
  return trains.filter((t) => t.dir === dir);
}
export function firstTrain(trains: Train[]): Train | undefined {
  return trains[0];
}
export function lastTrain(trains: Train[]): Train | undefined {
  return trains.length ? trains[trains.length - 1] : undefined;
}
// 기준 시각(HH:MM) 이후 다가오는 열차 N대
export function nextTrainsAfter(trains: Train[], fromHM: string, count = 5): Train[] {
  const from = hmToMinutes(fromHM);
  return trains.filter((t) => hmToMinutes(t.time) >= from).slice(0, count);
}
// 기준 시각(HH:MM) 이전 마지막 열차 N대 (출근: 도착 목표 전 출발편)
export function trainsBefore(trains: Train[], beforeHM: string, count = 5): Train[] {
  const to = hmToMinutes(beforeHM);
  return trains.filter((t) => hmToMinutes(t.time) <= to).slice(-count);
}
// 기준 시각 이후 가장 가까운 열차 1대 (방향 무관) — 즐겨찾기 요약용
export function nextTrainAfterAny(trains: Train[], fromHM: string): Train | undefined {
  const from = hmToMinutes(fromHM);
  let best: Train | undefined;
  for (const t of trains) {
    if (hmToMinutes(t.time) < from) continue;
    if (!best || hmToMinutes(t.time) < hmToMinutes(best.time)) best = t;
  }
  return best;
}
// 열차 목록에 존재하는 노선(route) 목록 — 처음 나온 순서 유지. 환승역이면 여러 개.
export function routesOf(trains: Train[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of trains) {
    const r = t.route || '';
    if (!seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out;
}
// 해당 열차들의 대표 종점(방면) = 가장 빈번한 종착역. (지하철 승강장의 "○○방면" 표기용)
export function representativeDest(trains: Train[]): string {
  const cnt = new Map<string, number>();
  for (const t of trains) {
    if (!t.dest) continue;
    cnt.set(t.dest, (cnt.get(t.dest) || 0) + 1);
  }
  let best = '';
  let n = -1;
  for (const [d, c] of cnt) if (c > n) { n = c; best = d; }
  return best;
}

// ---- 집(출발지) 로컬 상태 훅 ----
export function useHomeLocation() {
  const [home, setHomeState] = useState<GeoPoint | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      const h = await getItem<GeoPoint>(STORAGE_KEYS.HOME);
      if (h) setHomeState(h);
      setLoaded(true);
    })();
  }, []);
  const setHome = useCallback(async (p: GeoPoint | null) => {
    setHomeState(p);
    if (p) await setItem(STORAGE_KEYS.HOME, p);
    else await removeItem(STORAGE_KEYS.HOME);
  }, []);
  return { home, setHome, loaded };
}

// ---- 자주 타는 역(즐겨찾기) 로컬 상태 훅 ----
// dirs: 즐겨찾기할 (노선,방향) 목록(복수 가능). 비어있으면 전체 방향 표시.
export interface FavPref {
  route: string;
  dir: 'U' | 'D';
}
export interface FavStation extends SubwayStation {
  dirs?: FavPref[];
  pref?: FavPref; // legacy(단일 지정) — 로드 시 dirs로 이관
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavStation[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      const f = await getItem<FavStation[]>(STORAGE_KEYS.SUBWAY_FAV);
      if (Array.isArray(f)) {
        // 구버전(pref 단일) → dirs 배열로 이관
        setFavorites(f.map((x) => (x.dirs ? x : x.pref ? { ...x, dirs: [x.pref], pref: undefined } : x)));
      }
      setLoaded(true);
    })();
  }, []);
  const addFavorite = useCallback((s: SubwayStation, dirs: FavPref[] = []) => {
    // distance 등 부가 필드 제외하고 핵심만 저장
    const clean: FavStation = { id: s.id, name: s.name, city: s.city, lines: s.lines, lat: s.lat, lng: s.lng, dirs };
    setFavorites((prev) => {
      if (prev.some((p) => p.id === clean.id)) return prev;
      const next = [...prev, clean];
      setItem(STORAGE_KEYS.SUBWAY_FAV, next);
      return next;
    });
  }, []);
  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setItem(STORAGE_KEYS.SUBWAY_FAV, next);
      return next;
    });
  }, []);
  // 즐겨찾기할 방향 목록 갱신 (빈 배열이면 전체 표시)
  const setFavoriteDirs = useCallback((id: string, dirs: FavPref[]) => {
    setFavorites((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, dirs } : p));
      setItem(STORAGE_KEYS.SUBWAY_FAV, next);
      return next;
    });
  }, []);
  const isFavorite = useCallback((id: string) => favorites.some((p) => p.id === id), [favorites]);
  const toggleFavorite = useCallback(
    (s: SubwayStation) => {
      if (favorites.some((p) => p.id === s.id)) removeFavorite(s.id);
      else addFavorite(s, []);
    },
    [favorites, addFavorite, removeFavorite]
  );
  return { favorites, addFavorite, removeFavorite, setFavoriteDirs, toggleFavorite, isFavorite, loaded };
}
