-- ============================================================
-- Миграция №6: справочник отделов (управляется из админки),
-- регистрация теперь выбирает отдел из списка, а не вводит текстом
-- Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run
-- ============================================================

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table departments enable row level security;
create policy "departments_select_all" on departments for select using (true);
create policy "departments_insert_all" on departments for insert with check (true);
create policy "departments_update_all" on departments for update using (true) with check (true);
create policy "departments_delete_all" on departments for delete using (true);

-- Переносим уже существующие названия отделов из app_users, чтобы никого не потерять.
-- Дальше рекомендуется зайти в админку и объединить дубли вроде "Айти"/"IT" вручную:
-- переименовать отдел пользователя на правильный в разделе "Пользователи".
insert into departments (name)
select distinct department from app_users where department is not null and department <> ''
on conflict (name) do nothing;
