import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { createOrderSchema } from "../../shared/schemas/order";

interface LandingPageData {
  title: string;
  description: string | null;
  images: string[];
  price: number;
  status: "published" | "out_of_stock";
}

interface Wilaya {
  id: number;
  name: string;
}
interface Commune {
  id: number;
  name: string;
  has_stop_desk: boolean;
}
interface Center {
  center_id: number;
  name: string;
  address: string;
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function callFunction<T>(name: string, body?: unknown, method: "GET" | "POST" = "POST"): Promise<T> {
  const url = method === "GET" ? `${FUNCTIONS_URL}/${name}` : `${FUNCTIONS_URL}/${name}`;
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(json.error ?? "Une erreur est survenue.");
  }
  return json;
}

export function PublicLandingPage() {
  const { slug } = useParams();
  const [page, setPage] = useState<LandingPageData | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);

  const [firstname, setFirstname] = useState("");
  const [familyname, setFamilyname] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [toWilayaId, setToWilayaId] = useState<number | "">("");
  const [toCommuneId, setToCommuneId] = useState<number | "">("");
  const [isStopdesk, setIsStopdesk] = useState(false);
  const [stopdeskCenterId, setStopdeskCenterId] = useState<number | "">("");
  const [website, setWebsite] = useState(""); // honeypot

  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ publicOrderId: string; total: number } | null>(null);

  useEffect(() => {
    if (!slug) return;
    supabase
      .from("landing_pages")
      .select("title, description, images, price, status")
      .eq("slug", slug)
      .in("status", ["published", "out_of_stock"])
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setNotFound(true);
          return;
        }
        setPage({ ...data, images: (data.images as string[] | null) ?? [] });
      });
  }, [slug]);

  useEffect(() => {
    callFunction<{ data: Wilaya[] }>("public-geo?resource=wilayas", undefined, "GET")
      .then((res) => setWilayas(res.data))
      .catch(() => setWilayas([]));
  }, []);

  useEffect(() => {
    setCommunes([]);
    setToCommuneId("");
    if (!toWilayaId) return;
    callFunction<{ data: Commune[] }>(`public-geo?resource=communes&wilaya_id=${toWilayaId}`, undefined, "GET")
      .then((res) => setCommunes(res.data))
      .catch(() => setCommunes([]));
  }, [toWilayaId]);

  // Reset stop-desk mode whenever the selected commune doesn't offer it —
  // otherwise switching to such a commune left the form stuck showing the
  // (now empty) center dropdown with the address field still hidden.
  useEffect(() => {
    const commune = communes.find((c) => c.id === toCommuneId);
    if (!commune?.has_stop_desk) setIsStopdesk(false);
  }, [toCommuneId, communes]);

  useEffect(() => {
    setCenters([]);
    setStopdeskCenterId("");
    if (!toCommuneId || !isStopdesk) return;
    callFunction<{ data: Center[] }>(`public-geo?resource=centers&commune_id=${toCommuneId}`, undefined, "GET")
      .then((res) => setCenters(res.data))
      .catch(() => setCenters([]));
  }, [toCommuneId, isStopdesk]);

  useEffect(() => {
    setDeliveryFee(null);
    setFeeError(null);
    if (!slug || !toWilayaId || !toCommuneId) return;
    callFunction<{ deliveryFee: number }>("calculate-fee", {
      slug,
      toWilayaId,
      toCommuneId,
      isStopdesk,
    })
      .then((res) => setDeliveryFee(res.deliveryFee))
      .catch((err: Error) => setFeeError(err.message));
  }, [slug, toWilayaId, toCommuneId, isStopdesk]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    // Stop-desk pickup: the buyer has no home address to give, and Yalidine
    // still requires a non-empty "address" field, so we send the center's
    // own address instead of asking for one that wouldn't be used anyway.
    const selectedCenter = centers.find((c) => c.center_id === stopdeskCenterId);
    const effectiveAddress = isStopdesk ? selectedCenter?.address || selectedCenter?.name || "Retrait en stop-desk" : address;

    const parsed = createOrderSchema.safeParse({
      landingPageSlug: slug,
      firstname,
      familyname,
      contactPhone,
      address: effectiveAddress,
      toWilayaId,
      toCommuneId,
      isStopdesk,
      stopdeskCenterId: isStopdesk ? toCommuneId && stopdeskCenterId : undefined,
      website,
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Données invalides.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await callFunction<{ publicOrderId: string; total: number }>("create-order", parsed.data);
      setConfirmation(res);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Page introuvable.</div>
    );
  }

  if (!page) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Chargement…</div>;
  }

  if (confirmation) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Commande confirmée !</h1>
        <p className="text-slate-600">Numéro de commande : <span className="font-mono font-medium">{confirmation.publicOrderId}</span></p>
        <p className="text-slate-600">Total : {confirmation.total} DA</p>
        <p className="text-sm text-slate-400">Vous serez contacté(e) pour confirmer la livraison.</p>
      </div>
    );
  }

  const total = page.price + (deliveryFee ?? 0);

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      {page.images[0] && <img src={page.images[0]} alt={page.title} className="w-full rounded-lg object-cover" />}
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">{page.title}</h1>
      {page.description && <p className="mt-2 whitespace-pre-line text-slate-600">{page.description}</p>}
      <p className="mt-2 text-xl font-semibold text-slate-900">{page.price} DA</p>

      {page.status === "out_of_stock" ? (
        <p className="mt-6 rounded-lg bg-red-50 p-4 text-center text-sm font-medium text-red-700">
          Rupture de stock. Cet article n'est plus disponible à la commande pour le moment.
        </p>
      ) : (
      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Passer commande</h2>

        {formError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}

        {/*
          Honeypot: real users never see or fill this. Deliberately avoids
          `name="website"` / off-screen-positioning-only hiding — both are
          common autofill triggers, and a browser that autofills the whole
          form (name/phone/address) can end up filling an off-screen field
          too and get a legitimate buyer flagged as a bot. `display: none`
          plus a name unrelated to any known autofill field is more reliable.
        */}
        <div style={{ display: "none" }} aria-hidden="true">
          <input
            type="text"
            name="hp_confirmation_code"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Prénom</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={firstname}
              onChange={(e) => setFirstname(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Nom</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={familyname}
              onChange={(e) => setFamilyname(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Téléphone</label>
          <input
            type="tel"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="05 XX XX XX XX"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Wilaya</label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={toWilayaId}
            onChange={(e) => setToWilayaId(e.target.value ? Number(e.target.value) : "")}
            required
          >
            <option value="" disabled>Sélectionner…</option>
            {wilayas.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Commune</label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={toCommuneId}
            onChange={(e) => setToCommuneId(e.target.value ? Number(e.target.value) : "")}
            disabled={!toWilayaId}
            required
          >
            <option value="" disabled>Sélectionner…</option>
            {communes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {!isStopdesk && (
          <div>
            <label className="block text-sm font-medium text-slate-700">Adresse</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>
        )}

        {communes.find((c) => c.id === toCommuneId)?.has_stop_desk && (
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" checked={!isStopdesk} onChange={() => setIsStopdesk(false)} />
              Livraison à domicile
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={isStopdesk} onChange={() => setIsStopdesk(true)} />
              Retrait en stop-desk
            </label>
          </div>
        )}

        {isStopdesk && (
          <div>
            <label className="block text-sm font-medium text-slate-700">Centre stop-desk</label>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={stopdeskCenterId}
              onChange={(e) => setStopdeskCenterId(e.target.value ? Number(e.target.value) : "")}
              required
            >
              <option value="" disabled>Sélectionner…</option>
              {centers.map((c) => (
                <option key={c.center_id} value={c.center_id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span>Produit</span><span>{page.price} DA</span></div>
          <div className="flex justify-between">
            <span>Livraison</span>
            <span>{deliveryFee !== null ? `${deliveryFee} DA` : "—"}</span>
          </div>
          {feeError && <p className="mt-1 text-xs text-red-600">{feeError}</p>}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold">
            <span>Total</span><span>{total} DA</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !toWilayaId || !toCommuneId}
          className="w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Envoi…" : "Confirmer la commande"}
        </button>
      </form>
      )}
    </div>
  );
}
