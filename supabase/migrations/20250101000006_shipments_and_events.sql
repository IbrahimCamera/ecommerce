create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  tracking text unique,
  label_url text,
  payload_sent jsonb,
  response jsonb,
  last_status text,
  last_status_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shipments_tracking_idx on public.shipments (tracking);

alter table public.shipments enable row level security;

create trigger set_shipments_updated_at
  before update on public.shipments
  for each row execute function public.set_updated_at();

create policy "shipments_select_own_or_admin"
  on public.shipments for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = shipments.order_id and o.merchant_id = auth.uid()
    )
  );

-- No insert/update policy for authenticated/anon: only the push-to-yalidine
-- and webhook Edge Functions (Lots 3-4) write here, via service role.

create table public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  tracking text not null,
  status text not null,
  reason text,
  status_date timestamptz not null,
  raw jsonb not null,
  created_at timestamptz not null default now(),
  unique (tracking, status, status_date)
);

create index shipment_events_shipment_id_idx on public.shipment_events (shipment_id);

alter table public.shipment_events enable row level security;

create policy "shipment_events_select_own_or_admin"
  on public.shipment_events for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.shipments s
      join public.orders o on o.id = s.order_id
      where s.id = shipment_events.shipment_id and o.merchant_id = auth.uid()
    )
  );
