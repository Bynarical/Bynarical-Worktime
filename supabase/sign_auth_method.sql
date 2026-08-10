-- ============================================================
-- 주간 확인·서명의 "본인 확인 방식" 기록 (증빙력 보강)
-- 서명 시 비밀번호를 다시 입력받아 Supabase auth 로 검증하면 'PASSWORD',
-- 구버전(이름만 타이핑)은 'NAME' 또는 null.
-- 여러 번 실행해도 안전.
-- ============================================================

alter table public.confirmations
  add column if not exists auth_method text;

comment on column public.confirmations.auth_method is
  '서명 시 본인 확인 방식: PASSWORD=비밀번호 재입력을 서버에서 검증, NAME=이름 타이핑(구버전), null=미기록(구버전)';

-- 값 제약(재실행 안전): 허용값만
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'confirmations_auth_method_chk' and conrelid = 'public.confirmations'::regclass
  ) then
    alter table public.confirmations
      add constraint confirmations_auth_method_chk
      check (auth_method is null or auth_method in ('PASSWORD', 'NAME'));
  end if;
end $$;
