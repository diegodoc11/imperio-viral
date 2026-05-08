import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostById } from "@/lib/queries";
import { TierBadge, EngagementBadge } from "@/components/TierBadge";
import { MediaViewer } from "@/components/MediaViewer";
import { DecisionButtons } from "@/components/DecisionButtons";
import { BackButton } from "@/components/BackButton";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = getPostById(id);
  if (!post) notFound();

  const plays = post.videoViewCount ?? post.videoPlayCount;
  const ageDays = ((Date.now() / 1000 - post.postedAt) / 86400).toFixed(1);

  return (
    <div className="flex flex-col gap-5">
      {/* Navegación */}
      <div className="flex items-center gap-3">
        <BackButton fallbackHref="/posts" />
        {post.sourceProfile && (
          <Link
            href={`/profiles/${post.sourceProfile}`}
            className="text-sm text-neutral-400 hover:text-white"
          >
            Ir al perfil de @{post.sourceProfile} →
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Columna izquierda — Media */}
        <div>
          <MediaViewer post={post} />

          {/* Caption */}
          {post.caption && (
            <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <h3 className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
                Caption
              </h3>
              <p className="whitespace-pre-line text-sm text-neutral-200">
                {post.caption}
              </p>
              {post.hashtags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {post.hashtags.map((h) => (
                    <span
                      key={h}
                      className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
                    >
                      #{h}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Columna derecha — Métricas + decisiones */}
        <aside className="flex flex-col gap-4">
          {/* Header */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex items-center gap-2">
              {post.viralTier && (
                <TierBadge
                  tier={post.viralTier}
                  multiplier={post.viralidadMultiplier}
                />
              )}
              <span className="ml-auto text-xs text-neutral-500">
                {post.type} · {ageDays}d ago
              </span>
            </div>

            {post.ownerUsername && (
              <Link
                href={`/profiles/${post.ownerUsername}`}
                className="mt-2 block text-base font-semibold hover:underline"
              >
                @{post.ownerUsername}
              </Link>
            )}

            {/* Métricas */}
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row
                label="Likes"
                value={
                  post.likesCount === -1
                    ? "ocultos por el autor"
                    : fmtCount(post.likesCount)
                }
                icon="❤️"
              />
              <Row
                label="Comments"
                value={fmtCount(post.commentsCount)}
                icon="💬"
              />
              {plays != null ? (
                <Row label="Plays" value={fmtCount(plays)} icon="▶️" />
              ) : (
                <div className="rounded border border-neutral-800 bg-neutral-900/50 p-2 text-[11px] leading-snug text-neutral-400">
                  ⓘ Instagram no expone <strong>alcance/impresiones</strong> para
                  fotos y carruseles a usuarios externos. Solo el dueño de la
                  cuenta lo ve. Para comparar viralidad entre tipos, usa el{" "}
                  <strong>multiplicador</strong> (siguiente bloque).
                </div>
              )}
              {post.sharesCount != null && (
                <Row
                  label="Shares"
                  value={fmtCount(post.sharesCount)}
                  icon="🔁"
                />
              )}
              {post.viralidadMultiplier != null && (
                <Row
                  label="vs. mediana del perfil"
                  value={`${post.viralidadMultiplier.toFixed(1)}×`}
                  icon="📊"
                />
              )}
              {post.ownerFollowersCount != null && (
                <Row
                  label="Followers del autor"
                  value={fmtCount(post.ownerFollowersCount)}
                  icon="👥"
                />
              )}
              {post.viewsPerFollower != null && (
                <Row
                  label="Views / Followers"
                  value={`${post.viewsPerFollower.toFixed(2)}×${post.viewsPerFollower >= 5 ? " 🚀" : ""}`}
                  icon="📈"
                />
              )}
              {post.viewRate != null && (
                <Row
                  label="View rate (compl.)"
                  value={`${post.viewRate.toFixed(2)}%`}
                  icon="👀"
                />
              )}
              <div className="pt-2">
                <EngagementBadge rate={post.engagementRate} />
              </div>
            </dl>
          </div>

          {/* Audio (solo reels) */}
          {(post.musicArtist || post.musicTrack) && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
              <h3 className="mb-1 text-xs uppercase tracking-wider text-neutral-500">
                🎵 Audio
              </h3>
              <div className="text-neutral-200">
                {post.musicTrack ?? "—"}
              </div>
              {post.musicArtist && (
                <div className="text-xs text-neutral-400">
                  por {post.musicArtist}
                </div>
              )}
            </div>
          )}

          {/* Decisiones */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <h3 className="mb-3 text-xs uppercase tracking-wider text-neutral-500">
              Decisión
            </h3>
            <DecisionButtons
              postId={post.id}
              initialDecision={post.decision}
              initialNotes={post.decisionNotes}
            />
          </div>

          {/* Link a IG */}
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-center text-sm text-blue-400 hover:bg-neutral-900"
          >
            Abrir en Instagram ↗
          </a>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="flex justify-between border-b border-neutral-900 py-1 last:border-0">
      <span className="text-neutral-400">
        {icon} {label}
      </span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function fmtCount(n: number | null | undefined): string {
  if (n == null || n < 0) return "—";
  return n.toLocaleString();
}
