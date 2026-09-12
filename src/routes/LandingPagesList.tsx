import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";

interface LandingPageRow {
  id: string;
  slug: string;
  title: string;
  price: number;
  status: "draft" | "published";
  created_at: string;
}

export function LandingPagesList() {
  const { user } = useAuth();
  const [pages, setPages] = useState<LandingPageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("landing_pages")
      .select("id, slug, title, price, status, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setPages(data ?? []);
        setLoading(false);
      });
  }, [user]);

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
                <span className={page.status === "published" ? "text-green-700" : "text-amber-600"}>
                  {page.status === "published" ? "Publiée" : "Brouillon"}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {page.status === "published" && (
                <a href={`/${page.slug}`} target="_blank" rel="noreferrer" className="text-slate-500 underline">
                  Voir
                </a>
              )}
              <Link to={`/dashboard/landing-pages/${page.id}`} className="font-medium text-slate-900 underline">
                Modifier
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
