-- 출퇴근 위치 오차(m) 기록
-- 앱이 '정확한 위치'로만 반경을 판정하면서, 그때의 위치 오차도 함께 남긴다.
-- 관리자가 반경 밖 출근을 승인할 때 "정말 밖에 있었는지(오차 작음)" vs "위치가 부정확했는지(오차 큼)"를
-- 구분하고, 나중에 근무지 반경을 더 좁힐지 판단하는 근거로 쓴다. 기존 행은 null(기록 안 됨).
--
-- 여러 번 실행해도 안전(idempotent).

alter table public.records add column if not exists in_accuracy real;   -- 출근 위치 오차(m)
alter table public.records add column if not exists out_accuracy real;  -- 퇴근 위치 오차(m)

-- API(PostgREST)가 새 컬럼을 바로 보게 한다. 못 보면 앱은 오차 없이 저장하고 넘어간다(supabaseApi.upsertRecord).
notify pgrst, 'reload schema';
