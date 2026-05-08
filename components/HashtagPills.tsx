"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { HashtagSummary } from "@/lib/queries";

export function HashtagPills({
  hashtags,
  totalAcrossAll,
}: {
  hashtags: HashtagSummary[];
  totalAcrossAll: number;
}) {
  const sp = useSearchParams();
  const selected = sp.get("tag");

  function buildHref(tag: string | null): string {
    const next = new URLSearchParams(sp.toString());
    if (tag) next.set("tag", tag);
    else next.delete("tag");
    const qs = next.toString();
    return `/hashtags${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <Pill
        href={buildHref(null)}
        active={selected === null}
        label="Todos los hashtags"
        count={totalAcrossAll}
        emoji="🌐"
      />
      {hashtags.map((h) => (
        <Pill
          key={h.hashtag}
          href={buildHref(h.hashtag)}
          active={selected === h.hashtag}
          label={`#${h.hashtag}`}
          count={h.totalPosts}
        />
      ))}
    </div>
  );
}

function Pill({
  href,
  active,
  label,
  count,
  emoji,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  emoji?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors";
  const cls = active
    ? "border-purple-500 bg-purple-950/50 text-purple-200"
    : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500 hover:bg-neutral-800";

  return (
    <Link href={href} className={`${base} ${cls}`}>
      {emoji && <span>{emoji}</span>}
      <span className="font-medium">{label}</span>
      <span
        className={
          "rounded px-1.5 py-0.5 text-[10px] font-mono " +
          (active ? "bg-purple-900 text-purple-200" : "bg-neutral-800 text-neutral-400")
        }
      >
        {count}
      </span>
    </Link>
  );
}
