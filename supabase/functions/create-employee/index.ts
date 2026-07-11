// Supabase Edge Function: create-employee
// 관리자만 신규 직원 계정을 생성한다. (공개 가입 OFF 상태에서도 동작 — service_role 사용)
// 배포: 대시보드 Edge Functions 또는 CLI `supabase functions deploy create-employee`
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

    // 2) 관리자 여부 확인 (service 권한으로 조회)
    const admin = createClient(url, service);
    const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', userData.user.id).single();
    if (!prof?.is_admin) return json(200, { ok: false, error: '관리자만 직원을 등록할 수 있습니다.' });

    // 3) 입력 검증
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();
    const emp_no = String(body.emp_no || '').trim();
    const hire_date = String(body.hire_date || '').trim();
    if (!name) return json(200, { ok: false, error: '이름을 입력하세요.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(200, { ok: false, error: '올바른 이메일을 입력하세요.' });
    if (password.length < 6) return json(200, { ok: false, error: '초기 비밀번호는 6자 이상이어야 합니다.' });

    // 동명이인 방지 (이름으로 로그인하므로 유일해야 함)
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('name', name);
    if ((count || 0) > 0) return json(200, { ok: false, error: '같은 이름의 직원이 이미 있습니다. 이름을 구분해서 입력하세요.' });

    // 4) 계정 생성 (이메일 확인 없이 즉시 사용 가능). 프로필은 트리거가 생성.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, emp_no, hire_date },
    });
    if (error) return json(200, { ok: false, error: error.message });
    return json(200, { ok: true, id: data.user?.id });
  } catch (e) {
    return json(200, { ok: false, error: String(e) });
  }
});
