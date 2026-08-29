// Supabase Edge Function: subway-timetable
// 국토교통부(TAGO) 지하철정보 API를 프록시한다. 서비스키를 클라이언트에 노출하지 않고,
// 웹(CORS) 환경에서도 안전하게 역 검색 + 역별 시간표를 조회하기 위한 서버 게이트웨이.
//
// 준비:
//  1) https://www.data.go.kr/data/15098554/openapi.do → "국토교통부(TAGO)_지하철정보" 활용신청 → 서비스키 발급
//  2) Supabase 시크릿 등록:  supabase secrets set SUBWAY_API_KEY="<일반 인증키(Decoding)>"
//  3) 배포:  supabase functions deploy subway-timetable
// (SUPABASE_URL / SUPABASE_ANON_KEY 는 자동 주입됨)
//
// 호출(본문 JSON):
//  { action: "search",   name: "마곡" }
//     → { ok, stations: [{ id, name, route }] }
//  { action: "schedule", stationId: "...", daily?: "01"|"02"|"03", up?: "U"|"D" }
//     → { ok, trains: [{ time, dir, daily, dest, route }] }   // up 생략 시 상·하행 모두
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const BASE = 'https://apis.data.go.kr/1613000/SubwayInfo';

// 응답 값에서 여러 후보 키 중 첫 유효값 (TAGO 필드명이 버전마다 미세하게 다를 수 있어 방어적으로 처리)
function pick(obj: any, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

// "053000" / "05:30:00" / "0530" → "05:30"
function toHM(raw: string): string {
  const s = String(raw).trim();
  if (!s) return '';
  if (s.includes(':')) {
    const [h, m] = s.split(':');
    return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`;
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 4) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  return s;
}

function itemsOf(data: any): any[] {
  // 정상 응답은 resultCode 가 response.header 에, 오류 응답은 최상위 header(또는 cmmMsgHeader)에 온다.
  // 예전엔 response.header 만 봐서 인증오류(예: rc 01 "serviceKey 필수")를 못 잡고 빈 결과로 삼켰다.
  const header = data?.response?.header ?? data?.header;
  const rc = header?.resultCode;
  if (rc && rc !== '00' && rc !== '0') {
    throw new Error(`TAGO ${rc}: ${header?.resultMsg || ''}`);
  }
  const alt = data?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (alt?.returnReasonCode && alt.returnReasonCode !== '00') {
    throw new Error(`TAGO ${alt.returnReasonCode}: ${alt.returnAuthMsg || alt.errMsg || ''}`);
  }
  const items = data?.response?.body?.items;
  if (!items || items === '') return [];
  return Array.isArray(items.item) ? items.item : [items.item];
}


// TAGO 는 혼잡할 때 rc 99 "가용한 세션이 존재하지 않습니다.(30/30)" 처럼 일시적 오류를 낸다.
// 한 번 실패했다고 화면을 비우지 말고 짧게 백오프하며 재시도한다(실측: 4회 중 1회꼴 발생).
function isTransient(msg: string): boolean {
  return (
    /가용한 세션/.test(msg) ||
    /^TAGO (99|04|20|31)/.test(msg) ||
    /응답 파싱 실패/.test(msg) ||
    /HTTP (5\d\d|429)/.test(msg) ||
    /fetch|network|timeout|abort/i.test(msg)
  );
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callTagoOnce(op: string, params: Record<string, string>): Promise<any[]> {
  // numOfRows: 한 역·한 방향의 하루 편성은 200편을 넘는다(2호선 등). 200으로 자르면
  // 저녁 이후 열차와 막차가 통째로 빠지므로 넉넉히 1000으로 받는다.
  const qs = new URLSearchParams({ serviceKey: params.serviceKey, _type: 'json', numOfRows: '1000', pageNo: '1', ...params });
  const res = await fetch(`${BASE}/${op}?${qs.toString()}`);
  const text = await res.text();
  if (!res.ok && !text.trim().startsWith('{')) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`TAGO 응답 파싱 실패(키/승인 확인): ${text.slice(0, 160)}`);
  }
  return itemsOf(data);
}

async function callTago(op: string, params: Record<string, string>): Promise<any[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await callTagoOnce(op, params);
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message || e);
      if (!isTransient(msg) || attempt === 2) throw e;
      await sleep(300 * (attempt + 1) + Math.floor(Math.random() * 200));
    }
  }
  throw lastErr;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const key = Deno.env.get('SUBWAY_API_KEY') || '';
    const authHeader = req.headers.get('Authorization') || '';

    // 로그인한 사용자만 허용(서비스키 남용 방지). 관리자 권한까지는 요구하지 않음.
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: uErr } = await asUser.auth.getUser();
    if (uErr || !userData?.user) return json(200, { ok: false, error: '로그인이 필요합니다.' });

    if (!key) return json(200, { ok: false, error: 'SUBWAY_API_KEY 시크릿이 설정되지 않았습니다. (supabase secrets set SUBWAY_API_KEY=...)' });

    const body = await req.json().catch(() => ({} as any));
    const action = String(body.action || '');

    if (action === 'search') {
      const raw = String(body.name || '').trim();
      if (!raw) return json(200, { ok: false, error: '역 이름이 필요합니다.' });
      // TAGO 키워드 검색은 '역' 접미사가 붙으면 매칭이 안 되므로 끝의 '역'을 뗀다("숭실대입구역"→"숭실대입구").
      const name = raw.replace(/역$/, '') || raw;
      const items = await callTago('GetKwrdFndSubwaySttnList', { serviceKey: key, subwayStationName: name });
      const stations = items
        .map((it) => ({
          id: pick(it, 'subwayStationId', 'subwaySttnId'),
          name: pick(it, 'subwayStationName', 'subwayStationNm', 'subwaySttnNm'),
          route: pick(it, 'subwayRouteName', 'subwayRouteNm', 'routeNm'),
        }))
        .filter((s) => s.id);
      return json(200, { ok: true, stations });
    }

    if (action === 'schedule') {
      const stationId = String(body.stationId || '').trim();
      if (!stationId) return json(200, { ok: false, error: '역 ID가 필요합니다.' });
      const daily = ['01', '02', '03'].includes(String(body.daily)) ? String(body.daily) : '01';
      const dirs: string[] = body.up === 'U' || body.up === 'D' ? [String(body.up)] : ['U', 'D'];

      const loadDaily = async (dt: string) => {
        const out: { time: string; dir: string; daily: string; dest: string; route: string }[] = [];
        for (const up of dirs) {
          const items = await callTago('GetSubwaySttnAcctoSchdulList', {
            serviceKey: key,
            subwayStationId: stationId,
            dailyTypeCode: dt,
            upDownTypeCode: up,
          });
          for (const it of items) {
            const time = toHM(pick(it, 'depTime', 'arrTime', 'depArrivalTime', 'arrivalTime'));
            // TAGO 응답엔 시각이 "0" 같은 쓰레기 행이 섞여 온다(종착 처리 행으로 추정).
            // 그대로 두면 첫차가 "0"으로 표시되므로 HH:MM 형식이 아닌 건 버린다.
            if (!/^\d{2}:\d{2}$/.test(time)) continue;
            out.push({
              time,
              dir: up,
              daily: dt,
              dest: pick(it, 'endSubwayStationNm', 'endSubwayStationName', 'endStationNm', 'endStationName'),
              route: pick(it, 'subwayRouteNm', 'subwayRouteName', 'routeNm'),
            });
          }
        }
        return out;
      };

      let usedDaily = daily;
      let trains = await loadDaily(daily);
      // 수도권 노선은 TAGO에 토요일(02) 시간표가 아예 없다(2026-08 실측: 서울 1~9호선·공항철도 전부 0건,
      // 평일 01 · 휴일 03 은 정상). 토요일에 화면이 통째로 비는 것보다 휴일 시간표를 보여주는 편이 낫다.
      if (!trains.length && daily === '02') {
        const alt = await loadDaily('03');
        if (alt.length) {
          trains = alt;
          usedDaily = '03';
        }
      }
      trains.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
      // daily = 실제로 사용한 요일 코드. 요청과 다르면 클라이언트가 안내 문구를 띄운다.
      return json(200, { ok: true, trains, daily: usedDaily, requestedDaily: daily });
    }

    return json(200, { ok: false, error: `알 수 없는 action: ${action}` });
  } catch (e) {
    return json(200, { ok: false, error: String((e as Error)?.message || e) });
  }
});
