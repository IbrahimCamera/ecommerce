-- Delivery fees are scoped per merchant_id: it wasn't confirmed whether
-- Yalidine's commercial terms (cod_percentage, insurance_percentage,
-- tariffs per commune) are identical across every reseller account, so
-- caching them globally could show a wrong price to some merchants. If this
-- is later confirmed to be a shared national grid, this can be simplified to
-- a global cache without merchant_id.

create table public.yalidine_delivery_fees (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.profiles (id) on delete cascade,
  from_wilaya_id integer not null,
  from_wilaya_name text not null,
  to_wilaya_id integer not null,
  to_wilaya_name text not null,
  zone integer not null,
  retour_fee integer not null,
  cod_percentage numeric not null,
  insurance_percentage numeric not null,
  oversize_fee integer not null,
  synced_at timestamptz not null default now(),
  unique (merchant_id, from_wilaya_id, to_wilaya_id)
);

create index yalidine_delivery_fees_merchant_idx on public.yalidine_delivery_fees (merchant_id);

create table public.yalidine_delivery_fees_communes (
  id uuid primary key default gen_random_uuid(),
  delivery_fee_id uuid not null references public.yalidine_delivery_fees (id) on delete cascade,
  commune_id integer not null,
  commune_name text not null,
  express_home integer,
  express_desk integer,
  economic_home integer,
  economic_desk integer,
  unique (delivery_fee_id, commune_id)
);

create index yalidine_delivery_fees_communes_fee_idx on public.yalidine_delivery_fees_communes (delivery_fee_id);

alter table public.yalidine_delivery_fees enable row level security;
alter table public.yalidine_delivery_fees_communes enable row level security;

create policy "yalidine_delivery_fees_select_own_or_admin"
  on public.yalidine_delivery_fees for select
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin());

create policy "yalidine_delivery_fees_communes_select_own_or_admin"
  on public.yalidine_delivery_fees_communes for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.yalidine_delivery_fees f
      where f.id = yalidine_delivery_fees_communes.delivery_fee_id
        and f.merchant_id = auth.uid()
    )
  );

-- Writes only via the sync-yalidine-geo Edge Function (service role, cron).
