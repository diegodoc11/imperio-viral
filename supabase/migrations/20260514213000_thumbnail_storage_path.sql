-- Agrega columna thumbnail_storage_path a posts. Guarda el path relativo
-- dentro del bucket `post-thumbnails`. Para reconstruir URL pública:
--   SUPABASE_URL/storage/v1/object/public/post-thumbnails/<path>
--
-- NULL = no se descargó (post viejo pre-feature o descarga falló).

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS thumbnail_storage_path text;
