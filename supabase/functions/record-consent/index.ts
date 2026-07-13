// Supabase Edge Function: record-consent
// 위치정보 수집·이용 동의를 기록한다. 클라이언트가 아니라 서버가 요청 헤더에서 IP를 캡처해 신뢰성을 확보한다.
// 배포: supabase functions deploy record-consent
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';

    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: uErr } = await asUser.auth.getUser();
    if (uErr || !userData?.user) return json(200, { ok: false, error: '로그인이 필요합니다.' });

    const body = await req.json().catch(() => ({} as any));
    const version = String(body.version || 'v1');

    // 요청 헤더에서 클라이언트 IP 캡처 (프록시 체인의 첫 IP)
    const fwd = req.headers.get('x-forwarded-for') || '';
    const ip = (fwd.split(',')[0] || req.headers.get('x-real-ip') || '').trim() || null;
    const ua = req.headers.get('user-agent') || null;

    const admin = createClient(url, service);
    const { error } = await admin.from('location_consents').upsert(
      { user_id: userData.user.id, agreed_at: new Date().toISOString(), ip, user_agent: ua, version },
      { onConflict: 'user_id' }
    );
    if (error) return json(200, { ok: false, error: error.message });
    return json(200, { ok: true, ip, version });
  } catch (e) {
    return json(200, { ok: false, error: String((e as Error)?.message || e) });
  }
});
