"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Decision } from "@/lib/types";

export function DecisionButtons({
  postId,
  initialDecision,
  initialNotes,
}: {
  postId: string;
  initialDecision: Decision | null;
  initialNotes: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [decision, setDecision] = useState<Decision | null>(initialDecision);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [savedFlash, setSavedFlash] = useState(false);

  async function save(d: Decision | null) {
    setDecision(d);
    const res = await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, decision: d, notes }),
    });
    if (res.ok) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
      startTransition(() => router.refresh());
    }
  }

  async function saveNotes() {
    if (!decision) return; // notas solo si hay decisión
    await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, decision, notes }),
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Btn
          active={decision === "replicate"}
          activeClass="bg-emerald-600 hover:bg-emerald-500"
          onClick={() => save(decision === "replicate" ? null : "replicate")}
        >
          ✓ Replicar
        </Btn>
        <Btn
          active={decision === "maybe"}
          activeClass="bg-yellow-600 hover:bg-yellow-500"
          onClick={() => save(decision === "maybe" ? null : "maybe")}
        >
          ? Tal vez
        </Btn>
        <Btn
          active={decision === "skip"}
          activeClass="bg-red-700 hover:bg-red-600"
          onClick={() => save(decision === "skip" ? null : "skip")}
        >
          ✕ Skip
        </Btn>
      </div>
      <div>
        <textarea
          className="h-20 w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-blue-500 focus:outline-none"
          placeholder="Notas: hook que me gustó, ángulo a adaptar, audio trending, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
        />
        <div className="mt-1 text-xs text-neutral-500">
          {savedFlash ? "✓ Guardado" : isPending ? "Sincronizando…" : "Las notas se guardan al hacer clic fuera"}
        </div>
      </div>
    </div>
  );
}

function Btn({
  active,
  activeClass,
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md px-3 py-2 text-sm font-medium transition-colors " +
        (active
          ? `${activeClass} text-white`
          : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700")
      }
    >
      {children}
    </button>
  );
}
