import { queryPosts } from "@/lib/queries";
import { PostCard } from "@/components/PostCard";

export const dynamic = "force-dynamic";

export default function ShortlistPage() {
  const posts = queryPosts({
    decision: "replicate",
    sort: "postedAt",
  });

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold">📌 Shortlist — Para replicar</h1>
        <p className="text-sm text-neutral-400">
          Posts que marcaste con ✓ Replicar. Ordenados por más recientes.
        </p>
      </header>

      <div className="text-sm text-neutral-400">
        <strong className="text-white">{posts.length}</strong> post(s) en tu shortlist
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
          Aún no has marcado nada como "Replicar". Entra a un perfil y revisa
          sus virales.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}
