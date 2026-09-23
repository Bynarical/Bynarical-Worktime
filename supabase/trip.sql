-- 출장(외근) 반일 구간 + 관리자 인정(승인)
-- 출장은 위치 검증을 생략하는 근무 형태이고, 이동·현장 사정으로 소정근로를 다 못 채울 수 있다.
-- 그래서 "관리자가 인정(승인)한 출장"에 한해 그 구간(종일 8h / 오전·오후 각 4h)만큼을
-- 근로시간으로 인정해 부족분을 메운다(소정근로를 넘지 않음).
--
-- Supabase SQL Editor에 붙여넣고 Run. 여러 번 실행해도 안전(idempotent).

alter table public.records add column if not exists trip_segment text;   -- FULL | AM | PM
alter table public.records add column if not exists trip_status text;    -- REQUESTED | APPROVED | REJECTED
alter table public.records add column if not exists trip_note text;      -- 출장지·목적
alter table public.records add column if not exists trip_decided_by text;
alter table public.records add column if not exists trip_decided_at timestamptz;

-- 값 검증 (null 허용 = 출장 아님 / 구버전 행)
alter table public.records drop constraint if exists records_trip_segment_check;
alter table public.records add constraint records_trip_segment_check
  check (trip_segment is null or trip_segment in ('FULL', 'AM', 'PM'));

alter table public.records drop constraint if exists records_trip_status_check;
alter table public.records add constraint records_trip_status_check
  check (trip_status is null or trip_status in ('REQUESTED', 'APPROVED', 'REJECTED'));

-- 기존 출장 기록: 구간 미지정 = 종일, 인정 여부 미지정 = 승인 대기.
-- (과거 출장이 자동으로 인정되지 않도록 REQUESTED로 둔다 — 관리자가 확인 후 인정)
update public.records set trip_segment = 'FULL' where type = 'TRIP' and trip_segment is null;
update public.records set trip_status  = 'REQUESTED' where type = 'TRIP' and trip_status is null;

-- 출장 인정 대기 조회용
create index if not exists records_trip_pending_idx on public.records (trip_status) where type = 'TRIP';

-- RLS: 관리자 update 정책(pending.sql)이 이미 있어야 인정 처리가 가능하다. 없으면 함께 생성.
drop policy if exists records_admin_update on public.records;
create policy records_admin_update on public.records for update
  using (public.is_admin()) with check (public.is_admin());

-- 확인
--   select date, user_id, type, trip_segment, trip_status from public.records
--    where type = 'TRIP' order by date desc limit 20;
