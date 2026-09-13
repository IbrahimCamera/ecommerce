import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { getCanonicalMerchantId } from "../lib/canonicalMerchant";
import { shippingSettingsSchema } from "../../shared/schemas/shippingSettings";

interface Wilaya {
  id: number;
  name: string;
}

export function SettingsShipping() {
  const { user } = useAuth();
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [fromWilayaId, setFromWilayaId] = useState<number | "">("");
  const [defaultFreeshipping, setDefaultFreeshipping] = useState(false);
  const [defaultIsStopdesk, setDefaultIsStopdesk] = useState(false);
  const [defaultWeight, setDefaultWeight] = useState("");
  const [defaultLength, setDefaultLength] = useState("");
  const [defaultWidth, setDefaultWidth] = useState("");
  const [defaultHeight, setDefaultHeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from("yalidine_wilayas")
      .select("id, name")
      .order("name")
      .then(({ data }) => setWilayas(data ?? []));
  }, []);

  useEffect(() => {
    if (!user) return;
    getCanonicalMerchantId()
      .then((merchantId) => supabase.from("shipping_settings").select("*").eq("merchant_id", merchantId).maybeSingle())
      .then(({ data }) => {
        if (!data) return;
        setFromWilayaId(data.from_wilaya_id);
        setDefaultFreeshipping(data.default_freeshipping);
        setDefaultIsStopdesk(data.default_is_stopdesk);
        setDefaultWeight(String(data.default_weight));
        setDefaultLength(String(data.default_length));
        setDefaultWidth(String(data.default_width));
        setDefaultHeight(String(data.default_height));
      });
  }, [user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const wilaya = wilayas.find((w) => w.id === fromWilayaId);
    const parsed = shippingSettingsSchema.safeParse({
      fromWilayaId,
      fromWilayaName: wilaya?.name ?? "",
      defaultFreeshipping,
      defaultIsStopdesk,
      defaultWeight: Number(defaultWeight),
      defaultLength: Number(defaultLength),
      defaultWidth: Number(defaultWidth),
      defaultHeight: Number(defaultHeight),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Données invalides.");
      return;
    }

    setSubmitting(true);
    const { error: upsertError } = await supabase.from("shipping_settings").upsert({
      merchant_id: await getCanonicalMerchantId(),
      from_wilaya_id: parsed.data.fromWilayaId,
      from_wilaya_name: parsed.data.fromWilayaName,
      default_freeshipping: parsed.data.defaultFreeshipping,
      default_is_stopdesk: parsed.data.defaultIsStopdesk,
      default_weight: parsed.data.defaultWeight,
      default_length: parsed.data.defaultLength,
      default_width: parsed.data.defaultWidth,
      default_height: parsed.data.defaultHeight,
    });
    setSubmitting(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setSuccess("Adresse d'expédition enregistrée.");
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Adresse d'expédition</h1>
        <p className="text-sm text-slate-500">
          Utilisée pour calculer les frais de livraison et pré-remplir vos colis. Partagée par les deux comptes admin.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>}

        <div>
          <label className="block text-sm font-medium text-slate-700">Wilaya d'expédition</label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            value={fromWilayaId}
            onChange={(e) => setFromWilayaId(e.target.value ? Number(e.target.value) : "")}
            required
          >
            <option value="" disabled>
              Sélectionner…
            </option>
            {wilayas.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {wilayas.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              Aucune wilaya en cache pour le moment — connectez d'abord vos identifiants Yalidine et attendez la
              synchronisation quotidienne.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Poids par défaut (kg)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={defaultWeight}
              onChange={(e) => setDefaultWeight(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Longueur (cm)</label>
            <input
              type="number"
              step="1"
              min="0"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={defaultLength}
              onChange={(e) => setDefaultLength(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Largeur (cm)</label>
            <input
              type="number"
              step="1"
              min="0"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={defaultWidth}
              onChange={(e) => setDefaultWidth(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Hauteur (cm)</label>
            <input
              type="number"
              step="1"
              min="0"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={defaultHeight}
              onChange={(e) => setDefaultHeight(e.target.value)}
              required
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={defaultIsStopdesk}
            onChange={(e) => setDefaultIsStopdesk(e.target.checked)}
          />
          Livraison stop-desk par défaut
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={defaultFreeshipping}
            onChange={(e) => setDefaultFreeshipping(e.target.checked)}
          />
          Livraison gratuite par défaut (à la charge du marchand)
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
