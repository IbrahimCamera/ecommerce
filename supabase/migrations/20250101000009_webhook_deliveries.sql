-- Built on in Lot 4. Table created now so the full schema exists upfront.
create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  merchant_id uuid references public.profiles (id) on delete set null,
  signature_valid boolean not null,
  processed_at timestamptz,
  raw jsonb not null,
  created_at timestamptz not null default now()
);

create index webhook_deliveries_merchant_idx on public.webhook_deliveries (merchant_id);

alter table public.webhook_deliveries enable row level security;

create policy "webhook_deliveries_select_own_or_admin"
  on public.webhook_deliveries for select
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin());

-- Inserts/updates only via the public webhook Edge Function (service role).
