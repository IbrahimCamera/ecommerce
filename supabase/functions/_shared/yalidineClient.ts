// Thin fetch wrapper around api.yalidine.app, shared by every Edge Function
// that talks to Yalidine. Handles:
//  - the X-API-ID / X-API-TOKEN headers (never touched by the browser),
//  - reading the x-*-quota-left headers documented in "Rate Limits",
//  - retrying 429 (honoring Retry-After) and 5xx with exponential backoff.
//
// Not used for POST /parcels in later lots — that call must stay a single
// attempt: idempotency there is handled at the order_id level, and blindly
// retrying a POST could create a duplicate parcel.

const YALIDINE_BASE_URL = "https://api.yalidine.app/v1";

export interface YalidineQuota {
  secondLeft: number | null;
  minuteLeft: number | null;
  hourLeft: number | null;
  dayLeft: number | null;
}

export interface YalidineResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  quota: YalidineQuota;
  errorMessage: string | null;
}

function readQuota(headers: Headers): YalidineQuota {
  const num = (name: string) => {
    const value = headers.get(name);
    return value === null ? null : Number(value);
  };
  return {
    secondLeft: num("x-second-quota-left"),
    minuteLeft: num("x-minute-quota-left"),
    hourLeft: num("x-hour-quota-left"),
    dayLeft: num("x-day-quota-left"),
  };
}

export async function yalidineRequest<T>(
  apiId: string,
  apiToken: string,
  path: string,
  init: RequestInit = {},
  options: { maxRetries?: number } = {},
): Promise<YalidineResult<T>> {
  const maxRetries = options.maxRetries ?? 3;
  let attempt = 0;

  while (true) {
    const response = await fetch(`${YALIDINE_BASE_URL}${path}`, {
      ...init,
      headers: {
        "X-API-ID": apiId,
        "X-API-TOKEN": apiToken,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    const quota = readQuota(response.headers);

    if (response.status === 429 || response.status >= 500) {
      attempt += 1;
      if (attempt > maxRetries) {
        return {
          ok: false,
          status: response.status,
          data: null,
          quota,
          errorMessage: response.status === 429
            ? "Quota Yalidine dépassé, réessayez plus tard."
            : `Erreur serveur Yalidine (${response.status}).`,
        };
      }
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null;
      const backoffMs = retryAfterSeconds !== null && !Number.isNaN(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : 2 ** attempt * 500;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    if (!response.ok) {
      // Yalidine's exact error body shape for 4xx isn't documented; we try a
      // best-effort ".message" read and otherwise fall back to a status-code
      // message that is still specific, never a generic "something went wrong".
      let message = `Erreur Yalidine (${response.status}).`;
      try {
        const body: unknown = await response.json();
        if (
          body !== null &&
          typeof body === "object" &&
          "message" in body &&
          typeof (body as Record<string, unknown>).message === "string"
        ) {
          message = (body as Record<string, unknown>).message as string;
        }
      } catch {
        // Body wasn't JSON — keep the generic status-code message above.
      }
      return { ok: false, status: response.status, data: null, quota, errorMessage: message };
    }

    const data = (await response.json()) as T;
    return { ok: true, status: response.status, data, quota, errorMessage: null };
  }
}
