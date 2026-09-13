import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { getCanonicalMerchantId } from "../lib/canonicalMerchant";
import { landingPageSchema } from "../../shared/schemas/landingPage";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function LandingPageEditor() {
  const { id } = useParams();
  const isNew = id === "new" || id === undefined;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) return;
    supabase
      .from("landing_pages")
      .select("slug, title, description, price, images, status")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setSlug(data.slug);
        setSlugEdited(true);
        setTitle(data.title);
        setDescription(data.description ?? "");
        setPrice(String(data.price));
        setImages((data.images as string[] | null) ?? []);
        setStatus(data.status);
        setLoading(false);
      });
  }, [id, isNew]);

  async function handleImageUpload(file: File) {
    if (!user || images.length >= 4) return;
    setUploading(true);
    setError(null);
    const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("landing-page-images").upload(path, file);
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("landing-page-images").getPublicUrl(path);
    setImages((prev) => [...prev, data.publicUrl]);
    setUploading(false);
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((img) => img !== url));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = landingPageSchema.safeParse({
      slug,
      title,
      description,
      images,
      price: Number(price),
      status,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Données invalides.");
      return;
    }

    setSubmitting(true);
    const payload = {
      slug: parsed.data.slug,
      title: parsed.data.title,
      description: parsed.data.description || null,
      images: parsed.data.images,
      price: parsed.data.price,
      status: parsed.data.status,
    };

    // Both admin accounts share one business: new pages always belong to the
    // canonical merchant (the one with Yalidine credentials configured), and
    // editing an existing page never reassigns its owner.
    const { error: saveError } = isNew
      ? await supabase.from("landing_pages").insert({ ...payload, merchant_id: await getCanonicalMerchantId() })
      : await supabase.from("landing_pages").update(payload).eq("id", id);

    setSubmitting(false);

    if (saveError) {
      setError(
        saveError.code === "23505" ? "Ce lien est déjà utilisé par une autre page." : saveError.message,
      );
      return;
    }

    navigate("/dashboard/landing-pages");
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Chargement…</p>;
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">{isNew ? "Créer une landing page" : "Modifier la page"}</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div>
          <label className="block text-sm font-medium text-slate-700">Titre</label>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Lien (slug)</label>
          <div className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            <span>/</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugEdited(true);
              }}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Description</label>
          <textarea
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Prix (DA)</label>
          <input
            type="number"
            min="0"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Images ({images.length}/4)</label>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {images.map((url) => (
              <div key={url} className="relative">
                <img src={url} alt="" className="h-20 w-full rounded-md object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {images.length < 4 && (
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImageUpload(file);
                e.target.value = "";
              }}
              className="mt-2 text-sm"
            />
          )}
          {uploading && <p className="text-xs text-slate-500">Envoi en cours…</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Statut</label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "published")}
          >
            <option value="draft">Brouillon</option>
            <option value="published">Publiée</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting || uploading}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
