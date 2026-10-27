-- 퇴사일(마지막 근무일). 근태 점수의 결근·출근율, 연차 발생(80% 판정 포함)은 이 날까지만 센다.
-- archived_at(활성 목록에서 숨김)과 따로 두는 이유: 아카이브를 복구해도 퇴사일은 남아서,
-- 퇴사일 다음 날부터 복구한 날까지가 통째로 결근으로 잡히지 않게 하기 위해서다.
-- 계속 근무(재입사)하는 경우에만 관리자가 퇴사일을 지운다.
alter table public.profiles add column if not exists resign_date date;

-- 이미 아카이브된 직원: 아카이브한 날까지의 마지막 출퇴근 기록·승인 휴가일을 퇴사일로 채운다
-- (둘 다 없으면 아카이브한 날, KST). 다르면 관리자가 직원 관리 화면에서 고친다.
update public.profiles p
set resign_date = coalesce(
  (
    select max(d) from (
      select r.date as d from public.records r
      where r.user_id = p.id and r.date <= (p.archived_at at time zone 'Asia/Seoul')::date
      union all
      select l.date from public.leaves l
      where l.user_id = p.id and l.status = 'APPROVED' and l.date <= (p.archived_at at time zone 'Asia/Seoul')::date
    ) x
  ),
  (p.archived_at at time zone 'Asia/Seoul')::date
)
where p.archived_at is not null and p.resign_date is null;

-- 보안: 퇴사일·아카이브는 관리자만 변경 (직원이 본인 프로필 수정으로 집계 구간을 바꾸는 것 방지).
-- auth.uid()가 없는 호출(service_role·SQL Editor·마이그레이션)은 그대로 통과시킨다.
create or replace function public.protect_resign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.resign_date := old.resign_date;
    new.archived_at := old.archived_at;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_resign on public.profiles;
create trigger trg_protect_resign before update on public.profiles
  for each row execute function public.protect_resign();
