"use client";

import { useAudioPref } from "@/hooks/useAudioPref";

export function AudioToggle() {
  const [enabled, setEnabled] = useAudioPref();

  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      title={
        enabled
          ? "Audio activado en preview (click para silenciar)"
          : "Audio silenciado (click para activar)"
      }
      className={
        "ml-auto flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors " +
        (enabled
          ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40"
          : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:bg-neutral-800")
      }
    >
      <span>{enabled ? "🔊" : "🔇"}</span>
      <span className="hidden md:inline">
        {enabled ? "Audio en hover" : "Sin audio"}
      </span>
    </button>
  );
}
