-- ============================================================
-- Схема базы данных для сервиса бронирования переговорок
-- Выполнить в Supabase: Project -> SQL Editor -> New query -> Run
-- ============================================================

-- Расширение для генерации UUID
create extension if not exists "pgcrypto";

-- ---------- Таблица комнат ----------
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity int,
  equipment text,           -- например: "Проектор, доска, видеосвязь"
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Таблица пользователей ----------
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text not null,
  pin_hash text not null,   -- SHA-256 от PIN-кода, хранится не в открытом виде
  created_at timestamptz not null default now(),
  unique (name)
);

-- ---------- Таблица броней ----------
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  purpose text,
  department text not null,
  created_at timestamptz not null default now(),
  constraint valid_time_range check (end_time > start_time)
);

create index if not exists idx_bookings_room_date on bookings(room_id, booking_date);

-- ============================================================
-- Row Level Security (RLS)
-- Инструмент внутренний, поэтому доступ на чтение/запись открыт
-- всем, у кого есть публичный anon-ключ проекта (он и так уходит
-- на фронтенд у любого статического сайта на Supabase).
-- PIN-коды не хранятся в открытом виде, только их SHA-256 хэш.
-- ============================================================

alter table rooms enable row level security;
alter table app_users enable row level security;
alter table bookings enable row level security;

create policy "rooms_select_all" on rooms for select using (true);
create policy "rooms_insert_all" on rooms for insert with check (true);
create policy "rooms_update_all" on rooms for update using (true);
create policy "rooms_delete_all" on rooms for delete using (true);

create policy "users_select_all" on app_users for select using (true);
create policy "users_insert_all" on app_users for insert with check (true);
create policy "users_update_all" on app_users for update using (true);

create policy "bookings_select_all" on bookings for select using (true);
create policy "bookings_insert_all" on bookings for insert with check (true);
create policy "bookings_update_all" on bookings for update using (true);
create policy "bookings_delete_all" on bookings for delete using (true);

-- ---------- Стартовые данные (можно удалить/поменять из админки) ----------
insert into rooms (name, capacity, equipment) values
  ('Переговорка «Ташкент»', 8, 'Проектор, видеосвязь'),
  ('Переговорка «Самарканд»', 4, 'Телевизор, доска')
on conflict do nothing;
