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
  const header = data?.response?.header;
  if (header && header.resultCode && header.resultCode !== '00' && header.resultCode !== '0') {
    throw new Error(`TAGO 오류 ${header.resultCode}: ${header.resultMsg || ''}`);
  }
  const items = data?.response?.body?.items;
  if (!items || items === '') return [];
  return Array.isArray(items.item) ? items.item : [items.item];
}

async function callTago(op: string, params: Record<string, string>): Promise<any[]> {
  const qs = new URLSearchParams({ serviceKey: params.serviceKey, _type: 'json', numOfRows: '200', pageNo: '1', ...params });
  const res = await fetch(`${BASE}/${op}?${qs.toString()}`);
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`TAGO 응답 파싱 실패(키/승인 확인): ${text.slice(0, 160)}`);
  }
  return itemsOf(data);
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
      const trains: { time: string; dir: string; daily: string; dest: string; route: string }[] = [];
      for (const up of dirs) {
        const items = await callTago('GetSubwaySttnAcctoSchdulList', {
          serviceKey: key,
          subwayStationId: stationId,
          dailyTypeCode: daily,
          upDownTypeCode: up,
        });
        for (const it of items) {
          const time = toHM(pick(it, 'depTime', 'arrTime', 'depArrivalTime', 'arrivalTime'));
          if (!time) continue;
          trains.push({
            time,
            dir: up,
            daily,
            dest: pick(it, 'endSubwayStationNm', 'endSubwayStationName', 'endStationNm', 'endStationName'),
            route: pick(it, 'subwayRouteNm', 'subwayRouteName', 'routeNm'),
          });
        }
      }
      trains.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
      return json(200, { ok: true, trains });
    }

    return json(200, { ok: false, error: `알 수 없는 action: ${action}` });
  } catch (e) {
    return json(200, { ok: false, error: String((e as Error)?.message || e) });
  }
});
