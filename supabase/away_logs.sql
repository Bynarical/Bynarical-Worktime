-- 관리자가 기록하는 '자리비움'(무단 이석) 로그. 근태 점수에 감점으로 반영.
create table if not exists public.away_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  start_time text,       -- 'HH:MM' (선택)
  end_time text,         -- 'HH:MM' (선택)
  minutes integer not null default 0,  -- 자리 비운 시간(분)
  note text,
  created_by text,
  created_at timestamptz default now()
);

alter table public.away_logs enable row level security;

-- 본인 조회 + 관리자 조회
drop policy if exists away_select on public.away_logs;
create policy away_select on public.away_logs for select using (user_id = auth.uid() or public.is_admin());
-- 쓰기(추가/수정/삭제)는 관리자만
drop policy if exists away_admin_write on public.away_logs;
create policy away_admin_write on public.away_logs for all using (public.is_admin()) with check (public.is_admin());

-- 실시간 불필요
