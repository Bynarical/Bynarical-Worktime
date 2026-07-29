import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  Screen,
  Hero,
  Card,
  Muted,
  Button,
  Badge,
  Chip,
  Row,
  Divider,
  Field,
  useTheme,
} from '@/components/ui';
import { useStore } from '@/lib/store';
import { getCurrentPoint, parseCoords } from '@/lib/geo';
import { timeHM, hmToMinutes, minutesToHM } from '@/lib/time';
import { GeoPoint } from '@/lib/types';
import { SUBWAY_AUTO_REFRESH_MS } from '@/lib/config';
import {
  SubwayStation,
  NearbyStation,
  nearbyStations,
  useHomeLocation,
  useFavorites,
  fetchTimetable,
  dailyTypeForDate,
  DailyType,
  DAILY_LABEL,
  Train,
  TimetableResult,
  nextTrainsAfter,
  firstTrain,
  lastTrain,
  routesOf,
  representativeDest,
} from '@/lib/subway';

type Fav = ReturnType<typeof useFavorites>;

function metersLabel(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

function agoLabel(at?: number): string {
  if (!at) return '';
  const ms = new Date().getTime() - at;
  const m = Math.floor(ms / 60000);
  if (m < 1) return '방금 업데이트';
  if (m < 60) return `${m}분 전 업데이트`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전 업데이트`;
  return `${Math.floor(h / 24)}일 전 업데이트`;
}

function FavStar({ active, onPress }: { active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Text style={{ fontSize: 20, color: active ? t.warning : t.textFaint }}>{active ? '★' : '☆'}</Text>
    </Pressable>
  );
}

// 열차 시각 칩(시각 + 종점)
function TrainChip({ tr }: { tr: Train }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.cardAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center' }}>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: 13 }}>{tr.time}</Text>
      {tr.dest ? <Text style={{ color: t.textFaint, fontSize: 10 }}>→{tr.dest}</Text> : null}
    </View>
  );
}

export default function Commute() {
  const s = useStore();
  const t = useTheme();
  const { home, setHome, loaded } = useHomeLocation();
  const fav = useFavorites();
  const [selected, setSelected] = useState<SubwayStation | null>(null);

  const workplace = s.settings.workplaces[0] || null;
  const homeNear = useMemo(() => (home ? nearbyStations(home) : []), [home]);
  const workNear = useMemo(
    () => (workplace ? nearbyStations({ lat: workplace.lat, lng: workplace.lng }) : []),
    [workplace]
  );
  // 즐겨찾기가 하나라도 있으면 근처 역 목록은 접어둔다(자주 안 쓰므로). 없으면 펼쳐서 추가 유도.
  const nearbyDefaultOpen = fav.loaded && fav.favorites.length === 0;

  return (
    <Screen>
      <Hero style={{ paddingVertical: 22 }}>
        <View style={{ gap: 3 }}>
          <Text style={{ color: t.onHeroDim, fontSize: 13, fontWeight: '600' }}>지하철 통근</Text>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>🚇 통근 도우미</Text>
          <Text style={{ color: t.onHeroDim, fontSize: 12 }}>자주 타는 역과 노선별 시간표를 확인하세요</Text>
        </View>
      </Hero>

      <FavoritesCard fav={fav} selectedId={selected?.id} onSelect={setSelected} />

      <HomeCard home={home} setHome={setHome} loaded={loaded} />

      <StationsCard
        title="집 근처 역"
        icon="🏠"
        defaultOpen={nearbyDefaultOpen}
        emptyHint={home ? '2.5km 내 역을 찾지 못했습니다.' : '먼저 집 위치를 등록하세요.'}
        list={homeNear}
        selectedId={selected?.id}
        onSelect={setSelected}
        fav={fav}
      />

      <StationsCard
        title="직장 근처 역"
        icon="🏢"
        subtitle={workplace?.name}
        defaultOpen={nearbyDefaultOpen}
        emptyHint={workplace ? '2.5km 내 역을 찾지 못했습니다.' : '등록된 근무지가 없습니다.'}
        list={workNear}
        selectedId={selected?.id}
        onSelect={setSelected}
        fav={fav}
      />

      {selected && <TimetableCard station={selected} onClose={() => setSelected(null)} fav={fav} />}

      <Card>
        <Muted size={11}>
          역 위치는 앱 내장 전국 도시철도 데이터를 사용합니다. 시간표·방면(종점)은 국토교통부(TAGO) 공공데이터를 조회하며,
          지방 일부 노선은 제공되지 않을 수 있습니다. 시간표는 기기에 캐시되어 다음부터 빠르게 열리고 오래되면 자동 갱신됩니다.
          ※ 급행/완행 구분은 TAGO에서 제공하지 않아 표시할 수 없습니다. 집 위치·즐겨찾기는 이 기기에만 저장됩니다.
        </Muted>
      </Card>
    </Screen>
  );
}

// 노선별 다음 N개 열차를 컴팩트하게 (즐겨찾기 요약용). 환승역이면 노선마다 한 줄.
function StationTrainSummary({ trains, count = 5 }: { trains: Train[]; count?: number }) {
  const t = useTheme();
  const routes = routesOf(trains);
  const now = timeHM();
  return (
    <View style={{ gap: 6 }}>
      {routes.map((route) => {
        const rt = trains.filter((tr) => (tr.route || '') === route);
        const up = nextTrainsAfter(rt, now, count);
        return (
          <View key={route || 'line'} style={{ gap: 4 }}>
            <Text style={{ color: t.primary, fontSize: 11.5, fontWeight: '800' }}>{route || '노선'}</Text>
            {up.length === 0 ? (
              <Muted size={11}>금일 운행 종료</Muted>
            ) : (
              <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                {up.map((tr, i) => (
                  <TrainChip key={`${tr.time}-${tr.dest}-${i}`} tr={tr} />
                ))}
              </Row>
            )}
          </View>
        );
      })}
    </View>
  );
}

function FavoritesCard({
  fav,
  selectedId,
  onSelect,
}: {
  fav: Fav;
  selectedId?: string;
  onSelect: (s: SubwayStation) => void;
}) {
  const t = useTheme();
  const daily = useMemo(() => dailyTypeForDate(), []);
  const [summaries, setSummaries] = useState<Record<string, TimetableResult>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      for (const st of fav.favorites) {
        const r = await fetchTimetable(st, daily);
        if (!alive) return;
        setSummaries((prev) => ({ ...prev, [st.id]: r }));
        if (r.ok && r.at && new Date().getTime() - r.at > SUBWAY_AUTO_REFRESH_MS) {
          const fresh = await fetchTimetable(st, daily, { force: true });
          if (!alive) return;
          setSummaries((prev) => ({ ...prev, [st.id]: fresh }));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [fav.favorites, daily]);

  async function refreshAll() {
    setBusy(true);
    for (const st of fav.favorites) {
      const fresh = await fetchTimetable(st, daily, { force: true });
      setSummaries((prev) => ({ ...prev, [st.id]: fresh }));
    }
    setBusy(false);
  }

  if (!fav.loaded) return null;

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: 8 }}>
          <Text style={{ fontSize: 16 }}>⭐</Text>
          <Text style={{ fontWeight: '800', color: t.text, fontSize: 15 }}>자주 타는 역</Text>
        </Row>
        {fav.favorites.length > 0 && (
          <Button label="새로고침" icon="🔄" variant="outline" small onPress={refreshAll} loading={busy} />
        )}
      </Row>

      {fav.favorites.length === 0 ? (
        <Muted size={12}>아래 "집/직장 근처 역"을 펼쳐 ☆ 를 누르면 자주 타는 역이 여기에 노선별 시간표와 함께 표시됩니다.</Muted>
      ) : (
        fav.favorites.map((st, i) => {
          const r = summaries[st.id];
          return (
            <View key={st.id} style={{ gap: 8 }}>
              {i > 0 && <Divider />}
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Pressable style={{ flex: 1 }} onPress={() => onSelect(st)}>
                  <Row style={{ gap: 8 }}>
                    <Text style={{ fontSize: 15 }}>🚉</Text>
                    <Text style={{ color: selectedId === st.id ? t.primary : t.text, fontWeight: '700', fontSize: 15 }}>
                      {st.name} <Text style={{ color: t.primary, fontSize: 12 }}>자세히 ›</Text>
                    </Text>
                  </Row>
                </Pressable>
                <FavStar active onPress={() => fav.removeFavorite(st.id)} />
              </Row>
              {!r ? (
                <Muted size={12}>불러오는 중…</Muted>
              ) : !r.ok || !r.trains?.length ? (
                <Muted size={12}>시간표 정보 없음</Muted>
              ) : (
                <StationTrainSummary trains={r.trains} count={5} />
              )}
            </View>
          );
        })
      )}
    </Card>
  );
}

function HomeCard({
  home,
  setHome,
  loaded,
}: {
  home: GeoPoint | null;
  setHome: (p: GeoPoint | null) => void;
  loaded: boolean;
}) {
  const t = useTheme();
  const [coords, setCoords] = useState('');
  const [msg, setMsg] = useState('');

  async function useCurrent() {
    setMsg('위치 확인 중...');
    const p = await getCurrentPoint();
    if (p) {
      setCoords(`${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`);
      setMsg('현재 위치를 입력했습니다. [저장]을 누르세요.');
    } else setMsg('위치를 가져오지 못했습니다.');
  }
  async function save() {
    const p = parseCoords(coords);
    if (!p) return setMsg('좌표 또는 Google Maps 링크를 확인하세요.');
    await setHome(p);
    setCoords('');
    setMsg('✓ 집 위치를 저장했습니다.');
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row><Badge text="집(출발지)" color={t.primary} /></Row>
        {home && <Badge text="등록됨" color={t.success} />}
      </Row>
      {home ? (
        <>
          <Muted size={12}>{home.lat.toFixed(5)}, {home.lng.toFixed(5)}</Muted>
          <Row>
            <Button label="위치 변경" variant="outline" small style={{ flex: 1 }} onPress={() => setHome(null)} />
          </Row>
        </>
      ) : (
        <>
          {!loaded ? (
            <Muted size={12}>불러오는 중...</Muted>
          ) : (
            <>
              <Field
                label="집 좌표 또는 Google Maps 링크"
                value={coords}
                onChangeText={setCoords}
                placeholder="37.5665, 126.9780"
                autoCapitalize="none"
              />
              {msg ? <Muted size={12}>{msg}</Muted> : null}
              <Row>
                <Button label="📍 현재 위치로" variant="outline" small style={{ flex: 1 }} onPress={useCurrent} />
                <Button label="저장" variant="primary" small style={{ flex: 1 }} onPress={save} />
              </Row>
            </>
          )}
        </>
      )}
    </Card>
  );
}

// 접이식 근처 역 목록
function StationsCard({
  title,
  icon,
  subtitle,
  emptyHint,
  list,
  selectedId,
  onSelect,
  fav,
  defaultOpen,
}: {
  title: string;
  icon: string;
  subtitle?: string;
  emptyHint: string;
  list: NearbyStation[];
  selectedId?: string;
  onSelect: (s: SubwayStation) => void;
  fav: Fav;
  defaultOpen: boolean;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row style={{ gap: 8 }}>
            <Text style={{ fontSize: 16 }}>{icon}</Text>
            <Text style={{ fontWeight: '800', color: t.text, fontSize: 15 }}>{title}</Text>
            {list.length > 0 ? <Muted size={12}>({list.length})</Muted> : null}
          </Row>
          <Row style={{ gap: 8 }}>
            {subtitle ? <Muted size={12}>{subtitle}</Muted> : null}
            <Text style={{ color: t.textDim, fontSize: 14, fontWeight: '800' }}>{open ? '▾' : '▸'}</Text>
          </Row>
        </Row>
      </Pressable>

      {open &&
        (list.length === 0 ? (
          <Muted size={12}>{emptyHint}</Muted>
        ) : (
          list.map((st, i) => (
            <View key={st.id}>
              {i === 0 ? <Divider /> : null}
              <Row style={{ justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }}>
                <Pressable style={{ flex: 1 }} onPress={() => onSelect(st)}>
                  <Row style={{ gap: 10 }}>
                    <Text style={{ fontSize: 16 }}>{selectedId === st.id ? '✅' : '🚉'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>
                        {st.name} · {metersLabel(st.distance)} <Text style={{ color: t.primary, fontSize: 12 }}>시간표 ›</Text>
                      </Text>
                      <Text style={{ color: t.textFaint, fontSize: 12 }}>{st.lines.join(' · ') || st.city}</Text>
                    </View>
                  </Row>
                </Pressable>
                <FavStar active={fav.isFavorite(st.id)} onPress={() => fav.toggleFavorite(st)} />
              </Row>
              {i < list.length - 1 ? <Divider /> : null}
            </View>
          ))
        ))}
    </Card>
  );
}

function TimetableCard({ station, onClose, fav }: { station: SubwayStation; onClose: () => void; fav: Fav }) {
  const s = useStore();
  const t = useTheme();
  const policy = s.settings.workPolicy;

  const [daily, setDaily] = useState<DailyType>(() => dailyTypeForDate());
  const [refHM, setRefHM] = useState<string>(() => timeHM());
  const [res, setRes] = useState<TimetableResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setRes(null);
    fetchTimetable(station, daily).then((r) => {
      if (alive) {
        setRes(r);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [station.id, daily]);

  async function refresh() {
    setRefreshing(true);
    const r = await fetchTimetable(station, daily, { force: true });
    setRes(r);
    setRefreshing(false);
  }

  const arriveBy = policy.latestClockIn;
  const leaveAt = minutesToHM(
    hmToMinutes(policy.latestClockIn) + (policy.dailyWorkMinutes || 480) + (policy.breakMinutes || 60)
  );

  const trains = res?.trains || [];
  const routes = useMemo(() => routesOf(trains), [trains]);

  return (
    <Card style={{ borderColor: t.primary, borderWidth: 1.5 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: 8 }}>
          <Text style={{ fontSize: 18 }}>🚉</Text>
          <View>
            <Text style={{ fontWeight: '800', color: t.text, fontSize: 17 }}>{station.name}</Text>
            <Muted size={11}>{station.lines.join(' · ') || station.city}</Muted>
          </View>
        </Row>
        <Row style={{ gap: 12 }}>
          <FavStar active={fav.isFavorite(station.id)} onPress={() => fav.toggleFavorite(station)} />
          <Button label="닫기" variant="neutral" small onPress={onClose} />
        </Row>
      </Row>

      <Divider />

      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Muted size={11}>{res?.at ? agoLabel(res.at) + (res.cached ? ' · 캐시' : '') : ''}</Muted>
        <Button label="새로고침" icon="🔄" variant="outline" small onPress={refresh} loading={refreshing} />
      </Row>

      <Row style={{ flexWrap: 'wrap' }}>
        {(['01', '02', '03'] as DailyType[]).map((d) => (
          <Chip key={d} label={DAILY_LABEL[d]} small active={daily === d} onPress={() => setDaily(d)} />
        ))}
      </Row>

      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label={`지금 ${timeHM()}`} small active={false} onPress={() => setRefHM(timeHM())} color={t.primary} />
        <Chip label={`출근 ${arriveBy}`} small onPress={() => setRefHM(arriveBy)} color={t.success} />
        <Chip label={`퇴근 ${leaveAt}`} small onPress={() => setRefHM(leaveAt)} color={t.warning} />
      </Row>
      <Muted size={11}>기준 {refHM} 이후 출발하는 열차 (방면=종점 기준)</Muted>

      {loading ? (
        <Muted size={13}>시간표 불러오는 중...</Muted>
      ) : !res?.ok ? (
        <Muted size={12} style={{ color: t.danger }}>{res?.error || '시간표를 불러오지 못했습니다.'}</Muted>
      ) : trains.length === 0 ? (
        <Muted size={12}>시간표 데이터가 없습니다.</Muted>
      ) : (
        routes.map((route) => {
          const rt = trains.filter((tr) => (tr.route || '') === route);
          const dirs = ['U', 'D'].filter((d) => rt.some((tr) => tr.dir === d)) as ('U' | 'D')[];
          return (
            <View key={route || 'line'} style={{ gap: 8 }}>
              <Divider />
              <Badge text={`🚈 ${route || station.lines.join('·') || '노선'}`} color={t.primary} />
              {dirs.map((d) => {
                const dt = rt.filter((tr) => tr.dir === d);
                const label = representativeDest(dt); // 방면(대표 종점)
                const f = firstTrain(dt);
                const l = lastTrain(dt);
                const up = nextTrainsAfter(dt, refHM, 5);
                return (
                  <View key={d} style={{ gap: 6, paddingLeft: 4 }}>
                    <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: t.text, fontSize: 14, fontWeight: '800' }}>
                        {label ? `${label} 방면` : d === 'U' ? '상행' : '하행'}
                      </Text>
                      <Muted size={11}>첫차 {f?.time || '-'} · 막차 {l?.time || '-'}</Muted>
                    </Row>
                    {up.length === 0 ? (
                      <Muted size={12}>기준 이후 남은 열차 없음 (막차 {l?.time || '-'})</Muted>
                    ) : (
                      <Row style={{ flexWrap: 'wrap', gap: 6 }}>
                        {up.map((tr, i) => (
                          <TrainChip key={`${tr.time}-${tr.dest}-${i}`} tr={tr} />
                        ))}
                      </Row>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })
      )}
    </Card>
  );
}
