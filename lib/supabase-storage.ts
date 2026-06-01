// Cliente de Supabase Storage para guardar thumbnails de posts.
// Usa el service_role_key (bypass RLS). NUNCA importar desde código que
// corre en el browser — solo server-side (scripts, API routes server).

import { createClient } from "@supabase/supabase-js";

const BUCKET = "post-thumbnails";

declare global {
  // eslint-disable-next-line no-var
  var __supabaseStorageClient: ReturnType<typeof createClient> | undefined;
}

function getClient() {
  if (!global.__supabaseStorageClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar en .env"
      );
    }
    global.__supabaseStorageClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return global.__supabaseStorageClient;
}

// Construye la URL pública de un objeto. No requiere request al server.
// El bucket está marcado público, así que cualquier cliente puede leer.
export function publicUrlFor(path: string): string {
  const base = process.env.SUPABASE_URL;
  if (!base) throw new Error("SUPABASE_URL no está en .env");
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

// Descarga una imagen desde una URL de IG y la sube al bucket.
// Devuelve el path almacenado o null si algo falla (no lanza — el caller
// decide qué hacer si no hay thumbnail).
export async function downloadAndStoreImage(
  sourceUrl: string,
  destPath: string
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      // 403 esperado para URLs que ya caducaron. Logueamos compacto.
      console.warn(`  ⚠ thumbnail fetch ${res.status} para ${destPath}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "image/jpeg";

    const { error } = await getClient()
      .storage.from(BUCKET)
      .upload(destPath, buf, {
        contentType,
        upsert: true, // sobrescribir si ya existía (re-scrape del mismo post)
        cacheControl: "86400",
      });

    if (error) {
      console.warn(`  ⚠ thumbnail upload error para ${destPath}: ${error.message}`);
      return null;
    }

    return destPath;
  } catch (e: any) {
    console.warn(`  ⚠ thumbnail unexpected error para ${destPath}: ${e.message}`);
    return null;
  }
}
