-- 이상징후 '관리자 확인' 기록 — 지각·코어타임 미충족·근로부족·퇴근 미기록을
-- 관리자가 확인한 날짜를 남겨서, 확인한 건은 경고 표시에서 조용해지게 한다.
-- (근태점수·월 집계 숫자는 그대로 유지 — 표시만 가라앉히는 용도)
--
-- Supabase SQL Editor에 붙여넣고 Run. 여러 번 실행해도 안전(idempotent).

create table if not exists public.anomaly_reviews (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade, -- 대상 직원
  date date not null,
  reviewed_by text,   -- 확인한 관리자 이름(표시용)
  reviewed_at timestamptz default now(),
  note text,
  unique (user_id, date)
);

create index if not exists anomaly_reviews_user_date_idx on public.anomaly_reviews (user_id, date);

alter table public.anomaly_reviews enable row level security;

-- 정책 재실행 안전: 기존 정책 제거 후 생성
do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'anomaly_reviews'
  loop
    execute format('drop policy if exists %I on public.anomaly_reviews', r.policyname);
  end loop;
end $$;

-- 관리자 전용 (직원 화면에서는 쓰지 않는다)
create policy anomaly_reviews_admin_select on public.anomaly_reviews for select
  using (public.is_admin());
create policy anomaly_reviews_admin_insert on public.anomaly_reviews for insert
  with check (public.is_admin());
create policy anomaly_reviews_admin_update on public.anomaly_reviews for update
  using (public.is_admin()) with check (public.is_admin());
create policy anomaly_reviews_admin_delete on public.anomaly_reviews for delete
  using (public.is_admin());

-- 확인
--   select * from public.anomaly_reviews order by reviewed_at desc limit 20;
