-- 직원(관리자 아님)이 앱을 거치지 않고 API를 직접 호출해 스스로 승인·인정하는 것을 막는다.
-- RLS(records_owner_all / leaves_owner_all / profiles_update)는 본인 행 쓰기를 통째로 허용하므로,
-- 로그인 토큰으로 직접 요청하면 휴가를 '승인'으로 넣거나, 출장을 '인정'으로 바꾸거나,
-- 입사일을 고쳐 연차를 늘릴 수 있었다. 앱 화면에서는 원래 불가능한 일들이다.
--
-- 방식은 protect_is_admin·protect_resign과 같다: 막힌 값은 오류 대신 조용히 원래대로 되돌린다.
-- → 앱의 정상 흐름(출퇴근, 휴가 신청·취소, 외출, 미저장 기록 재전송)은 그대로 통과하고 절대 실패하지 않는다.
-- 관리자와 auth.uid()가 없는 호출(service_role·SQL Editor·마이그레이션)은 그대로 통과.
--
-- upsert(INSERT … ON CONFLICT DO UPDATE)는 BEFORE INSERT 트리거가 먼저 돈 뒤 충돌 시 BEFORE UPDATE가 돈다.
-- 이미 있는 id면 INSERT 단계에선 건드리지 않고 UPDATE 단계 규칙으로 판단한다.

-- ---------- 휴가 ----------
--  새 휴가는 '신청'으로만 들어간다(승인 정보는 비움).
--  고칠 수 있는 건 아직 승인 대기 중인 신청뿐이고, 상태는 '신청' 유지 또는 '취소'만.
--  승인·반려된 휴가는 직원이 고치거나 지울 수 없다(지워서 연차를 되돌리는 것 방지).
create or replace function public.guard_employee_leaves()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    if TG_OP = 'DELETE' then return old; end if;
    return new;
  end if;

  if TG_OP = 'INSERT' then
    if exists (select 1 from public.leaves where id = new.id) then return new; end if;
    new.status := 'REQUESTED';
    new.decided_at := null;
    new.decided_by := null;
    new.decision_note := null;
    return new;
  elsif TG_OP = 'UPDATE' then
    if old.status <> 'REQUESTED' then return old; end if;
    if new.status not in ('REQUESTED', 'CANCELED') then new.status := old.status; end if;
    new.decided_by := old.decided_by;
    new.decision_note := old.decision_note;
    return new;
  else
    if old.status not in ('REQUESTED', 'CANCELED') then return null; end if;
    return old;
  end if;
end;
$$;

drop trigger if exists trg_guard_employee_leaves on public.leaves;
create trigger trg_guard_employee_leaves before insert or update or delete on public.leaves
  for each row execute function public.guard_employee_leaves();

-- ---------- 근무기록 ----------
--  출장 인정(APPROVED)·불인정(REJECTED), 근무지 밖 출근 승인(pending 해제·approved_by)은 관리자만.
--  직원은 인정 상태를 그대로 두거나 승인대기/해제로 낮출 수만 있고, 인정된 반일 출장을 종일로 넓힐 수 없다.
--  이미 찍힌 출근 시각과 날짜는 바꿀 수 없고(앱도 다시 쓰지 않는다), 미래 시각은 지금으로 맞춘다.
create or replace function public.guard_employee_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  skew constant interval := interval '5 minutes';
begin
  if auth.uid() is null or public.is_admin() then return new; end if;

  if TG_OP = 'INSERT' then
    if exists (select 1 from public.records where id = new.id) then return new; end if;
    if new.trip_status is not null and new.trip_status <> 'REQUESTED' then new.trip_status := 'REQUESTED'; end if;
    new.trip_decided_by := null;
    new.trip_decided_at := null;
    new.approved_by := null;
    new.approved_at := null;
    if new.check_in > now() + skew then new.check_in := now(); end if;
    if new.check_out > now() + skew then new.check_out := now(); end if;
    return new;
  end if;

  -- UPDATE
  if new.trip_status is distinct from old.trip_status and new.trip_status is not null and new.trip_status <> 'REQUESTED' then
    new.trip_status := old.trip_status;
  end if;
  if new.trip_status = 'APPROVED' and new.trip_segment = 'FULL' and old.trip_segment is distinct from 'FULL' then
    new.trip_segment := old.trip_segment;
  end if;
  if new.trip_decided_by is distinct from old.trip_decided_by and new.trip_decided_by is not null then
    new.trip_decided_by := old.trip_decided_by;
  end if;
  if new.trip_decided_at is distinct from old.trip_decided_at and new.trip_decided_at is not null then
    new.trip_decided_at := old.trip_decided_at;
  end if;
  if old.pending and not coalesce(new.pending, false) then new.pending := true; end if;
  if new.approved_by is distinct from old.approved_by and new.approved_by is not null then
    new.approved_by := old.approved_by;
  end if;
  if new.approved_at is distinct from old.approved_at and new.approved_at is not null then
    new.approved_at := old.approved_at;
  end if;
  new.date := old.date;
  if new.check_in is distinct from old.check_in then
    if old.check_in is not null then
      new.check_in := old.check_in;
    elsif new.check_in > now() + skew then
      new.check_in := now();
    end if;
  end if;
  if new.check_out is distinct from old.check_out and new.check_out > now() + skew then
    new.check_out := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_employee_records on public.records;
create trigger trg_guard_employee_records before insert or update on public.records
  for each row execute function public.guard_employee_records();

-- ---------- 프로필 ----------
--  이름(로그인 ID)·사번·입사일(연차 산정 기준)은 관리자만. 직원 앱은 본인 프로필을 고치지 않는다.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.name := old.name;
    new.emp_no := old.emp_no;
    new.hire_date := old.hire_date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields before update on public.profiles
  for each row execute function public.protect_profile_fields();
