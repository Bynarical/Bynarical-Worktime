-- 위치정보 수집·이용 동의 기록 (최초 출퇴근 전 필수)
create table if not exists public.location_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agreed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  version text
);
alter table public.location_consents enable row level security;
drop policy if exists consents_select on public.location_consents;
-- 본인/관리자 조회. 쓰기는 Edge Function(service_role)만.
create policy consents_select on public.location_consents for select
  using (user_id = auth.uid() or public.is_admin());
