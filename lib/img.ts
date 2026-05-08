// Transforma una URL de Instagram CDN en una URL del proxy local.
// Otras URLs (no IG) se devuelven tal cual.
export function imgProxy(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!/cdninstagram\.com|fbcdn\.net/i.test(url)) return url;
  return `/api/img?url=${encodeURIComponent(url)}`;
}
