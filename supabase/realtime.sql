-- 연차 신청/승인 실시간 알림용: leaves 테이블을 Realtime publication에 추가.
-- RLS가 그대로 적용되어 관리자는 전체, 직원은 본인 것만 실시간 수신한다.
-- replica identity full → UPDATE 시 이전 값(old)도 전달(상태 변화 판별용).

alter publication supabase_realtime add table public.leaves;
alter table public.leaves replica identity full;
