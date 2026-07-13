alter table public.records add column if not exists pending boolean not null default false;
alter table public.records add column if not exists approved_by text;
alter table public.records add column if not exists approved_at timestamptz;
drop policy if exists records_admin_update on public.records;
create policy records_admin_update on public.records for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists records_admin_delete on public.records;
create policy records_admin_delete on public.records for delete using (public.is_admin());
