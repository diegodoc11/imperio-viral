"use client";

import { useEffect, useState } from "react";

// Preferencia global de "audio en hover", persistida en localStorage.
// Cualquier componente puede leerla y mantenerse sincronizado con cambios
// hechos desde otros componentes en la misma pestaña (custom event) o
// en otras pestañas (storage event).

const KEY = "imperio_audio_pref";
const EVENT = "imperio:audio-change";

function readPref(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(KEY);
  if (v == null) return true; // default ON
  return v === "1";
}

export function useAudioPref(): readonly [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(readPref());
    const sync = () => setEnabled(readPref());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);

  function update(v: boolean) {
    localStorage.setItem(KEY, v ? "1" : "0");
    setEnabled(v);
    window.dispatchEvent(new Event(EVENT));
  }

  return [enabled, update] as const;
}
