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

export function dailyTypeForDate(ms: number = new Date().getTime(), isHoliday = false): DailyType {
  if (isHoliday) return '03'; // 공휴일은 일요일·공휴일 시간표 적용
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
  // 호출은 정상인데 TAGO에 그 역·노선 시간표 데이터 자체가 없는 경우(=우리 오류 아님).
  // 빨간 오류 대신 안내 문구로 보여주려고 구분한다.
  empty?: boolean;
  // 갱신 주기(1주일)가 지난 저장본을 보여주는 중 — 뒤에서 조용히 새로 받고 있다.
  stale?: boolean;
}

const cacheKeyOf = (stationId: string, daily: DailyType) => `${STORAGE_KEYS.SUBWAY_SCHED}_${stationId}_${daily}`;

// 같은 키를 동시에 여러 번 갱신하지 않도록(백그라운드 갱신 + 화면 진입이 겹칠 때) 진행 중 표시
const inFlight = new Set<string>();

// 서버(Edge Function → TAGO)에서 한 역·요일치 시간표를 받아온다. 캐시는 건드리지 않는다.
async function loadFromServer(
  station: SubwayStation,
  daily: DailyType,
  force = false
): Promise<{ trains: Train[]; error: string; okCalls: number }> {
  if (!supabase) return { trains: [], error: '백엔드가 설정되지 않아 시간표를 가져올 수 없습니다.', okCalls: 0 };
  const ids = await resolveStationIds(station, force);
  if (!ids.length) {
    return { trains: [], error: '해당 역의 시간표 정보를 찾을 수 없습니다. (지방 노선은 미제공일 수 있음)', okCalls: 0 };
  }
  const all: Train[] = [];
  let anyError = '';
  let okCalls = 0; // 정상 응답(오류 없이 돌아온) 횟수 — 0건이 '데이터 없음'인지 '조회 실패'인지 구분
  for (const s of ids) {
    const { data, error } = await supabase.functions.invoke('subway-timetable', {
      body: { action: 'schedule', stationId: s.id, daily },
    });
    if (error) { anyError = '시간표 함수를 호출하지 못했습니다. (Edge Function 배포 확인)'; continue; }
    if (data && (data as any).ok === false) { anyError = (data as any).error || '시간표 조회 실패'; continue; }
    okCalls += 1;
    const trains = ((data as any).trains || []) as Train[];
    all.push(...trains.map((tr) => ({ ...tr, route: tr.route || s.route })));
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
  return { trains: dedup, error: anyError, okCalls };
}

// 받아온 시간표를 저장. 빈 결과는 저장하지 않는다(있던 시간표를 빈 값으로 덮어쓰지 않게).
async function saveCache(stationId: string, daily: DailyType, trains: Train[]): Promise<number> {
  const at = new Date().getTime();
  if (trains.length > 0) await setItem(cacheKeyOf(stationId, daily), { at, data: trains } as CacheEnvelope<Train[]>);
  return at;
}

// 백그라운드 갱신(실패해도 조용히 무시 — 화면엔 저장된 시간표가 이미 떠 있다)
function refreshInBackground(station: SubwayStation, daily: DailyType) {
  const key = cacheKeyOf(station.id, daily);
  if (inFlight.has(key)) return;
  inFlight.add(key);
  loadFromServer(station, daily)
    .then((r) => saveCache(station.id, daily, r.trains))
    .catch(() => {})
    .finally(() => inFlight.delete(key));
}

// 나머지 요일(평일/토/일) 시간표도 미리 받아 저장해 둔다.
// 주말에 서버가 죽어도 토·일 시간표가 남아 있게 하려는 것(1주일에 한 번만 수행).
function prefetchOtherDailyTypes(station: SubwayStation, current: DailyType) {
  const others = (['01', '02', '03'] as DailyType[]).filter((d) => d !== current);
  others.forEach(async (d) => {
    const key = cacheKeyOf(station.id, d);
    if (inFlight.has(key)) return;
    const c = await getItem<CacheEnvelope<Train[]>>(key);
    if (c && c.data?.length && new Date().getTime() - c.at < SUBWAY_CACHE_TTL) return; // 아직 신선
    inFlight.add(key);
    loadFromServer(station, d)
      .then((r) => saveCache(station.id, d, r.trains))
      .catch(() => {})
      .finally(() => inFlight.delete(key));
  });
}

// 역 시간표(요일별, 상·하행 모두).
//  - 저장된 시간표가 있으면 항상 그것을 먼저 보여준다(서버·TAGO가 죽어도 화면이 비지 않게).
//  - 저장본이 1주일(SUBWAY_CACHE_TTL)보다 오래됐으면 화면은 그대로 두고 뒤에서 조용히 갱신한다.
//  - 저장본은 만료로 지우지 않는다. 갱신에 실패하면 이전 시간표를 계속 쓴다.
//  - opts.force=true(수동 새로고침)면 기다렸다가 새로 받은 결과를 돌려준다.
export async function fetchTimetable(
  station: SubwayStation,
  daily: DailyType,
  opts: { force?: boolean } = {}
): Promise<TimetableResult> {
  const key = cacheKeyOf(station.id, daily);
  const cached = await getItem<CacheEnvelope<Train[]>>(key);
  const hasCache = !!cached && !!cached.data?.length;
  const fresh = hasCache && new Date().getTime() - cached!.at < SUBWAY_CACHE_TTL;

  if (hasCache && !opts.force) {
    if (!fresh) refreshInBackground(station, daily); // 1주일 지남 → 뒤에서 갱신
    prefetchOtherDailyTypes(station, daily);
    return { ok: true, trains: cached!.data, cached: true, at: cached!.at, stale: !fresh };
  }

  // 저장본이 없거나 수동 새로고침 → 서버에서 받아온다
  inFlight.add(key);
  let res: { trains: Train[]; error: string; okCalls: number };
  try {
    res = await loadFromServer(station, daily, opts.force);
  } finally {
    inFlight.delete(key);
  }

  if (!res.trains.length) {
    // 새로 받지 못했으면 저장본으로 폴백(있으면). 없으면 사유를 알려준다.
    if (hasCache) return { ok: true, trains: cached!.data, cached: true, at: cached!.at, stale: true };
    if (res.okCalls > 0 && !res.error) {
      return {
        ok: false,
        empty: true,
        error:
          '국토교통부(TAGO) 공공데이터에 이 역 시간표가 없습니다. 일부 역·노선은 제공되지 않으며(예: 5·9호선 일부 역), 같은 역의 다른 노선이나 인접 역은 조회될 수 있습니다.',
      };
    }
    return { ok: false, error: res.error || '시간표가 비어 있습니다.' };
  }

  const at = await saveCache(station.id, daily, res.trains);
  prefetchOtherDailyTypes(station, daily);
  return { ok: true, trains: res.trains, at };
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
