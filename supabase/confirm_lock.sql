-- ============================================================
-- 확인·서명된 주간 잠금 (직원 "안심" 보장)
-- 직원이 이력에서 주간 확인·서명을 하면 그 주(week_start~week_end)의
-- 근무기록(records)·연차(leaves)를 관리자·직원 누구도 앱에서 수정/삭제할 수 없다.
-- 수정하려면 직원 본인이 먼저 서명을 해제(confirmations 행 삭제)해야 한다.
--
-- 적용 대상: 앱을 통한 로그인 사용자(auth.role()='authenticated')만 차단.
--   - 관리자(is_admin) 편집 → 차단  (요구사항의 핵심)
--   - 직원 본인 편집 → 차단  (서명 무결성; 해제하면 다시 편집 가능)
--   - Edge Function(service_role: 직원삭제 등) → 통과
--   - 마이그레이션/DB관리(postgres, role=null) → 통과
-- 여러 번 실행해도 안전.
-- ============================================================

create or replace function public.guard_confirmed_locked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_locked boolean;
  d date;
  u uuid;
begin
  -- 앱 로그인 사용자만 잠금 적용 (service_role/postgres 는 통과)
  if coalesce(auth.role(), '') <> 'authenticated' then
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;

  -- INSERT/UPDATE: 새 위치(new)가 확정 주간이면 차단
  if TG_OP in ('INSERT', 'UPDATE') then
    u := new.user_id; d := new.date;
    select exists (
      select 1 from public.confirmations c
      where c.user_id = u and d between c.week_start and c.week_end
    ) into is_locked;
    if is_locked then
      raise exception '확인·서명된 주간의 기록은 수정할 수 없습니다 (% ). 먼저 [이력]에서 서명을 해제하세요.', d
        using errcode = '42501';
    end if;
  end if;

  -- UPDATE/DELETE: 기존 위치(old)가 확정 주간이면 차단
  if TG_OP in ('UPDATE', 'DELETE') then
    u := old.user_id; d := old.date;
    select exists (
      select 1 from public.confirmations c
      where c.user_id = u and d between c.week_start and c.week_end
    ) into is_locked;
    if is_locked then
      raise exception '확인·서명된 주간의 기록은 수정할 수 없습니다 (% ). 먼저 [이력]에서 서명을 해제하세요.', d
        using errcode = '42501';
    end if;
  end if;

  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_guard_confirmed_records on public.records;
create trigger trg_guard_confirmed_records
  before insert or update or delete on public.records
  for each row execute function public.guard_confirmed_locked();

drop trigger if exists trg_guard_confirmed_leaves on public.leaves;
create trigger trg_guard_confirmed_leaves
  before insert or update or delete on public.leaves
  for each row execute function public.guard_confirmed_locked();
