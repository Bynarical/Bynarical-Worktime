import React, { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import {
  Screen,
  Hero,
  Card,
  Muted,
  Body,
  Button,
  Badge,
  Chip,
  Row,
  Divider,
  KV,
  StatTile,
  ListRow,
  Field,
  useTheme,
} from '@/components/ui';
import { useStore } from '@/lib/store';
import { getCurrentPoint, parseCoords } from '@/lib/geo';
import { timeHM, hmToMinutes, minutesToHM } from '@/lib/time';
import { GeoPoint } from '@/lib/types';
import {
  SubwayStation,
  NearbyStation,
  nearbyStations,
  useHomeLocation,
  fetchTimetable,
  dailyTypeForDate,
  DailyType,
  DAILY_LABEL,
  DIR_LABEL,
  Train,
  TimetableResult,
  trainsOfDir,
  firstTrain,
  lastTrain,
  nextTrainsAfter,
} from '@/lib/subway';

function metersLabel(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

export default function Commute() {
  const s = useStore();
  const t = useTheme();
  const { home, setHome, loaded } = useHomeLocation();
  const [selected, setSelected] = useState<SubwayStation | null>(null);

  const workplace = s.settings.workplaces[0] || null;
  const homeNear = useMemo(() => (home ? nearbyStations(home) : []), [home]);
  const workNear = useMemo(
    () => (workplace ? nearbyStations({ lat: workplace.lat, lng: workplace.lng }) : []),
    [workplace]
  );

  return (
    <Screen>
      <Hero style={{ paddingVertical: 22 }}>
        <View style={{ gap: 3 }}>
          <Text style={{ color: t.onHeroDim, fontSize: 13, fontWeight: '600' }}>지하철 통근</Text>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>🚇 통근 도우미</Text>
          <Text style={{ color: t.onHeroDim, fontSize: 12 }}>집·직장 근처 역과 시간표를 확인하세요</Text>
        </View>
      </Hero>

      <HomeCard home={home} setHome={setHome} loaded={loaded} />

      <StationsCard
        title="집 근처 역"
        icon="🏠"
        emptyHint={home ? '2.5km 내 역을 찾지 못했습니다.' : '먼저 집 위치를 등록하세요.'}
        list={homeNear}
        selectedId={selected?.id}
        onSelect={setSelected}
      />

      <StationsCard
        title="직장 근처 역"
        icon="🏢"
        subtitle={workplace?.name}
        emptyHint={workplace ? '2.5km 내 역을 찾지 못했습니다.' : '등록된 근무지가 없습니다.'}
        list={workNear}
        selectedId={selected?.id}
        onSelect={setSelected}
      />

      {selected && <TimetableCard station={selected} onClose={() => setSelected(null)} />}

      <Card>
        <Muted size={11}>
          역 위치는 앱에 내장된 전국 도시철도 데이터(서울·부산·대구·광주·대전 등)를 사용합니다. 시간표는 국토교통부(TAGO)
          공공데이터를 조회하며, 지방 일부 노선은 제공되지 않을 수 있습니다. 집 위치는 이 기기에만 저장되고 서버로 전송되지
          않습니다.
        </Muted>
      </Card>
    </Screen>
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

function StationsCard({
  title,
  icon,
  subtitle,
  emptyHint,
  list,
  selectedId,
  onSelect,
}: {
  title: string;
  icon: string;
  subtitle?: string;
  emptyHint: string;
  list: NearbyStation[];
  selectedId?: string;
  onSelect: (s: SubwayStation) => void;
}) {
  const t = useTheme();
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: 8 }}>
          <Text style={{ fontSize: 16 }}>{icon}</Text>
          <Text style={{ fontWeight: '800', color: t.text, fontSize: 15 }}>{title}</Text>
        </Row>
        {subtitle ? <Muted size={12}>{subtitle}</Muted> : null}
      </Row>
      {list.length === 0 ? (
        <Muted size={12}>{emptyHint}</Muted>
      ) : (
        list.map((st, i) => (
          <View key={st.id}>
            {i > 0 && <Divider />}
            <ListRow
              icon={selectedId === st.id ? '✅' : '🚉'}
              label={`${st.name} · ${metersLabel(st.distance)}`}
              sub={st.lines.join(' · ') || st.city}
              right={<Text style={{ color: t.primary, fontWeight: '700', fontSize: 13 }}>시간표 ›</Text>}
              onPress={() => onSelect(st)}
            />
          </View>
        ))
      )}
    </Card>
  );
}

function TimetableCard({ station, onClose }: { station: SubwayStation; onClose: () => void }) {
  const s = useStore();
  const t = useTheme();
  const policy = s.settings.workPolicy;

  const [daily, setDaily] = useState<DailyType>(() => dailyTypeForDate());
  const [dir, setDir] = useState<'U' | 'D'>('U');
  const [refHM, setRefHM] = useState<string>(() => timeHM());
  const [res, setRes] = useState<TimetableResult | null>(null);
  const [loading, setLoading] = useState(false);

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

  // 출근/퇴근 기준 시각(정책 기반)
  const arriveBy = policy.latestClockIn; // 예: 10:00 까지 도착
  const leaveAt = minutesToHM(
    hmToMinutes(policy.latestClockIn) + (policy.dailyWorkMinutes || 480) + (policy.breakMinutes || 60)
  ); // 예상 퇴근

  const dirTrains = useMemo(() => (res?.trains ? trainsOfDir(res.trains, dir) : []), [res, dir]);
  const first = firstTrain(dirTrains);
  const last = lastTrain(dirTrains);
  const upcoming = useMemo(() => nextTrainsAfter(dirTrains, refHM, 8), [dirTrains, refHM]);

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
        <Button label="닫기" variant="neutral" small onPress={onClose} />
      </Row>

      <Divider />

      <Text style={{ color: t.textDim, fontSize: 12, fontWeight: '700' }}>요일</Text>
      <Row style={{ flexWrap: 'wrap' }}>
        {(['01', '02', '03'] as DailyType[]).map((d) => (
          <Chip key={d} label={DAILY_LABEL[d]} small active={daily === d} onPress={() => setDaily(d)} />
        ))}
      </Row>

      <Text style={{ color: t.textDim, fontSize: 12, fontWeight: '700' }}>방향</Text>
      <Row>
        {(['U', 'D'] as const).map((d) => (
          <Chip key={d} label={DIR_LABEL[d]} small active={dir === d} onPress={() => setDir(d)} />
        ))}
      </Row>

      {loading ? (
        <Muted size={13}>시간표 불러오는 중...</Muted>
      ) : !res?.ok ? (
        <Muted size={12} style={{ color: t.danger }}>{res?.error || '시간표를 불러오지 못했습니다.'}</Muted>
      ) : dirTrains.length === 0 ? (
        <Muted size={12}>이 방향의 시간표 데이터가 없습니다. 반대 방향을 선택해 보세요.</Muted>
      ) : (
        <>
          <Row style={{ gap: 8 }}>
            <StatTile label="첫차" value={first?.time || '-'} sub={first?.dest ? `→ ${first.dest}` : undefined} color={t.success} />
            <StatTile label="막차" value={last?.time || '-'} sub={last?.dest ? `→ ${last.dest}` : undefined} color={t.danger} />
          </Row>

          <Text style={{ color: t.textDim, fontSize: 12, fontWeight: '700' }}>기준 시각 이후 열차</Text>
          <Row style={{ flexWrap: 'wrap' }}>
            <Chip label={`지금 ${timeHM()}`} small active={false} onPress={() => setRefHM(timeHM())} color={t.primary} />
            <Chip label={`출근 ${arriveBy}`} small onPress={() => setRefHM(arriveBy)} color={t.success} />
            <Chip label={`퇴근 ${leaveAt}`} small onPress={() => setRefHM(leaveAt)} color={t.warning} />
          </Row>
          <Muted size={11}>기준 {refHM} 이후 출발</Muted>

          {upcoming.length === 0 ? (
            <Muted size={12}>기준 시각 이후 남은 열차가 없습니다. (막차 {last?.time})</Muted>
          ) : (
            upcoming.map((tr, i) => (
              <View key={`${tr.time}-${tr.dest}-${i}`}>
                {i > 0 && <Divider />}
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row style={{ gap: 10 }}>
                    <Text style={{ fontWeight: '800', color: t.text, fontSize: 16, minWidth: 52 }}>{tr.time}</Text>
                    <Text style={{ color: t.textDim, fontSize: 13 }}>{tr.dest ? `→ ${tr.dest}` : ''}</Text>
                  </Row>
                  {tr.route ? <Badge text={tr.route} color={t.primary} /> : null}
                </Row>
              </View>
            ))
          )}
          {res.cached ? <Muted size={10}>· 저장된 시간표(캐시)를 표시 중</Muted> : null}
        </>
      )}
    </Card>
  );
}
