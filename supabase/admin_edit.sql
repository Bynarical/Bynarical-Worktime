-- 관리자 근태/연차 편집 기능용 RLS 정책.
-- 기존: records admin select/update/delete, leaves admin select/update.
-- 추가: 관리자가 직원 기록을 '추가(insert)'하고, 대신 등록한 연차를 '삭제(취소)'할 수 있게.

-- 근무기록: 관리자 insert 허용 (누락된 날 추가)
drop policy if exists records_admin_insert on public.records;
create policy records_admin_insert on public.records for insert with check (public.is_admin());

-- 연차: 관리자 insert/delete 허용 (대신 등록 / 취소)
drop policy if exists leaves_admin_insert on public.leaves;
create policy leaves_admin_insert on public.leaves for insert with check (public.is_admin());

drop policy if exists leaves_admin_delete on public.leaves;
create policy leaves_admin_delete on public.leaves for delete using (public.is_admin());
