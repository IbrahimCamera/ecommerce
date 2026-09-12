-- Last known Yalidine rate-limit quota per merchant, read from the
-- x-*-quota-left response headers after every call (see Rate Limits docs).
create table public.yalidine_api_quota (
  merchant_id uuid primary key references public.profiles (id) on delete cascade,
  second_left integer,
  minute_left integer,
  hour_left integer,
  day_left integer,
  updated_at timestamptz not null default now()
);

alter table public.yalidine_api_quota enable row level security;

create policy "yalidine_api_quota_select_own_or_admin"
  on public.yalidine_api_quota for select
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin());

-- Admin-visible API error log (role: "Admin: ... logs d'erreurs API").
create table public.yalidine_api_errors (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.profiles (id) on delete set null,
  endpoint text not null,
  status_code integer,
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index yalidine_api_errors_merchant_idx on public.yalidine_api_errors (merchant_id);

alter table public.yalidine_api_errors enable row level security;

create policy "yalidine_api_errors_select_own_or_admin"
  on public.yalidine_api_errors for select
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin());

-- Retry queue for calls that failed after their internal backoff retries
-- (429/5xx), per the "file d'attente pour les échecs" requirement. Lot 1
-- only ever inserts task_type = 'sync_fees'; push-to-yalidine (Lot 3) will
-- reuse it for failed parcel creations.
create table public.yalidine_retry_queue (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.profiles (id) on delete cascade,
  task_type text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now()
);

create index yalidine_retry_queue_next_attempt_idx on public.yalidine_retry_queue (next_attempt_at);

alter table public.yalidine_retry_queue enable row level security;

create policy "yalidine_retry_queue_select_admin"
  on public.yalidine_retry_queue for select
  to authenticated
  using (public.is_admin());

-- All three tables are written only by Edge Functions using the service
-- role key.
