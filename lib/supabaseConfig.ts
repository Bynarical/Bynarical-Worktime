// Supabase 연결 정보.
// 대시보드 → Project Settings → API 에서 복사:
//   - Project URL             → SUPABASE_URL (rest/v1 경로 없이 base URL)
//   - Publishable/anon 키      → SUPABASE_ANON_KEY  (공개 가능, RLS로 보호)
//
// ⚠️ publishable(anon) 키만 넣습니다. secret 키나 DB 비밀번호는 절대 앱에 넣지 마세요.
export const SUPABASE_URL = 'https://dorkgmmvbmdunahewwgi.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_01cc3klOvQOEFka895NwBQ_qz4WT4ab';

export const isSupabaseConfigured =
  /^https:\/\/.+\.supabase\.co/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
