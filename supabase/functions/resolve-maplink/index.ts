// Supabase Edge Function: resolve-maplink
// 구글맵 앱 단축링크(maps.app.goo.gl 등)는 좌표가 없고 리다이렉트만 한다. 웹은 CORS로 클라이언트가
// 직접 못 따라가므로, 서버에서 리다이렉트를 따라가 최종 URL/본문에서 좌표를 추출해 돌려준다.
// 배포: supabase functions deploy resolve-maplink
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const N = '(-?\\d{1,3}\\.\\d+)';
const SEP = '(?:,|%2C)\\+?\\s*'; // 콤마(또는 %2C) + 선택적 '+' 또는 공백 (구글맵 /search/lat,+lng 대응)
const PATTERNS = [
  new RegExp(`!3d${N}!4d${N}`),
  new RegExp(`@${N}${SEP}${N}`),
  new RegExp(`/(?:search|place|dir)/${N}${SEP}${N}`),
  new RegExp(`[?&]q=loc:${N}${SEP}${N}`),
  new RegExp(`[?&](?:q|ll|center|destination|daddr|saddr|sll)=${N}${SEP}${N}`),
  new RegExp(`${N}${SEP}${N}`),
];
function extractCoords(text: string): { lat: number; lng: number } | null {
  for (const re of PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    return { lat, lng };
  }
  return null;
}

// SSRF 방지: 구글맵/단축 도메인만 허용
function allowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return ['goo.gl', 'google.com', 'g.co', 'google.co.kr'].some((d) => h === d || h.endsWith('.' + d));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: uErr } = await asUser.auth.getUser();
    if (uErr || !userData?.user) return json(200, { ok: false, error: '로그인이 필요합니다.' });

    const body = await req.json().catch(() => ({} as { url?: string }));
    const raw = String(body.url || '').trim();
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return json(200, { ok: false, error: '올바른 링크가 아닙니다.' });
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return json(200, { ok: false, error: 'http(s) 링크만 지원합니다.' });
    if (!allowedHost(target.hostname)) return json(200, { ok: false, error: '구글맵 링크만 지원합니다.' });

    // 링크 자체에 좌표가 있으면 바로
    const inUrl = extractCoords(raw);
    if (inUrl) return json(200, { ok: true, lat: inUrl.lat, lng: inUrl.lng, via: 'url' });

    // 리다이렉트 따라가기 (Deno fetch 기본 follow). 모바일 UA로 요청해야 좌표 URL로 잘 리다이렉트됨.
    const res = await fetch(raw, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' },
    });
    const finalUrl = res.url || '';
    let coords = extractCoords(finalUrl);
    if (!coords) {
      const text = (await res.text()).slice(0, 200000);
      coords = extractCoords(text);
    }
    if (!coords) return json(200, { ok: false, error: '링크에서 좌표를 찾지 못했습니다. 지도에서 핀을 찍고 공유한 링크인지 확인해 주세요.' });
    return json(200, { ok: true, lat: coords.lat, lng: coords.lng, resolved: finalUrl.slice(0, 200) });
  } catch (e) {
    return json(200, { ok: false, error: String((e as Error)?.message || e) });
  }
});
