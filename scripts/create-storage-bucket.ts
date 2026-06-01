// Crea el bucket post-thumbnails en Supabase Storage vía SQL directo.
// No necesita service_role_key porque pegamos a Postgres con DATABASE_URL.
// El bucket queda público (cualquier lector puede ver imágenes con la URL).

import "dotenv/config";
import { query, getPool } from "../lib/db";

(async () => {
  console.log("→ Verificando si el bucket ya existe...");
  const existing = await query<{ id: string; public: boolean }>(
    `SELECT id, public FROM storage.buckets WHERE id = 'post-thumbnails'`
  );

  if (existing.length > 0) {
    console.log(`  Ya existe (public=${existing[0].public}). No hago nada.`);
    await getPool().end();
    return;
  }

  console.log("→ Creando bucket 'post-thumbnails' (público)...");
  await query(
    `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
     VALUES ('post-thumbnails', 'post-thumbnails', true, 52428800, ARRAY['image/jpeg','image/png','image/webp'])`
  );

  console.log("→ Configurando policy de lectura pública...");
  // Si bucket.public = true, anónimo puede leer. Pero igual creamos la policy
  // explícita para que sea evidente al revisar la config.
  await query(
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'storage'
           AND tablename = 'objects'
           AND policyname = 'public_read_post_thumbnails'
       ) THEN
         CREATE POLICY "public_read_post_thumbnails"
           ON storage.objects FOR SELECT
           USING (bucket_id = 'post-thumbnails');
       END IF;
     END $$`
  );

  console.log("✓ Bucket creado y listo.");
  await getPool().end();
})();
