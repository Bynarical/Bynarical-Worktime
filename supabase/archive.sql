-- 직원 퇴사 처리: 아카이브(데이터 보존) / 완전 삭제.
-- 아카이브: profiles.archived_at 설정(활성 목록에서 제외, 기록은 증거로 보존). 관리자 update RLS로 처리.
alter table public.profiles add column if not exists archived_at timestamptz;

-- 완전 삭제: auth 사용자 삭제 → profiles/records/leaves/away_logs 등 CASCADE.
-- 클라이언트에서 auth 사용자를 지울 수 없으므로 Edge Function(delete-employee, service_role)로 처리.
-- 배포: supabase functions deploy delete-employee
