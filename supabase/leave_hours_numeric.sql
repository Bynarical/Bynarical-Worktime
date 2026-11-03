-- 관리자는 휴가를 시간 단위 제한 없이 줄 수 있다(전날 야근 보상 1.5시간, 40분 등).
-- hours가 정수 열이라 소수 시간을 저장할 수 없었다 → numeric으로 바꾼다. 기존 값(2/4/6/8)은 그대로.
-- 직원 신청은 앱에서 여전히 2/4/6/8시간 단위만 받는다(lib/leave.ts validateRequest).

alter table public.leaves alter column hours type numeric using hours::numeric;
