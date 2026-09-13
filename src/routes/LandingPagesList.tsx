import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";

interface LandingPageRow {
  id: string;
  slug: string;
  title: string;
  price: number;
  status: "draft" | "published" | "out_of_stock";
  created_at: string;
}

const STATUS_LABELS: Record<LandingPageRow["status"], string> = {
  draft: "Brouillon",
  published: "Publiée",
  out_of_stock: "Stock épuisé",
};

const STATUS_COLORS: Record<LandingPageRow["status"], string> = {
  draft: "text-amber-600",
  published: "text-green-700",
  out_of_stock: "text-red-600",
};

export function LandingPagesList() {
  const { user } = useAuth();
  const [pages, setPages] = useState<LandingPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function refresh() {
    const { data } = await supabase
      .from("landing_pages")
      .select("id, slug, title, price, status, created_at")
      .order("created_at", { ascending: false });
    setPages(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleDelete(page: LandingPageRow) {
    setActionError(null);

    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("landing_page_id", page.id);

    const confirmMessage =
      count && count > 0
        ? `"${page.title}" a ${count} commande(s) associée(s). Elles seront conservées mais perdront leur lien vers cette page. Supprimer quand même ? Cette action est irréversible.`
        : `Supprimer définitivement la page "${page.title}" ? Cette action est irréversible.`;
    if (!window.confirm(confirmMessage)) return;

    setDeletingId(page.id);
    const { error } = await supabase.from("landing_pages").delete().eq("id", page.id);
    setDeletingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    void refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Landing pages</h1>
        <Link
          to="/dashboard/landing-pages/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Créer une page
        </Link>
      </div>

      {actionError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}

      {loading && <p className="text-sm text-slate-500">Chargement…</p>}

      {!loading && pages.length === 0 && (
        <p className="text-sm text-slate-500">Aucune landing page pour le moment.</p>
      )}

      <div className="divide-y divide-slate-200 rounded-lg bg-white shadow-sm">
        {pages.map((page) => (
          <div key={page.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium text-slate-900">{page.title}</p>
              <p className="text-sm text-slate-500">
                /{page.slug} · {page.price} DA ·{" "}
                <span className={STATUS_COLORS[page.status]}>{STATUS_LABELS[page.status]}</span>
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {page.status !== "draft" && (
                <a href={`/${page.slug}`} target="_blank" rel="noreferrer" className="text-slate-500 underline">
                  Voir
                </a>
              )}
              <Link to={`/dashboard/landing-pages/${page.id}`} className="font-medium text-slate-900 underline">
                Modifier
              </Link>
              <button
                onClick={() => void handleDelete(page)}
                disabled={deletingId === page.id}
                className="font-medium text-red-700 underline disabled:opacity-50"
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
