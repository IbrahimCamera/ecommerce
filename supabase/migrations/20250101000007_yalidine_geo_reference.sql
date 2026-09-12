-- DEVIATION FROM THE INITIAL SPEC, FLAGGED FOR VALIDATION:
-- the spec described a single "yalidine_geo_cache" table (wilayas, communes,
-- centers, deliveryfees, updated_at). Wilayas/communes/centers are stored
-- here as normalized tables instead of JSONB blobs, so the public order form
-- (Lot 2) can filter communes by wilaya_id and stopdesk centers by
-- commune_id with an indexed query instead of parsing a multi-thousand-row
-- JSON payload on every page load. deliveryfees is handled separately in the
-- next migration, scoped by merchant_id.

create table public.yalidine_wilayas (
  id integer primary key,
  name text not null,
  zone integer not null,
  is_deliverable boolean not null,
  synced_at timestamptz not null default now()
);

create table public.yalidine_communes (
  id integer primary key,
  name text not null,
  wilaya_id integer not null references public.yalidine_wilayas (id),
  wilaya_name text not null,
  has_stop_desk boolean not null,
  is_deliverable boolean not null,
  delivery_time_parcel integer,
  delivery_time_payment integer,
  synced_at timestamptz not null default now()
);

create index yalidine_communes_wilaya_id_idx on public.yalidine_communes (wilaya_id);

create table public.yalidine_centers (
  center_id integer primary key,
  name text not null,
  address text,
  gps text,
  commune_id integer not null references public.yalidine_communes (id),
  commune_name text not null,
  wilaya_id integer not null,
  wilaya_name text not null,
  synced_at timestamptz not null default now()
);

create index yalidine_centers_commune_id_idx on public.yalidine_centers (commune_id);

alter table public.yalidine_wilayas enable row level security;
alter table public.yalidine_communes enable row level security;
alter table public.yalidine_centers enable row level security;

-- Shared reference data: readable by any authenticated merchant (shipping
-- settings, landing page builder), never by anon. The public order form
-- reads it through an Edge Function instead (Lot 2), so this table stays
-- consistent with "no table accessible to anon except published landing
-- pages" even though the data itself isn't sensitive.
create policy "yalidine_wilayas_select_authenticated"
  on public.yalidine_wilayas for select to authenticated using (true);

create policy "yalidine_communes_select_authenticated"
  on public.yalidine_communes for select to authenticated using (true);

create policy "yalidine_centers_select_authenticated"
  on public.yalidine_centers for select to authenticated using (true);

-- Writes only via the sync-yalidine-geo Edge Function (service role, cron).
