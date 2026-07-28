# 지하철 통근 도우미 (Commute)

집·직장 근처 지하철역을 자동으로 찾고, 국토교통부(TAGO) 공공데이터로 **시간표(첫차·막차·시간대별 배차)** 를 조회하는 기능입니다. 새 탭 **🚇 통근** 에서 사용합니다.

## 무엇을 하나
- 설정한 **직장 위치** 와 각자 입력한 **집(출발지)** 위치 주변의 가까운 역을 거리순으로 표시
- 역을 선택하면 **요일(평일/토/일)·방향(상/하행)** 별 시간표, **첫차/막차**, **기준 시각(지금·출근·퇴근) 이후 다가오는 열차** 를 표시
- 집 위치는 **이 기기에만** 로컬 저장(서버 미전송)되며 직원 각자 입력

## 구성 요소
| 파일 | 역할 |
|---|---|
| `assets/subway/stations.json` | 앱에 번들되는 **전국 역 좌표**(서울·부산·대구·광주·대전 등, 853역). 오프라인 동작 |
| `scripts/build-stations.mjs` | 원천 데이터 → `stations.json` 재생성 빌드 스크립트 |
| `scripts/stations.source.json5` | 초기 시드 원천(커뮤니티 수집본) |
| `lib/subway.ts` | 근처 역 탐색·시간표 조회/캐시·집 위치 훅 |
| `app/(tabs)/commute.tsx` | 🚇 통근 화면 |
| `supabase/functions/subway-timetable/` | TAGO 프록시 Edge Function(서비스키 서버 보관) |

## ⚙️ 설정에 필요한 2단계 (관리자/개발자)

### 1) 시간표 API 연결 — **필수** (이걸 해야 시간표가 나옵니다)
역 위치·근처 역 찾기는 번들 데이터라 바로 동작하지만, **시간표 조회**에는 공공데이터 서비스키가 필요합니다.

1. [공공데이터포털 — 국토교통부(TAGO) 지하철정보](https://www.data.go.kr/data/15098554/openapi.do) 접속 → **활용신청** → 승인 후 **일반 인증키(Decoding)** 발급 (무료, 개발계정 1만 요청/일)
2. Supabase에 시크릿 등록:
   ```bash
   supabase secrets set SUBWAY_API_KEY="<발급받은 일반 인증키(Decoding)>"
   ```
3. Edge Function 배포:
   ```bash
   supabase functions deploy subway-timetable
   ```
   (또는 대시보드 → Edge Functions → Create a function → 이름 `subway-timetable` → `supabase/functions/subway-timetable/index.ts` 붙여넣고 Deploy)

> 서비스키는 서버(Edge Function)에만 저장되고 클라이언트/웹에 노출되지 않습니다. 웹의 CORS 문제도 프록시가 해결합니다.

### 2) 역 좌표 데이터 교체 — **선택(권장)**
기본 번들은 커뮤니티 수집본이라 일부 좌표가 부정확하거나 인천/경기 일부가 빠질 수 있습니다. 정확도가 필요하면 공식 표준데이터로 교체하세요.

1. [전국도시철도역사정보 표준데이터](https://www.data.go.kr/data/15013205/standard.do)에서 **CSV 다운로드**
2. 재생성:
   ```bash
   node scripts/build-stations.mjs <다운로드한.csv>
   ```
   → `assets/subway/stations.json` 이 갱신됩니다. (컬럼명이 버전마다 달라도 유연하게 매칭)

## 동작·데이터
- **근처 역 찾기**: 번들 좌표 + Haversine 거리(`lib/geo.ts`의 `distanceMeters`) 재사용. 2.5km 내 역이 없으면 최근접 3개.
- **시간표**: `subway-timetable` Edge Function이 TAGO `getKwrdFndSubwaySttnList`(역명→역ID)와 `getSubwaySttnAcctoSchdulList`(역별 시간표)를 호출.
- **캐시**: 시간표는 개편 시에만 바뀌므로 기기에 30일 캐시(`SUBWAY_CACHE_TTL`). 오프라인/오류 시 캐시로 폴백.

## 한계 / 주의
- TAGO는 전국 표준이지만 **지방 일부 노선 시간표는 미제공**일 수 있습니다(그 경우 화면에 안내 표시).
- "최적 경로" 계산(집→직장 환승 안내)은 포함하지 않습니다. 역별 시간표 **정보 제공**에 초점을 둡니다.
- 그림 노선도(이미지)는 포함하지 않습니다(좌표·노선명 기반).

## 출처
- 역 좌표(시드): 커뮤니티 수집본 gist `jhj0517/9bd253175c4410493af024d5e0a1c01f`
- 역 좌표(공식): 전국도시철도역사정보 표준데이터 (data.go.kr/15013205)
- 시간표: 국토교통부(TAGO) 지하철정보 (data.go.kr/15098554)
