-- 휴가 종류(category) 컬럼 정리 — 무급휴가(UNPAID) 추가.
-- Supabase SQL Editor에 그대로 붙여넣고 Run. 몇 번 실행해도 안전(idempotent).
--
--   ANNUAL = 연차       (연차 잔여 차감)
--   PAID   = 유급휴가   (예비군·공가·경조사·병가 등 / 잔여 차감 없음, 급여 지급)
--   UNPAID = 무급휴가   (잔여 차감 없음, 그 시간만큼 급여 미지급)
--
-- 앱은 이 값들만 쓰며, 값이 비어 있는 옛 행은 ANNUAL로 본다.

-- 1) 컬럼 (이미 있으면 그대로)
alter table public.leaves add column if not exists category text;

-- 2) 빈 값 보정 후 기본값·NOT NULL
update public.leaves set category = 'ANNUAL' where category is null or btrim(category) = '';
alter table public.leaves alter column category set default 'ANNUAL';
alter table public.leaves alter column category set not null;

-- 3) 허용값 제약을 UNPAID 포함으로 교체
--    (예전에 ANNUAL/PAID만 허용하는 제약이 있었다면 이 단계에서 풀린다)
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    where ns.nspname = 'public' and cl.relname = 'leaves' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table public.leaves drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.leaves
  add constraint leaves_category_check check (category in ('ANNUAL', 'PAID', 'UNPAID'));

-- 4) 확인
--   select category, count(*) from public.leaves group by 1 order by 1;
