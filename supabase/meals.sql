-- 저녁식대(야근 대체 · 법인카드) 기록. 하루 1건, 한도 20,000원.
create table if not exists public.meal_allowances (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  amount integer not null default 0,
  note text,
  created_at timestamptz default now(),
  unique (user_id, date)
);
alter table public.meal_allowances enable row level security;
drop policy if exists meals_owner_all on public.meal_allowances;
drop policy if exists meals_admin_select on public.meal_allowances;
create policy meals_owner_all on public.meal_allowances for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy meals_admin_select on public.meal_allowances for select
  using (public.is_admin());
