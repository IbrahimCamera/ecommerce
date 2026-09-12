-- merchant_id is denormalized from landing_pages.merchant_id at insert time
-- (by the create-order Edge Function) so RLS policies here don't need a join.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  landing_page_id uuid not null references public.landing_pages (id) on delete restrict,
  merchant_id uuid not null references public.profiles (id) on delete cascade,
  public_order_id text not null unique,
  firstname text not null,
  familyname text not null,
  contact_phone text not null,
  address text not null,
  to_wilaya_id integer not null,
  to_wilaya_name text not null,
  to_commune_id integer not null,
  to_commune_name text not null,
  is_stopdesk boolean not null,
  stopdesk_center_id integer,
  price numeric not null check (price >= 0),
  delivery_fee numeric not null check (delivery_fee >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'pushed', 'failed', 'cancelled')),
  failure_reason text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stopdesk_center_required check (
    (is_stopdesk = false and stopdesk_center_id is null)
    or (is_stopdesk = true and stopdesk_center_id is not null)
  )
);

create index orders_merchant_id_idx on public.orders (merchant_id);
create index orders_landing_page_id_idx on public.orders (landing_page_id);
create index orders_status_idx on public.orders (status);

alter table public.orders enable row level security;

create trigger set_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create policy "orders_select_own_or_admin"
  on public.orders for select
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin());

create policy "orders_update_own"
  on public.orders for update
  to authenticated
  using (merchant_id = auth.uid())
  with check (merchant_id = auth.uid());

-- No insert policy for authenticated/anon: rows are only created by the
-- create-order Edge Function (Lot 2) using the service role key, after Zod
-- validation, honeypot and IP rate-limiting checks.
