// Supabase 연결 정보.
// 대시보드 → Project Settings → API 에서 복사:
//   - Project URL           → SUPABASE_URL
//   - Project API keys > anon public → SUPABASE_ANON_KEY
//
// ⚠️ anon(public) 키만 넣습니다. 이 키는 공개돼도 안전하며 RLS로 보호됩니다.
//    service_role 키나 DB 비밀번호는 절대 앱에 넣지 마세요.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

export const isSupabaseConfigured =
  /^https:\/\/.+\.supabase\.co/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
