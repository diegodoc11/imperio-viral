"use client";

import { useState } from "react";
import type { PostListItem } from "@/lib/queries";
import { imgProxy } from "@/lib/img";

export function MediaViewer({ post }: { post: PostListItem }) {
  if (post.type === "Video" && post.videoUrl) {
    // Los videos no se proxyean (son pesados, browser sí los puede pedir
    // directo). Si IG bloquea, el usuario verá un fallback de <video>.
    return (
      <video
        src={post.videoUrl}
        poster={imgProxy(post.displayUrl ?? undefined)}
        controls
        playsInline
        className="aspect-[9/16] max-h-[80vh] w-full rounded-lg bg-black object-contain"
      />
    );
  }

  if (post.type === "Sidecar" && post.images.length > 0) {
    return <Carousel images={post.images} />;
  }

  const url =
    post.displayUrl ?? (post.images.length > 0 ? post.images[0] : null);
  if (url) {
    return (
      <img
        src={imgProxy(url)}
        alt=""
        className="aspect-square max-h-[80vh] w-full rounded-lg bg-black object-contain"
      />
    );
  }

  return (
    <div className="flex aspect-square items-center justify-center rounded-lg bg-neutral-900 text-neutral-500">
      Sin medios disponibles
    </div>
  );
}

function Carousel({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0);
  return (
    <div className="relative aspect-square max-h-[80vh] w-full overflow-hidden rounded-lg bg-black">
      <img
        key={idx}
        src={imgProxy(images[idx])}
        alt=""
        className="h-full w-full object-contain"
      />

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white hover:bg-black/80"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setIdx((i) => (i + 1) % images.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white hover:bg-black/80"
            aria-label="Siguiente"
          >
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/60 px-2 py-1">
            {images.map((_, i) => (
              <span
                key={i}
                className={
                  "block h-1.5 w-1.5 rounded-full " +
                  (i === idx ? "bg-white" : "bg-white/40")
                }
              />
            ))}
          </div>
          <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            {idx + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
}
