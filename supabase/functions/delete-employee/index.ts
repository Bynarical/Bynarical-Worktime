// Supabase Edge Function: delete-employee
// 관리자만 직원 계정을 영구 삭제한다. auth 사용자 삭제 → 프로필·근태·연차 등 CASCADE 삭제.
// 배포: supabase functions deploy delete-employee
// 환경변수(SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)는 자동 주입됨.
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

    // 1) 호출자 신원 확인
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: uErr } = await asUser.auth.getUser();
    if (uErr || !userData?.user) return json(200, { ok: false, error: '로그인이 필요합니다.' });

    // 2) 호출자 관리자 여부 확인
    const admin = createClient(url, service);
    const { data: caller } = await admin.from('profiles').select('is_admin').eq('id', userData.user.id).single();
    if (!caller?.is_admin) return json(200, { ok: false, error: '관리자만 직원을 삭제할 수 있습니다.' });

    // 3) 대상 검증
    const body = await req.json().catch(() => ({}));
    const targetId = String(body.userId || '').trim();
    if (!targetId) return json(200, { ok: false, error: '대상이 지정되지 않았습니다.' });
    if (targetId === userData.user.id) return json(200, { ok: false, error: '본인 계정은 삭제할 수 없습니다.' });

    const { data: target } = await admin.from('profiles').select('is_admin').eq('id', targetId).single();
    if (target?.is_admin) return json(200, { ok: false, error: '관리자 계정은 삭제할 수 없습니다. 먼저 관리자 권한을 해제하세요.' });

    // 4) 삭제 (auth 사용자 삭제 → CASCADE)
    const { error } = await admin.auth.admin.deleteUser(targetId);
    if (error) return json(200, { ok: false, error: error.message });
    return json(200, { ok: true });
  } catch (e) {
    return json(200, { ok: false, error: String(e) });
  }
});
