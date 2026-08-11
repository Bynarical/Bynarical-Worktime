// Supabase Edge Function: bus-info
// 국토교통부(TAGO) 버스 API를 프록시한다. 서비스키를 클라이언트에 노출하지 않고,
// 웹(CORS)에서도 근처 정류소 + 실시간 도착정보를 조회하기 위한 서버 게이트웨이.
//
// 사용 API (data.go.kr 활용신청 필요, 인증키는 지하철과 공통):
//   - 버스정류소정보 (15098534) BusSttnInfoInqireService/getCrdntPrxmtSttnList  좌표기반 근접 정류소
//   - 버스도착정보  (15098530) ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList  정류소별 도착예정
// 시크릿: TAGO_API_KEY (없으면 SUBWAY_API_KEY 를 사용 — 같은 포털 인증키)
//
// ⚠ TAGO 버스에는 서울특별시가 없다(도시코드 목록에 미포함). 서울 구간은 추후
//   서울 열린데이터광장(TOPIS) 키를 SEOUL_BUS_API_KEY 로 넣고 아래 TODO에 추가.
//
// 호출(본문 JSON):
//   { action: "stops",    lat: 37.6749, lng: 126.7723 }
//     → { ok, stops: [{ nodeId, cityCode, name, no, lat, lng, distance }] }
//   { action: "arrivals", cityCode: 31100, nodeId: "GGB219000113" }
//     → { ok, arrivals: [{ routeNo, routeType, vehicleType, prevStops, etaSec, routeId }] }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const BASE = 'https://apis.data.go.kr/1613000';

function pick(obj: any, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}
function num(obj: any, ...keys: string[]): number {
  const v = pick(obj, ...keys);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 정상 응답은 resultCode 가 response.header 에, 오류 응답은 최상위 header(또는 cmmMsgHeader)에 온다.
// (지하철 함수와 동일 — response.header 만 보면 인증오류를 빈 결과로 삼켜버린다)
function itemsOf(data: any): any[] {
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

async function callTago(service: string, op: string, params: Record<string, string>): Promise<any[]> {
  const qs = new URLSearchParams({ _type: 'json', numOfRows: '30', pageNo: '1', ...params });
  const res = await fetch(`${BASE}/${service}/${op}?${qs.toString()}`);
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`TAGO 응답 파싱 실패(키/승인 확인): ${text.slice(0, 160)}`);
  }
  return itemsOf(data);
}

// 두 좌표 사이 거리(m)
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const key = Deno.env.get('TAGO_API_KEY') || Deno.env.get('SUBWAY_API_KEY') || '';
    const authHeader = req.headers.get('Authorization') || '';

    // 로그인한 사용자만 허용(서비스키 남용 방지)
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: uErr } = await asUser.auth.getUser();
    if (uErr || !userData?.user) return json(200, { ok: false, error: '로그인이 필요합니다.' });

    if (!key) {
      return json(200, {
        ok: false,
        error: 'TAGO_API_KEY(또는 SUBWAY_API_KEY) 시크릿이 설정되지 않았습니다.',
      });
    }

    const body = await req.json().catch(() => ({} as any));
    const action = String(body.action || '');

    // ---- 근처 정류소 ----
    if (action === 'stops') {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return json(200, { ok: false, error: '좌표(lat/lng)가 필요합니다.' });
      }
      const items = await callTago('BusSttnInfoInqireService', 'getCrdntPrxmtSttnList', {
        serviceKey: key,
        gpsLati: String(lat),
        gpsLong: String(lng),
      });
      const stops = items
        .map((it) => {
          const sLat = num(it, 'gpslati');
          const sLng = num(it, 'gpslong');
          return {
            nodeId: pick(it, 'nodeid'),
            cityCode: num(it, 'citycode'),
            name: pick(it, 'nodenm'),
            no: pick(it, 'nodeno'),
            lat: sLat,
            lng: sLng,
            distance: Math.round(distanceMeters({ lat, lng }, { lat: sLat, lng: sLng })),
          };
        })
        .filter((s) => s.nodeId && s.cityCode)
        .sort((a, b) => a.distance - b.distance);
      // TODO(서울): TAGO에 서울이 없으므로, SEOUL_BUS_API_KEY 가 있으면 TOPIS
      // getStationByPos 결과를 여기에 합쳐서 반환한다.
      return json(200, { ok: true, stops });
    }

    // ---- 정류소별 실시간 도착 ----
    if (action === 'arrivals') {
      const cityCode = String(body.cityCode || '').trim();
      const nodeId = String(body.nodeId || '').trim();
      if (!cityCode || !nodeId) return json(200, { ok: false, error: '정류소 정보(cityCode/nodeId)가 필요합니다.' });
      const items = await callTago('ArvlInfoInqireService', 'getSttnAcctoArvlPrearngeInfoList', {
        serviceKey: key,
        cityCode,
        nodeId,
      });
      const arrivals = items
        .map((it) => ({
          routeId: pick(it, 'routeid'),
          routeNo: pick(it, 'routeno'),
          routeType: pick(it, 'routetp'),
          vehicleType: pick(it, 'vehicletp'),
          prevStops: num(it, 'arrprevstationcnt'),
          etaSec: num(it, 'arrtime'),
        }))
        .filter((a) => a.routeNo)
        .sort((a, b) => a.etaSec - b.etaSec);
      return json(200, { ok: true, arrivals });
    }

    return json(200, { ok: false, error: `알 수 없는 action: ${action}` });
  } catch (e) {
    return json(200, { ok: false, error: String((e as Error)?.message || e) });
  }
});
