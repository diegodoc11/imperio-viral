"use client";

import { useRouter } from "next/navigation";

export function BackButton({
  fallbackHref = "/posts",
}: {
  fallbackHref?: string;
}) {
  const router = useRouter();

  function handleClick() {
    // Si hay historial en esta pestaña, usa back() — el usuario vuelve a la
    // grilla con sus filtros intactos. Si no (caso raro: abrió el detalle
    // directo), va al fallback.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
    >
      <span>←</span>
      <span>Volver</span>
    </button>
  );
}
