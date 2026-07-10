-- ============================================================
-- Миграция №3: теги для карточек, комментарии к постам, realtime
-- Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run
-- ============================================================

-- ---------- Цветовой тег для постов доски событий ----------
alter table events add column if not exists tag text; -- 'news' | 'important' | 'holiday' | 'social' | null

-- ---------- Комментарии к постам доски событий ----------
create table if not exists event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_comments_event on event_comments(event_id);

alter table event_comments enable row level security;
create policy "event_comments_select_all" on event_comments for select using (true);
create policy "event_comments_insert_all" on event_comments for insert with check (true);
create policy "event_comments_delete_all" on event_comments for delete using (true);

-- ============================================================
-- Realtime: включаем публикацию изменений для нужных таблиц,
-- чтобы страницы обновлялись сами при чужих действиях.
-- Обёрнуто в DO-блоки, чтобы повторный запуск миграции не падал
-- с ошибкой "уже добавлено в публикацию".
-- ============================================================

do $$
begin
  alter publication supabase_realtime add table bookings;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table booking_comments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table events;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table event_comments;
exception when duplicate_object then null;
end $$;
