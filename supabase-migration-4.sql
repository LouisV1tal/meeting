-- ============================================================
-- Миграция №4: видимость постов по отделам, видео/гифки
-- Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run
-- ============================================================

-- visible_departments = null или пустой массив -> видно всем
-- иначе -> видно только тем, чей department входит в массив (+ всегда видно автору)
alter table events add column if not exists visible_departments text[];

-- 'image' | 'video' | null (null — старые посты без файла или только текст)
alter table events add column if not exists media_type text;

-- Увеличиваем лимит размера файла в хранилище фото — видео тяжелее
update storage.buckets set file_size_limit = 26214400 -- 25 МБ
where id = 'event-photos';
