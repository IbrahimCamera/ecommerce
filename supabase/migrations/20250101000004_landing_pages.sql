create table public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text,
  images jsonb not null default '[]'::jsonb,
  price numeric not null check (price >= 0),
  active_fields jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index landing_pages_merchant_id_idx on public.landing_pages (merchant_id);

alter table public.landing_pages enable row level security;

create trigger set_landing_pages_updated_at
  before update on public.landing_pages
  for each row execute function public.set_updated_at();

create policy "landing_pages_select_own_or_admin"
  on public.landing_pages for select
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin());

-- The one and only anon-readable table in the whole schema, per the
-- project's non-negotiable RLS rule.
create policy "landing_pages_select_published_anon"
  on public.landing_pages for select
  to anon
  using (status = 'published');

create policy "landing_pages_insert_own"
  on public.landing_pages for insert
  to authenticated
  with check (merchant_id = auth.uid());

create policy "landing_pages_update_own"
  on public.landing_pages for update
  to authenticated
  using (merchant_id = auth.uid())
  with check (merchant_id = auth.uid());

create policy "landing_pages_delete_own"
  on public.landing_pages for delete
  to authenticated
  using (merchant_id = auth.uid());
