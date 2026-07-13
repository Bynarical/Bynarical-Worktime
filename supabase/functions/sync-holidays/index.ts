// Supabase Edge Function: sync-holidays
// 공공데이터포털(한국천문연구원) 특일정보 API에서 대한민국 공휴일(국경일·공휴일·대체공휴일·임시공휴일/선거일 등
// 법정 공휴일)을 가져와 public.company_holidays 에 upsert 한다. 관리자만 호출 가능.
//
// 준비:
//  1) https://www.data.go.kr → "특일 정보" (한국천문연구원_특일 정보) 활용신청 → 서비스키 발급
//  2) Supabase에 시크릿 등록:  supabase secrets set HOLIDAY_API_KEY="<발급받은 일반 인증키(Decoding)>"
//  3) 배포:  supabase functions deploy sync-holidays
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 자동 주입됨)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const API = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

function toDayStr(locdate: number | string): string {
  const s = String(locdate);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

async function fetchMonth(key: string, year: number, month: number): Promise<{ day: string; name: string }[]> {
  const qs = new URLSearchParams({
    serviceKey: key,
    solYear: String(year),
    solMonth: String(month).padStart(2, '0'),
    numOfRows: '100',
    _type: 'json',
  });
  const res = await fetch(`${API}?${qs.toString()}`);
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`API 응답 파싱 실패(키/승인 확인): ${text.slice(0, 200)}`);
  }
  const header = data?.response?.header;
  if (header && header.resultCode && header.resultCode !== '00') {
    throw new Error(`API 오류 ${header.resultCode}: ${header.resultMsg || ''}`);
  }
  const items = data?.response?.body?.items;
  if (!items || items === '') return [];
  const arr = Array.isArray(items.item) ? items.item : [items.item];
  return arr
    .filter((it: any) => it && (it.isHoliday === 'Y' || it.isHoliday === undefined))
    .map((it: any) => ({ day: toDayStr(it.locdate), name: String(it.dateName || '공휴일') }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const key = Deno.env.get('HOLIDAY_API_KEY') || '';
    const authHeader = req.headers.get('Authorization') || '';

    // 1) 호출자 신원 + 관리자 확인
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: uErr } = await asUser.auth.getUser();
    if (uErr || !userData?.user) return json(200, { ok: false, error: '로그인이 필요합니다.' });
    const admin = createClient(url, service);
    const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', userData.user.id).single();
    if (!prof?.is_admin) return json(200, { ok: false, error: '관리자만 공휴일을 동기화할 수 있습니다.' });

    if (!key) return json(200, { ok: false, error: 'HOLIDAY_API_KEY 시크릿이 설정되지 않았습니다. (supabase secrets set HOLIDAY_API_KEY=...)' });

    // 2) 연도 범위 결정
    const body = await req.json().catch(() => ({} as any));
    const fromYear = Number(body.fromYear) || Number(body.year) || new Date().getFullYear();
    const toYear = Number(body.toYear) || fromYear;
    if (toYear < fromYear || toYear - fromYear > 5) return json(200, { ok: false, error: '연도 범위가 올바르지 않습니다(최대 6년).' });

    // 3) 월별 조회 → 수집
    const rows: { day: string; name: string }[] = [];
    for (let y = fromYear; y <= toYear; y++) {
      for (let mo = 1; mo <= 12; mo++) {
        const got = await fetchMonth(key, y, mo);
        rows.push(...got);
      }
    }

    // 4) upsert
    if (rows.length > 0) {
      const dedup = new Map<string, string>();
      rows.forEach((r) => dedup.set(r.day, r.name));
      const payload = [...dedup.entries()].map(([day, name]) => ({ day, name }));
      const { error } = await admin.from('company_holidays').upsert(payload, { onConflict: 'day' });
      if (error) return json(200, { ok: false, error: error.message });
    }

    return json(200, { ok: true, count: rows.length, fromYear, toYear });
  } catch (e) {
    return json(200, { ok: false, error: String((e as Error)?.message || e) });
  }
});
