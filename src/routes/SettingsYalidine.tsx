import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { yalidineCredentialsInputSchema } from "../../shared/schemas/yalidineCredentials";

interface CredentialsStatus {
  api_id_last4: string | null;
  is_active: boolean;
  last_checked_at: string | null;
  last_check_status: "ok" | "error" | null;
  last_check_message: string | null;
}

export function SettingsYalidine() {
  const { user } = useAuth();
  const [status, setStatus] = useState<CredentialsStatus | null>(null);
  const [apiId, setApiId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("yalidine_credentials")
      .select("api_id_last4, is_active, last_checked_at, last_check_status, last_check_message")
      .eq("merchant_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setStatus(data);
        setLoadingStatus(false);
      });
  }, [user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const parsed = yalidineCredentialsInputSchema.safeParse({ apiId, apiToken });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Données invalides.");
      return;
    }

    setSubmitting(true);
    const { data, error: invokeError } = await supabase.functions.invoke("yalidine-credentials", {
      body: parsed.data,
    });
    setSubmitting(false);

    if (invokeError) {
      // Edge Functions return a non-2xx body we still want to surface verbatim
      // (e.g. the exact Yalidine error) instead of the generic FunctionsError.
      const context = (invokeError as { context?: Response }).context;
      if (context) {
        try {
          const body = await context.clone().json();
          setError(body.error ?? invokeError.message);
        } catch {
          setError(invokeError.message);
        }
      } else {
        setError(invokeError.message);
      }
      return;
    }

    if (data?.error) {
      setError(data.error as string);
      return;
    }

    setSuccess("Connexion à Yalidine réussie.");
    setApiId("");
    setApiToken("");
    const { data: refreshed } = await supabase
      .from("yalidine_credentials")
      .select("api_id_last4, is_active, last_checked_at, last_check_status, last_check_message")
      .eq("merchant_id", user!.id)
      .maybeSingle();
    setStatus(refreshed);
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Identifiants Yalidine</h1>
        <p className="text-sm text-slate-500">
          Vos clés sont testées avant d'être enregistrées, puis chiffrées. Elles ne sont jamais réaffichées en clair.
        </p>
      </div>

      {!loadingStatus && status && (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm">
          <p className="font-medium text-slate-900">
            Clé actuelle : {status.api_id_last4 ? `****${status.api_id_last4}` : "aucune"}
          </p>
          <p className={status.is_active ? "text-green-700" : "text-red-700"}>
            {status.is_active ? "Connexion active" : "Connexion inactive"}
            {status.last_check_message ? ` — ${status.last_check_message}` : ""}
          </p>
          {status.last_checked_at && (
            <p className="text-slate-400">Dernier test : {new Date(status.last_checked_at).toLocaleString("fr-DZ")}</p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>}

        <div>
          <label className="block text-sm font-medium text-slate-700">X-API-ID</label>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            value={apiId}
            onChange={(e) => setApiId(e.target.value)}
            autoComplete="off"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">X-API-TOKEN</label>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            autoComplete="off"
            required
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Test en cours…" : "Tester et enregistrer"}
        </button>
      </form>
    </div>
  );
}
