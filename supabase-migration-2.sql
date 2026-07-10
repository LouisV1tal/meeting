-- ============================================================
-- Миграция №2: комментарии, повторяющиеся брони, доска событий
-- Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run
-- (можно выполнять на уже работающей базе, ничего не удаляет)
-- ============================================================

-- ---------- Повторяющиеся брони ----------
alter table bookings add column if not exists recurrence_id uuid;
alter table bookings add column if not exists recurrence_rule text; -- 'daily' | 'weekly' | 'yearly' | null

create index if not exists idx_bookings_recurrence on bookings(recurrence_id);

-- ---------- Комментарии к брони ----------
create table if not exists booking_comments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_booking on booking_comments(booking_id);

alter table booking_comments enable row level security;
create policy "comments_select_all" on booking_comments for select using (true);
create policy "comments_insert_all" on booking_comments for insert with check (true);
create policy "comments_delete_all" on booking_comments for delete using (true);

-- ---------- Доска событий ----------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  text text,
  photo_url text,
  created_at timestamptz not null default now()
);

alter table events enable row level security;
create policy "events_select_all" on events for select using (true);
create policy "events_insert_all" on events for insert with check (true);
create policy "events_delete_all" on events for delete using (true);

-- ---------- Хранилище фото для доски событий ----------
insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', true)
on conflict (id) do nothing;

create policy "event_photos_public_select" on storage.objects
  for select using (bucket_id = 'event-photos');

create policy "event_photos_public_insert" on storage.objects
  for insert with check (bucket_id = 'event-photos');

create policy "event_photos_public_delete" on storage.objects
  for delete using (bucket_id = 'event-photos');
