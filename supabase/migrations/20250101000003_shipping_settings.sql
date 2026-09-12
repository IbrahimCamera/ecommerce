-- One shipping origin per merchant. No default values for weight/dimensions:
-- the row is only created once the merchant explicitly submits the form.
create table public.shipping_settings (
  merchant_id uuid primary key references public.profiles (id) on delete cascade,
  from_wilaya_id integer not null,
  from_wilaya_name text not null,
  default_freeshipping boolean not null,
  default_is_stopdesk boolean not null,
  default_weight numeric not null check (default_weight > 0),
  default_length numeric not null check (default_length > 0),
  default_width numeric not null check (default_width > 0),
  default_height numeric not null check (default_height > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shipping_settings enable row level security;

create trigger set_shipping_settings_updated_at
  before update on public.shipping_settings
  for each row execute function public.set_updated_at();

create policy "shipping_settings_select_own_or_admin"
  on public.shipping_settings for select
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin());

create policy "shipping_settings_insert_own"
  on public.shipping_settings for insert
  to authenticated
  with check (merchant_id = auth.uid());

create policy "shipping_settings_update_own"
  on public.shipping_settings for update
  to authenticated
  using (merchant_id = auth.uid())
  with check (merchant_id = auth.uid());
